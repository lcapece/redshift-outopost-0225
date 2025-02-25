import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface RedshiftSimulation {
  id: string;
  created_at: string;
  llm_model: string;
  sql_query: string;
  query_plan: string;
  complexity: number;
}

export interface SimulationMetrics {
  id: string;
  simulation_id: string;
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

export async function checkClaudeData(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('redshift_simulations')
      .select('*', { count: 'exact' })
      .eq('llm_model', 'anthropic/claude-2');

    if (error) {
      console.error('Error checking Claude data:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (error) {
    console.error('Error checking Claude data:', error);
    return 0;
  }
}

export async function generateBatchSimulations(count: number = 20): Promise<void> {
  // Implementation will be added in openRouter.ts
}