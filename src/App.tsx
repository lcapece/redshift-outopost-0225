import React, { useState, useEffect } from 'react';
import { FileText, RefreshCw, Brain, TestTube2, Gauge, Copy, CheckCircle, Clipboard, Database, AlertTriangle } from 'lucide-react';
import { generateQueryAndPlan, generateHaiku } from './services/openRouter';
import { extractTables, extractJoins } from './services/sqlParser';
import { RefreshBackendDialog } from './components/RefreshBackendDialog';
import { supabase } from './services/supabase';

const AI_MODELS = [
  { id: 'anthropic/claude-2', name: 'Claude 2' },
  { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet' },
  { id: 'anthropic/claude-instant-v1', name: 'Claude Instant' },
  { id: 'google/palm-2-chat-bison', name: 'PaLM 2 Chat' },
  { id: 'meta-llama/llama-2-70b-chat', name: 'Llama 2 70B' },
  { id: 'meta-llama/llama-2-13b-chat', name: 'Llama 2 13B' },
  { id: 'mistral-ai/mistral-7b-instruct', name: 'Mistral 7B' },
  { id: 'gryphe/mythological-cobra', name: 'MythCobra' },
  { id: 'nousresearch/nous-hermes-llama2-13b', name: 'Nous Hermes' },
  { id: 'perplexity/pplx-70b-chat', name: 'PPLX 70B' },
  { id: 'phind/phind-codellama-34b', name: 'Phind CodeLlama' },
  { id: 'openai/chatgpt-4o-latest', name: 'GPT-4 Turbo' }
];

interface TableInfo {
  name: string;
  schema: string;
  isView: boolean;
}

interface TableMetrics {
  dbname: string;
  schemaname: string;
  tablename: string;
  encoded: boolean;
  diststyle: string;
  dist_key?: string;
  sortkey1: string;
  sortkey1_enc: string;
  sortkey_num: number;
  size_gb: number;
  pct_empty: number;
  unsorted_pct: number;
  stats_off: number;
  tbl_rows: number;
  skew_sortkey1: number;
  skew_rows: number;
  estimated_visible_rows: number;
  risk_event: string;
}

interface JoinInfo {
  leftTable: string;
  rightTable: string;
  leftColumn: string;
  rightColumn: string;
  joinType: string;
}

function truncateText(text: string, maxLength: number = 12): string {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - 3) + '...';
}

function generateRealisticSkew(): number {
  const rand = Math.random();
  if (rand < 0.5) return 1.00;  // 50% chance
  if (rand < 0.75) return 1.01 + Math.random() * 1.99;  // 25% chance (1.01-3.00)
  if (rand < 0.87) return 3.01 + Math.random() * 1.99;  // 12% chance (3.01-5.00)
  return 5.01 + Math.random() * 4.99;  // 13% chance (5.01-10.00)
}

function generateDistStyle(joins: JoinInfo[]): { style: string; key?: string } {
  const rand = Math.random();
  
  if (rand < 0.6 && joins.length > 0) {  // 60% chance of KEY if there are joins
    const join = joins[Math.floor(Math.random() * joins.length)];
    return { 
      style: 'KEY',
      key: Math.random() < 0.5 ? join.leftColumn : join.rightColumn
    };
  }
  
  if (rand < 0.8) {  // 20% chance of EVEN (or 80% if no joins)
    return { style: 'EVEN' };
  }
  
  return { style: 'ALL' };  // 20% chance of ALL
}

function getMetricColor(value: number, type: 'stats' | 'sorted' | 'skew'): string {
  if (type === 'stats') {
    if (value < 50) return 'text-red-600';
    if (value < 80) return 'text-amber-600';
    return 'text-green-600';
  }
  if (type === 'sorted') {
    if (value < 65) return 'text-red-600';
    if (value < 85) return 'text-amber-600';
    return 'text-green-600';
  }
  if (type === 'skew') {
    if (value > 5) return 'text-red-600';
    if (value > 2) return 'text-amber-600';
    return 'text-green-600';
  }
  return '';
}

