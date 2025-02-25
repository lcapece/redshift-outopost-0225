/*
  # Create Redshift Simulations Schema

  1. New Tables
    - `redshift_simulations`
      - `id` (uuid, primary key)
      - `created_at` (timestamp)
      - `llm_model` (text)
      - `sql_query` (text)
      - `query_plan` (text)
      - `complexity` (integer)

    - `simulation_metrics`
      - `id` (uuid, primary key)
      - `simulation_id` (uuid, foreign key)
      - `dbname` (text)
      - `schemaname` (text)
      - `tablename` (text)
      - `encoded` (boolean)
      - `diststyle` (text)
      - `dist_key` (text)
      - `sortkey1` (text)
      - `sortkey1_enc` (text)
      - `sortkey_num` (integer)
      - `size_gb` (numeric)
      - `pct_empty` (numeric)
      - `unsorted_pct` (numeric)
      - `stats_off` (numeric)
      - `tbl_rows` (bigint)
      - `skew_sortkey1` (numeric)
      - `skew_rows` (numeric)
      - `estimated_visible_rows` (bigint)
      - `risk_event` (text)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to read all data
*/

-- Create redshift_simulations table
CREATE TABLE IF NOT EXISTS redshift_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  llm_model text NOT NULL,
  sql_query text NOT NULL,
  query_plan text NOT NULL,
  complexity integer NOT NULL
);

-- Create simulation_metrics table
CREATE TABLE IF NOT EXISTS simulation_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid REFERENCES redshift_simulations(id) ON DELETE CASCADE,
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

-- Enable RLS
ALTER TABLE redshift_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_metrics ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow read access to all users"
  ON redshift_simulations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow read access to all users"
  ON simulation_metrics
  FOR SELECT
  TO authenticated
  USING (true);