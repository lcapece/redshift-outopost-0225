/*
  # Update RLS policies for redshift_simulations

  1. Changes
    - Add INSERT policy for redshift_simulations
    - Add INSERT policy for simulation_metrics
    - Update existing SELECT policies to be more specific

  2. Security
    - Maintain RLS enabled on both tables
    - Allow authenticated users to read and write data
    - Prevent unauthorized access
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Allow read access to all users" ON redshift_simulations;
DROP POLICY IF EXISTS "Allow read access to all users" ON simulation_metrics;

-- Create new policies for redshift_simulations
CREATE POLICY "Enable read access for authenticated users"
  ON redshift_simulations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable insert access for authenticated users"
  ON redshift_simulations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enable delete access for authenticated users"
  ON redshift_simulations
  FOR DELETE
  TO authenticated
  USING (true);

-- Create new policies for simulation_metrics
CREATE POLICY "Enable read access for authenticated users"
  ON simulation_metrics
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable insert access for authenticated users"
  ON simulation_metrics
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enable delete access for authenticated users"
  ON simulation_metrics
  FOR DELETE
  TO authenticated
  USING (true);