function generateTableMetrics(tables: TableInfo[], sqlQuery: string): TableMetrics[] {
  const risks = ['HIGH_SKEW', 'STALE_STATS', 'MISSING_SORTKEY', 'UNEVEN_SLICES', ''];
  
  return tables.map(table => {
    const isView = table.name.startsWith('v_');
    const isFact = table.name.toLowerCase().includes('fact');
    const baseRows = isFact ? Math.floor(Math.random() * 9000000000) + 1000000000 : Math.floor(Math.random() * 100000000) + 100000;
    const distInfo = generateDistStyle([]);
    
    return {
      dbname: 'DATAWAREHOUSE',
      schemaname: table.schema,
      tablename: table.name,
      encoded: Math.random() > 0.1,
      diststyle: distInfo.style,
      dist_key: distInfo.key,
      sortkey1: Math.random() > 0.3 ? 'date_id' : '',
      sortkey1_enc: 'az64',
      sortkey_num: Math.random() > 0.3 ? 1 : 0,
      size_gb: Number((baseRows * 0.0000001 * (Math.random() + 0.5)).toFixed(2)),
      pct_empty: Math.random() * 15,
      unsorted_pct: Math.random() * 40,
      stats_off: Math.random() * 25,
      tbl_rows: baseRows,
      skew_sortkey1: generateRealisticSkew(),
      skew_rows: generateRealisticSkew(),
      estimated_visible_rows: Math.floor(baseRows * (0.8 + Math.random() * 0.4)),
      risk_event: risks[Math.floor(Math.random() * risks.length)]
    };
  });
}

