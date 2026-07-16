import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: accounts } = await supabase.from('accounts').select().limit(1)
  console.log('Accounts sample:', accounts)
  
  const { data: branches } = await supabase.from('branches').select().limit(1)
  console.log('Branches sample:', branches)
}

run()
