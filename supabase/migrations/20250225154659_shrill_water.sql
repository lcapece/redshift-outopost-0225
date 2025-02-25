-- Drop existing policies
DROP POLICY IF EXISTS "Allow read access to all users" ON redshift_simulations;
DROP POLICY IF EXISTS "Allow read access to all users" ON simulation_metrics;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON redshift_simulations;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON redshift_simulations;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON redshift_simulations;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON simulation_metrics;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON simulation_metrics;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON simulation_metrics;

-- Create new policies for redshift_simulations
CREATE POLICY "Enable public access"
  ON redshift_simulations
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Create new policies for simulation_metrics
CREATE POLICY "Enable public access"
  ON simulation_metrics
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);