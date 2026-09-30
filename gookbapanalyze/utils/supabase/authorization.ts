import 'server-only'
import { createClient } from './server'

// Use the anon key with the verified user's session; never bypass account RLS.
export async function authorizeDashboard(permissions: readonly number[] = [0, 1]) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false as const, status: 401, error: 'Unauthorized' }
  }

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('permission, assigned_branch_id')
    .eq('user_id', user.id)
    .single()

  if (accountError || !account || !permissions.includes(account.permission)) {
    return { ok: false as const, status: 403, error: 'Forbidden' }
  }

  return { ok: true as const, supabase, account }
}
