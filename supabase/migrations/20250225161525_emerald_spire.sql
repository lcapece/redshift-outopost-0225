/*
  # Database Checkpoint Alpha

  1. Overview
    Creates checkpoint tables to preserve the current state of the database
    and adds necessary policies for public access.

  2. New Tables
    - redshift_simulations_checkpoint_alpha
    - simulation_metrics_checkpoint_alpha

  3. Security
    - Enables RLS on checkpoint tables
    - Adds public access policies for checkpoint tables
*/

-- Create checkpoint tables
CREATE TABLE IF NOT EXISTS redshift_simulations_checkpoint_alpha (
  id uuid PRIMARY KEY,
  created_at timestamptz,
  llm_model text NOT NULL,
  sql_query text NOT NULL,
  query_plan text NOT NULL,
  complexity integer NOT NULL
);

CREATE TABLE IF NOT EXISTS simulation_metrics_checkpoint_alpha (
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
INSERT INTO redshift_simulations_checkpoint_alpha
SELECT * FROM redshift_simulations;

INSERT INTO simulation_metrics_checkpoint_alpha
SELECT * FROM simulation_metrics;

-- Enable RLS
ALTER TABLE redshift_simulations_checkpoint_alpha ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_metrics_checkpoint_alpha ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "Enable public access"
  ON redshift_simulations_checkpoint_alpha
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable public access"
  ON simulation_metrics_checkpoint_alpha
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);