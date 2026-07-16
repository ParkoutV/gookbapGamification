import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://postgres.pglhlesnyfncaupiwkwz:QgndeMCBDga1JsWi@aws-1-ap-south-1.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'supported_languages';
  `);
  console.log("supported_languages schema:", res.rows);

  const res3 = await client.query(`
    SELECT * FROM supported_languages LIMIT 2;
  `);
  console.log("supported_languages sample:", res3.rows);

  await client.end();
}

main().catch(console.error);
