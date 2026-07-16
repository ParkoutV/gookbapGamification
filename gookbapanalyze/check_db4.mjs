import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://postgres.pglhlesnyfncaupiwkwz:QgndeMCBDga1JsWi@aws-1-ap-south-1.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'tracks';
  `);
  console.log("tracks schema:", res.rows);

  const res2 = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'branches';
  `);
  console.log("branches schema:", res2.rows);

  // Fetch some sample data
  const res3 = await client.query(`SELECT * FROM tracks LIMIT 2;`);
  console.log("tracks sample:", res3.rows);

  const res4 = await client.query(`SELECT * FROM branches LIMIT 2;`);
  console.log("branches sample:", res4.rows);

  await client.end();
}

main().catch(console.error);
