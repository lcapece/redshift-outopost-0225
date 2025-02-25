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

interface JoinAnalysis extends JoinInfo {
  status: 'optimal' | 'warning' | 'critical';
  statusMessage: string;
  optimization: string;
}

export function extractTables(sql: string): TableInfo[] {
  if (!sql) return [];

  // Convert to lowercase and remove comments
  const cleanSql = sql.toLowerCase()
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Regular expressions to match schema-qualified table references
  const fromRegex = /(?:from|join|update|into)\s+([a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z_][a-zA-Z0-9_]*(?:\s*,\s*(?:[a-zA-Z_][a-zA-Z0-9_]*\.)?[a-zA-Z_][a-zA-Z0-9_]*)*)/g;
  
  const tables = new Set<string>();
  let match;

  while ((match = fromRegex.exec(cleanSql)) !== null) {
    const tableList = match[2].split(',').map(t => t.trim());
    tableList.forEach(table => {
      const fullName = match[1] ? `${match[1].slice(0, -1)}.${table}` : table;
      tables.add(fullName);
    });
  }

  return Array.from(tables)
    .sort()
    .map(fullName => {
      const [schema, name] = fullName.includes('.') ? fullName.split('.') : ['public', fullName];
      return { 
        name,
        schema,
        isView: name.startsWith('v_') 
      };
    });
}

export function extractJoins(sql: string): JoinInfo[] {
  if (!sql) return [];

  // Convert to lowercase and remove comments
  const cleanSql = sql.toLowerCase()
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  const joins: JoinInfo[] = [];

  // Match both explicit JOIN syntax and implicit joins in WHERE clause
  const explicitJoinRegex = /(\w+(?:\.\w+)?)\s+(?:(inner|left|right|full|cross)\s+)?join\s+(\w+(?:\.\w+)?)\s+(?:as\s+\w+\s+)?on\s+(\w+(?:\.\w+)?)\s*=\s*(\w+(?:\.\w+)?)/gi;
  const implicitJoinRegex = /where.*?(\w+(?:\.\w+)?)\s*=\s*(\w+(?:\.\w+)?)/gi;

  // Process explicit JOINs
  let match;
  while ((match = explicitJoinRegex.exec(cleanSql)) !== null) {
    const [, leftFull, joinType = 'inner', rightFull, leftColFull, rightColFull] = match;
    
    const leftParts = leftFull.split('.');
    const rightParts = rightFull.split('.');
    const leftColParts = leftColFull.split('.');
    const rightColParts = rightColFull.split('.');

    joins.push({
      leftTable: leftParts[leftParts.length - 1],
      rightTable: rightParts[rightParts.length - 1],
      leftColumn: leftColParts[leftColParts.length - 1],
      rightColumn: rightColParts[rightColParts.length - 1],
      joinType: joinType.toUpperCase()
    });
  }

  // Process implicit joins in WHERE clause if no explicit joins found
  if (joins.length === 0) {
    const tables = extractTables(sql);
    while ((match = implicitJoinRegex.exec(cleanSql)) !== null) {
      const [, leftFull, rightFull] = match;
      const [leftTable, leftCol] = leftFull.split('.');
      const [rightTable, rightCol] = rightFull.split('.');

      // Only add if both parts are from different tables
      if (leftTable !== rightTable) {
        joins.push({
          leftTable,
          rightTable,
          leftColumn: leftCol,
          rightColumn: rightCol,
          joinType: 'INNER' // Implicit joins are always INNER joins
        });
      }
    }
  }

  return joins;
}

export function analyzeJoins(sql: string, tableMetrics: TableMetrics[]): JoinAnalysis[] {
  const joins = extractJoins(sql);
  
  return joins.map(join => {
    const leftMetrics = tableMetrics.find(m => m.tablename === join.leftTable);
    const rightMetrics = tableMetrics.find(m => m.tablename === join.rightTable);
    
    let status: 'optimal' | 'warning' | 'critical' = 'optimal';
    let statusMessage = 'Optimal join configuration';
    let optimization = 'No optimization needed';

    if (!leftMetrics || !rightMetrics) {
      return {
        ...join,
        status: 'warning',
        statusMessage: 'Missing table metrics',
        optimization: 'Verify table existence and permissions'
      };
    }

    const isSmallJoin = Math.max(leftMetrics.tbl_rows, rightMetrics.tbl_rows) < 100000;
    const hasMatchingDistKeys = leftMetrics.diststyle === rightMetrics.diststyle;
    const hasHighSkew = leftMetrics.skew_rows > 20 || rightMetrics.skew_rows > 20;
    const hasSortKeys = leftMetrics.sortkey1 && rightMetrics.sortkey1;
    const hasStaleStats = leftMetrics.stats_off > 10 || rightMetrics.stats_off > 10;

    if (!hasMatchingDistKeys && !isSmallJoin) {
      status = 'critical';
      statusMessage = 'Distribution key mismatch';
      optimization = 'Align distribution keys or redistribute smaller table';
    } else if (hasHighSkew) {
      status = 'warning';
      statusMessage = 'High data skew detected';
      optimization = 'Review distribution strategy and key selection';
    } else if (!hasSortKeys) {
      status = 'warning';
      statusMessage = 'Missing sort keys';
      optimization = 'Add sort keys to improve join performance';
    } else if (hasStaleStats) {
      status = 'warning';
      statusMessage = 'Stale statistics';
      optimization = 'Run ANALYZE to update table statistics';
    }

    return {
      ...join,
      status,
      statusMessage,
      optimization
    };
  });
}