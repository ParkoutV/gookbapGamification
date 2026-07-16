import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role to bypass RLS

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  console.log("Checking part_categories...");
  const { data: cats, error: err1 } = await supabase.from('part_categories').select('*').limit(2);
  if (err1) console.error(err1);
  else console.log(JSON.stringify(cats, null, 2));

  console.log("Checking parts...");
  const { data: parts, error: err2 } = await supabase.from('parts').select('*').limit(2);
  if (err2) console.error(err2);
  else console.log(JSON.stringify(parts, null, 2));
}

check();
