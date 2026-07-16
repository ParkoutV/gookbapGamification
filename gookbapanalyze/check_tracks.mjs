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
  
  const res2 = await client.query(`SELECT * FROM tracks LIMIT 1`);
  console.log("track sample:", res2.rows);

  await client.end();
}

main().catch(console.error);
