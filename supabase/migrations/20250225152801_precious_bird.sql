/*
  # Create checkpoint 202402251027AM

  1. Changes
    - Creates a checkpoint table to store backup data
    - Copies current data from redshift_simulations and simulation_metrics
    - Adds RLS policies for checkpoint table
*/

-- Create checkpoint table
CREATE TABLE IF NOT EXISTS redshift_simulations_checkpoint_202402251027am (
  id uuid PRIMARY KEY,
  created_at timestamptz,
  llm_model text NOT NULL,
  sql_query text NOT NULL,
  query_plan text NOT NULL,
  complexity integer NOT NULL
);

CREATE TABLE IF NOT EXISTS simulation_metrics_checkpoint_202402251027am (
  id uuid PRIMARY KEY,
  simulation_id uuid,
  dbname text NOT NULL,
  schemaname text NOT NULL,
  tablename text NOT NULL,
  encoded boolean NOT NULL,
  diststyle text NOT NULL,
  dist_key text,
  sortkey1 text,
  sortkey1_enc text,
  sortkey_num integer NOT NULL,
  size_gb numeric NOT NULL,
  pct_empty numeric NOT NULL,
  unsorted_pct numeric NOT NULL,
  stats_off numeric NOT NULL,
  tbl_rows bigint NOT NULL,
  skew_sortkey1 numeric NOT NULL,
  skew_rows numeric NOT NULL,
  estimated_visible_rows bigint NOT NULL,
  risk_event text
);

-- Copy current data to checkpoint tables
INSERT INTO redshift_simulations_checkpoint_202402251027am
SELECT * FROM redshift_simulations;

INSERT INTO simulation_metrics_checkpoint_202402251027am
SELECT * FROM simulation_metrics;

-- Enable RLS
ALTER TABLE redshift_simulations_checkpoint_202402251027am ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_metrics_checkpoint_202402251027am ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for authenticated users"
  ON redshift_simulations_checkpoint_202402251027am
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable read access for authenticated users"
  ON simulation_metrics_checkpoint_202402251027am
  FOR SELECT
  TO authenticated
  USING (true);