import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role to bypass RLS

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  console.log("Checking supported_languages with service role...");
  const { data: langs, error: err1 } = await supabase.from('supported_languages').select('*');
  if (err1) console.error(err1);
  else console.log(langs);
}

check();