function App() {
  const [queryPlan, setQueryPlan] = useState('');
  const [sqlQuery, setSqlQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0].id);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [haiku, setHaiku] = useState<string | null>(null);
  const [isTestingLLM, setIsTestingLLM] = useState(false);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [complexity, setComplexity] = useState(3);
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const [tableMetrics, setTableMetrics] = useState<TableMetrics[]>([]);
  const [joins, setJoins] = useState<JoinInfo[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isRefreshDialogOpen, setIsRefreshDialogOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: modelData, error: modelError } = await supabase
          .from('redshift_simulations')
          .select('llm_model');

        if (modelError) {
          console.error('Supabase query error:', modelError);
          setAvailableModels(AI_MODELS.map(m => m.id));
          setSelectedModel(AI_MODELS[0].id);
          setError('Error fetching models. Using default model list.');
          return;
        }

        if (!modelData || modelData.length === 0) {
          setAvailableModels(AI_MODELS.map(m => m.id));
          setSelectedModel(AI_MODELS[0].id);
          setError('No example data available in the backend. Please use the Refresh Backend button to generate examples.');
          return;
        }

        const uniqueModels = Array.from(new Set(modelData.map(d => d.llm_model)));
        setAvailableModels(uniqueModels);
        setSelectedModel(uniqueModels[0]);
      } catch (error) {
        console.error('Error fetching data:', error);
        setAvailableModels(AI_MODELS.map(m => m.id));
        setSelectedModel(AI_MODELS[0].id);
        setError('Failed to connect to the backend. Using default model list.');
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    const extractedTables = extractTables(sqlQuery);
    setTables(extractedTables);
    const metrics = generateTableMetrics(extractedTables, sqlQuery);
    setTableMetrics(metrics);
  }, [sqlQuery]);

  const handleCreateExample = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Get total count of examples for the selected model and complexity
      const { count } = await supabase
        .from('redshift_simulations')
        .select('*', { count: 'exact', head: true })
        .eq('llm_model', selectedModel)
        .eq('complexity', complexity);

      if (!count) {
        throw new Error('No examples available for the selected model and complexity');
      }

      // Get a random offset
      const randomOffset = Math.floor(Math.random() * count);

      // Fetch a random example using the offset
      const { data, error } = await supabase
        .from('redshift_simulations')
        .select('sql_query, query_plan')
        .eq('llm_model', selectedModel)
        .eq('complexity', complexity)
        .range(randomOffset, randomOffset)
        .single();

      if (error) throw error;
      if (!data) throw new Error('No examples found');

      setSqlQuery(data.sql_query);
      setQueryPlan(data.query_plan.replace(/QUERY PLAN\s*-+\s*/g, '').trim());
      
      // Generate a new example with joins analysis
      const { sql, plan, joins: newJoins } = await generateQueryAndPlan(selectedModel, complexity);
      
      const extractedTables = extractTables(sql);
      setTables(extractedTables);
      setTableMetrics(generateTableMetrics(extractedTables, sql));
      setJoins(newJoins);
    } catch (err) {
      setError('Failed to fetch example. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestLLM = async () => {
    setIsTestingLLM(true);
    setError(null);
    try {
      const generatedHaiku = await generateHaiku(selectedModel);
      setHaiku(generatedHaiku);
    } catch (err) {
      setError('Failed to generate haiku. Please try again.');
      console.error(err);
    } finally {
      setIsTestingLLM(false);
    }
  };

  const handleToggleView = (tableName: string, schema: string) => {
    setTables(prevTables =>
      prevTables.map(table =>
        table.name === tableName && table.schema === schema
          ? { ...table, isView: !table.isView }
          : table
      )
    );
  };

  const handleIngestClipboard = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      try {
        const metricsData = JSON.parse(clipboardText);
        if (Array.isArray(metricsData)) {
          setTableMetrics(metricsData);
        } else {
          setError('Invalid metrics data format');
        }
      } catch (err) {
        setError('Failed to parse clipboard data');
      }
    } catch (err) {
      setError('Failed to read clipboard');
    }
  };

  const getComplexityLabel = (value: number) => {
    const labels = {
      1: 'Simplest',
      2: 'Simple',
      3: 'Moderate',
      4: 'Complex',
      5: 'Very Complex'
    };
    return labels[value as keyof typeof labels];
  };

  const handleCopyRefs = async () => {
    const viewRefs = tables
      .filter(t => t.isView)
      .map(t => `'${t.schema}.${t.name}'`)
      .join(',');
    
    const referenceQuery = `select "database" as dbname,"schema" as schemaname,"table" as tablename,encoded,"diststyle",sortkey1,sortkey1_enc,sortkey_num,"size" as size_gb,"empty" as pct_empty,unsorted as unsorted_pct,stats_off,tbl_rows,skew_sortkey1,skew_rows,estimated_visible_rows,risk_event from svv_table_info l where "schema" || '.' || "table" in (${viewRefs || "''"})`;

    try {
      await navigator.clipboard.writeText(referenceQuery);
      setShowCopySuccess(true);
      setTimeout(() => setShowCopySuccess(false), 3000);
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  const filteredTableMetrics = tableMetrics.filter(metric => 
    !tables.find(t => 
      t.name === metric.tablename && 
      t.schema === metric.schemaname && 
      t.isView
    )
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-lg h-[66vh] border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <div className="flex flex-col h-full py-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <FileText className="h-8 w-8 text-indigo-600" />
                <h1 className="text-2xl font-bold text-gray-900">Query Analysis</h1>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setIsRefreshDialogOpen(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Database className="h-4 w-4 mr-2" />
                  Refresh Backend
                </button>
                <div className="flex items-center space-x-2">
                  <Brain className="h-5 w-5 text-purple-600" />
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="block w-56 rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
                    disabled={isLoading || isTestingLLM}
                  >
                    {availableModels.map((modelId) => {
                      const model = AI_MODELS.find(m => m.id === modelId);
                      return (
                        <option key={modelId} value={modelId}>
                          {model?.name || modelId}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="flex items-center space-x-2">
                  <Gauge className="h-5 w-5 text-indigo-600" />
                  <div className="flex flex-col">
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={complexity}
                      onChange={(e) => setComplexity(parseInt(e.target.value))}
                      className="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      disabled={isLoading || isTestingLLM}
                    />
                    <span className="text-xs text-gray-600 mt-1 text-center">
                      Complexity: {getComplexityLabel(complexity)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleTestLLM}
                  disabled={isTestingLLM || isLoading}
                  className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                    isTestingLLM ? 'bg-purple-400' : 'bg-purple-600 hover:bg-purple-700'
                  } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500`}
                >
                  <TestTube2 className={`h-4 w-4 mr-2 ${isTestingLLM ? 'animate-spin' : ''}`} />
                  {isTestingLLM ? 'Testing...' : 'Test LLM'}
                </button>
                <button
                  onClick={handleCreateExample}
                  disabled={isLoading || isTestingLLM}
                  className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                    isLoading ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700'
                  } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  {isLoading ? 'Generating...' : 'Create Example'}
                </button>
              </div>
            </div>
            
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {haiku && (
              <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-md">
                <h3 className="text-sm font-medium text-purple-800 mb-2">Redshift Haiku:</h3>
                <p className="text-sm text-purple-900 whitespace-pre-line font-mono">{haiku}</p>
              </div>
            )}
            
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div className="flex flex-col">
                <h2 className="text-lg font-semibold text-gray-700 mb-2">SQL Statement</h2>
                <textarea
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  placeholder="Enter your SQL query here..."
                  className="flex-1 p-4 text-sm font-mono bg-gray-50 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  spellCheck="false"
                />
              </div>

              <div className="flex flex-col">
                <h2 className="text-lg font-semibold text-gray-700 mb-2">Query Execution Plan</h2>
                <textarea
                  value={queryPlan}
                  onChange={(e) => setQueryPlan(e.target.value)}
                  placeholder="Paste your query execution plan here..."
                  className="flex-1 p-4 text-sm font-mono bg-gray-50 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  spellCheck="false"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="space-y-4">
          <div className="bg-white rounded shadow">
            <div className="flex justify-between items-center p-3 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Tables and Views</h2>
              <button
                onClick={handleCopyRefs}
                className={`relative inline-flex items-center px-3 py-1.5 text-sm font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 ${
                  tables.length > 0 ? 'animate-[pulse_1s_ease-in-out_infinite]' : ''
                }`}
                style={{
                  boxShadow: tables.length > 0 ? '0 0 0 2px rgba(220, 38, 38, 0.5)' : 'none'
                }}
                disabled={tables.length === 0}
              >
                {showCopySuccess ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-1.5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1.5" />
                    COPY REFS
                  </>
                )}
              </button>
            </div>
            {showCopySuccess && (
              <div className="fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
                Please execute the SQL in your clipboard
              </div>
            )}
            <div className="p-3">
              {tables.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                  {tables.map((table) => (
                    <div
                      key={`${table.schema}.${table.name}`}
                      className="flex items-center space-x-1.5 px-2 py-1 bg-gray-50 rounded border border-gray-100"
                    >
                      <input
                        type="checkbox"
                        id={`view-${table.schema}.${table.name}`}
                        checked={table.isView}
                        onChange={() => handleToggleView(table.name, table.schema)}
                        className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                      <label
                        htmlFor={`view-${table.schema}.${table.name}`}
                        className="flex-1 text-xs font-medium text-gray-700 cursor-pointer truncate"
                      >
                        <span className="text-gray-500">{table.schema}.</span>{table.name}
                        {table.isView && (
                          <span className="ml-1 inline-flex items-center px-1 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700">
                            View
                          </span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  No tables or views detected in the query.
                </p>
              )}
            </div>
          </div>

          <div className="bg-white rounded shadow">
            <div className="flex justify-between items-center p-3 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Table Metrics</h2>
              <button
                onClick={handleIngestClipboard}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Clipboard className="h-4 w-4 mr-1.5" />
                Ingest Clipboard
              </button>
            </div>
            <div className="p-3 overflow-x-auto">
              <div className="inline-block min-w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredTableMetrics.map((metric) => (
                    <div
                      key={`${metric.schemaname}.${metric.tablename}`}
                      className="bg-gray-50 rounded p-3 border border-gray-100"
                    >
                      <div className="mb-2">
                        <h3 className="font-medium text-sm text-gray-900">
                          {metric.schemaname}.{metric.tablename}
                        </h3>
                      </div>
                      <dl className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <dt className="text-gray-500">Rows</dt>
                          <dd className="font-mono">{metric.tbl_rows.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">Size</dt>
                          <dd className="font-mono">{metric.size_gb} GB</dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">Distribution</dt>
                          <dd className="font-mono">
                            {metric.diststyle === 'KEY' && metric.dist_key ? (
                              <span>KEY({truncateText(metric.dist_key)})</span>
                            ) : (
                              <span>{metric.diststyle}</span>
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">Sort Key</dt>
                          <dd className="font-mono">{metric.sortkey1 || 'None'}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">Stats Fresh</dt>
                          <dd className={`font-mono ${getMetricColor(100 - metric.stats_off, 'stats')}`}>
                            {(100 - metric.stats_off).toFixed(1)}%
                          </dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">Pct Sorted</dt>
                          <dd className={`font-mono ${getMetricColor(100 - metric.unsorted_pct, 'sorted')}`}>
                            {(100 - metric.unsorted_pct).toFixed(1)}%
                          </dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">Dist Skew</dt>
                          <dd className={`font-mono ${getMetricColor(metric.skew_rows, 'skew')}`}>
                            {metric.skew_rows.toFixed(2)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">Sort Skew</dt>
                          <dd className={`font-mono ${getMetricColor(metric.skew_sortkey1, 'skew')}`}>
                            {metric.skew_sortkey1.toFixed(2)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                  {filteredTableMetrics.length === 0 && (
                    <p className="text-sm text-gray-500">
                      No table metrics available. Generate an example or ingest from clipboard.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Joins Analysis Section */}
          <div className="bg-white rounded shadow">
            <div className="flex justify-between items-center p-3 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Joins Analysis</h2>
            </div>
            <div className="p-6">
              {joins.length > 0 ? (
                <div className="space-y-6">
                  {joins.map((join, index) => {
                    const leftMetrics = tableMetrics.find(m => m.tablename === join.leftTable);
                    const rightMetrics = tableMetrics.find(m => m.tablename === join.rightTable);
                    const hasLargeTable = (leftMetrics?.tbl_rows || 0) > 1000000 || (rightMetrics?.tbl_rows || 0) > 1000000;
                    const hasDistKeyMismatch = leftMetrics?.diststyle !== rightMetrics?.diststyle || 
                                             (leftMetrics?.diststyle === 'KEY' && rightMetrics?.diststyle === 'KEY' && 
                                              leftMetrics?.dist_key !== rightMetrics?.dist_key);

                    return (
                      <div key={index} className="relative">
                        {/* Join Line */}
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 border-t-2 border-gray-400">
                          {/* Arrow for outer joins */}
                          {join.joinType !== 'INNER' && (
                            <div className="absolute right-0 -mt-1.5 w-0 h-0 border-8 border-transparent border-r-gray-400" />
                          )}
                        </div>

                        <div className="flex justify-between items-center relative">
                          {/* Left Table */}
                          <div className="w-96 p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="font-mono text-sm">
                              <div className="font-semibold">{join.leftTable}.{join.leftColumn}</div>
                              <div>Rows: {leftMetrics?.tbl_rows.toLocaleString()}</div>
                              <div>Dist: {leftMetrics?.diststyle === 'KEY' ? (
                                <span>KEY({leftMetrics.dist_key || ''})</span>
                              ) : leftMetrics?.diststyle}</div>
                              <div>Sort: {leftMetrics?.sortkey1 || 'None'}</div>
                            </div>
                          </div>

                          {/* Join Type Label */}
                          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-white px-3 py-1 rounded-full border border-gray-300 text-sm font-medium">
                            {join.joinType}
                          </div>

                          {/* Right Table */}
                          <div className="w-96 p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="font-mono text-sm">
                              <div className="font-semibold">{join.rightTable}.{join.rightColumn}</div>
                              <div>Rows: {rightMetrics?.tbl_rows.toLocaleString()}</div>
                              <div>Dist: {rightMetrics?.diststyle === 'KEY' ? (
                                <span>KEY({rightMetrics.dist_key || ''})</span>
                              ) : rightMetrics?.diststyle}</div>
                              <div>Sort: {rightMetrics?.sortkey1 || 'None'}</div>
                            </div>
                          </div>
                        </div>

                        {/* Warnings */}
                        {(hasLargeTable || hasDistKeyMismatch) && (
                          <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                            <div className="flex items-start space-x-2">
                              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                              <div className="text-sm text-amber-800">
                                {hasLargeTable && (
                                  <p>Large table detected (1M+ rows). Consider optimizing distribution strategy.</p>
                                )}
                                {hasDistKeyMismatch && (
                                  <p>Distribution key mismatch may cause data movement between nodes.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  No joins detected in the current query.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <RefreshBackendDialog
        isOpen={isRefreshDialogOpen}
        onClose={() => setIsRefreshDialogOpen(false)}
      />
    </div>
  );
}

export default App;