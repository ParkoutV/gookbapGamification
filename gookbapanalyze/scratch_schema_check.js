const { Client } = require('pg');
const client = new Client('postgresql://postgres.pglhlesnyfncaupiwkwz:QgndeMCBDga1JsWi@aws-1-ap-south-1.pooler.supabase.com:5432/postgres');
client.connect().then(() => {
  return client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'supported_languages'");
}).then(res => {
  console.log(res.rows);
  return client.end();
}).catch(console.error);
