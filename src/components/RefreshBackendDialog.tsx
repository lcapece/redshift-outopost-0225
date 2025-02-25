import React, { useState, useEffect } from 'react';
import { supabase, checkClaudeData } from '../services/supabase';
import { generateBatchSimulations } from '../services/openRouter';
import { RefreshCw, Trash2, Plus, AlertCircle } from 'lucide-react';

interface ModelCount {
  llm_model: string;
  count: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function RefreshBackendDialog({ isOpen, onClose }: Props) {
  const [modelCounts, setModelCounts] = useState<ModelCount[]>([]);
  const [selectedModel, setSelectedModel] = useState('anthropic/claude-2');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [claudeCount, setClaudeCount] = useState<number | null>(null);

  const fetchModelCounts = async () => {
    try {
      const { data, error } = await supabase
        .from('redshift_simulations')
        .select('llm_model');

      if (error) throw error;

      // Calculate counts manually
      const counts = data.reduce((acc: { [key: string]: number }, curr) => {
        acc[curr.llm_model] = (acc[curr.llm_model] || 0) + 1;
        return acc;
      }, {});

      const modelCountsData = Object.entries(counts).map(([llm_model, count]) => ({
        llm_model,
        count
      }));

      setModelCounts(modelCountsData);

      // Check specifically for Claude 2 data
      const claudeData = await checkClaudeData();
      setClaudeCount(claudeData);
    } catch (error) {
      console.error('Error fetching model counts:', error);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchModelCounts();
    }
  }, [isOpen]);

  const handleReplaceAndRefresh = async () => {
    setIsLoading(true);
    setProgress({ current: 0, total: 20 });
    try {
      // Delete all existing simulations
      await supabase.from('redshift_simulations').delete().neq('id', '');
      // Generate new simulations
      await generateBatchSimulations(20, selectedModel, (current) => {
        setProgress({ current, total: 20 });
      });
      await fetchModelCounts();
    } catch (error) {
      console.error('Error replacing simulations:', error);
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  };

  const handleAddMore = async () => {
    setIsLoading(true);
    setProgress({ current: 0, total: 20 });
    try {
      await generateBatchSimulations(20, selectedModel, (current) => {
        setProgress({ current, total: 20 });
      });
      await fetchModelCounts();
    } catch (error) {
      console.error('Error adding simulations:', error);
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-semibold mb-4">Backend Data Status</h2>
        
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Current Data Sets</h3>
          <div className="space-y-2">
            {modelCounts.map((model) => (
              <div key={model.llm_model} className="flex justify-between items-center text-sm">
                <span className="font-mono">{model.llm_model}</span>
                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                  {model.count} sets
                </span>
              </div>
            ))}
            {modelCounts.length === 0 && (
              <div className="flex items-center text-amber-600 text-sm">
                <AlertCircle className="h-4 w-4 mr-2" />
                No data sets available
              </div>
            )}
            {claudeCount !== null && claudeCount === 0 && (
              <div className="mt-2 text-sm text-amber-600 bg-amber-50 p-2 rounded">
                <AlertCircle className="h-4 w-4 inline mr-2" />
                No Claude 2 data found. Consider adding some examples.
              </div>
            )}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select LLM Model
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full rounded-md border border-gray-300 shadow-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          >
            <option value="anthropic/claude-2">Claude 2</option>
            <option value="anthropic/claude-3.7-sonnet">Claude 3.7 Sonnet</option>
            <option value="anthropic/claude-instant-v1">Claude Instant</option>
            <option value="google/palm-2-chat-bison">PaLM 2 Chat</option>
            <option value="meta-llama/llama-2-70b-chat">Llama 2 70B</option>
            <option value="openai/chatgpt-4o-latest">GPT-4 Turbo</option>
          </select>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleReplaceAndRefresh}
            disabled={isLoading}
            className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Replace & Refresh
          </button>
          <button
            onClick={handleAddMore}
            disabled={isLoading}
            className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add More
          </button>
        </div>

        {isLoading && progress && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>
                <RefreshCw className="h-4 w-4 animate-spin inline mr-2" />
                Generating simulations...
              </span>
              <span>{progress.current} of {progress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full text-center text-sm text-gray-600 hover:text-gray-900"
        >
          Close
        </button>
      </div>
    </div>
  );
}