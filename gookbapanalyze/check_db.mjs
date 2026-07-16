import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  console.log("Checking supported_languages...");
  const { data: langs, error: err1 } = await supabase.from('supported_languages').select('*');
  if (err1) console.error(err1);
  else console.log(langs);
  
  console.log("Checking base_images...");
  const { data: base, error: err2 } = await supabase.from('base_images').select('title').limit(2);
  if (err2) console.error(err2);
  else console.log(JSON.stringify(base, null, 2));

  console.log("Checking parts...");
  const { data: parts, error: err3 } = await supabase.from('parts').select('name').limit(2);
  if (err3) console.error(err3);
  else console.log(JSON.stringify(parts, null, 2));
}

check();
