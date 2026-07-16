import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://postgres.pglhlesnyfncaupiwkwz:QgndeMCBDga1JsWi@aws-1-ap-south-1.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();
  
  // First, find the name of the foreign key constraint on branch_id
  const res = await client.query(`
    SELECT constraint_name
    FROM information_schema.key_column_usage
    WHERE table_name = 'tracks' AND column_name = 'branch_id'
      AND position_in_unique_constraint IS NOT NULL;
  `);
  
  const constraintName = res.rows.length > 0 ? res.rows[0].constraint_name : 'tracks_branch_id_fkey';
  console.log('Constraint name found:', constraintName);

  try {
    await client.query(`
      ALTER TABLE tracks 
      DROP CONSTRAINT IF EXISTS ${constraintName};
    `);
    
    await client.query(`
      ALTER TABLE tracks 
      ADD CONSTRAINT ${constraintName} 
      FOREIGN KEY (branch_id) REFERENCES branches(branch_id) ON DELETE CASCADE;
    `);
    console.log("Successfully applied ON DELETE CASCADE");
  } catch (e) {
    console.error("Error applying cascade:", e);
  }

  await client.end();
}

main().catch(console.error);
