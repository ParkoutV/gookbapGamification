import pg from 'pg';
const { Client } = pg;

const connectionString = 'postgresql://postgres.pglhlesnyfncaupiwkwz:QgndeMCBDga1JsWi@aws-1-ap-south-1.pooler.supabase.com:5432/postgres';

async function setupRls() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log("Connected to database. Setting up RLS for supported_languages...");

    const sql = `
      ALTER TABLE supported_languages ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "Anyone can select supported_languages" ON supported_languages;
      DROP POLICY IF EXISTS "Admins can modify supported_languages" ON supported_languages;
      DROP POLICY IF EXISTS "Admins can do everything on supported_languages" ON supported_languages;

      -- READ: Everyone
      CREATE POLICY "Anyone can select supported_languages" 
      ON supported_languages FOR SELECT 
      USING (true);

      -- ALL: Admins only
      CREATE POLICY "Admins can do everything on supported_languages" 
      ON supported_languages FOR ALL 
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM accounts 
          WHERE user_id = auth.uid() AND permission = 0
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM accounts 
          WHERE user_id = auth.uid() AND permission = 0
        )
      );
    `;

    await client.query(sql);
    console.log("RLS policies successfully applied to supported_languages.");
    
  } catch (error) {
    console.error("Error setting up RLS:", error);
  } finally {
    await client.end();
  }
}

setupRls();
