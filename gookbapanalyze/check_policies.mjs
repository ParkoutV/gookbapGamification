import pg from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.pglhlesnyfncaupiwkwz:QgndeMCBDga1JsWi@aws-1-ap-south-1.pooler.supabase.com:5432/postgres';

async function checkPolicies() {
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query(`
      SELECT tablename, policyname, permissive, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE tablename IN ('accounts', 'branches', 'tracks');
    `);
    console.log(result.rows);
  } finally {
    await client.end();
  }
}

checkPolicies();
