import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// WARNING: This client bypasses RLS. Only use in secure server environments (e.g. Server Actions).
// NEVER expose this to the browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
