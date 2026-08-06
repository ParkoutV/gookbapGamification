import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import SurveyManager from '@/components/SurveyManager'
import SurveySettingsToggle from './SurveySettingsToggle'

export default async function SurveysPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user permissions
  const { data: account } = await adminClient
    .from('accounts')
    .select('permission, assigned_branch_id')
    .eq('user_id', user.id)
    .single()

  const permission = account?.permission ?? 1
  const assignedBranchId = account?.assigned_branch_id

  // Fetch active languages
  const { data: languagesData } = await supabase
    .from('supported_languages')
    .select('lang_code, lang_name, is_active, order_index')
    .eq('is_active', true)
    .order('order_index', { ascending: true })

  const activeLanguages = languagesData || []

  // Fetch branches (for Phase 2 selection)
  // Admins can see all branches, branch users only see their own
  let branchesQuery = adminClient.from('branches').select('branch_id, branch_name')
  
  if (permission === 1 && assignedBranchId) {
    branchesQuery = branchesQuery.eq('branch_id', assignedBranchId)
  }

  const { data: branchesData } = await branchesQuery
  const branches = branchesData || []

  // Fetch survey settings
  const { data: settingsData } = await adminClient
    .from('survey_settings')
    .select('optional_survey_once')
    .eq('id', 1)
    .single()
  
  const optionalSurveyOnce = settingsData?.optional_survey_once ?? true

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">설문 관리</h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-1">게임 진행 과정에서 표시될 설문 문항을 관리합니다.</p>
        </div>
      </div>
      
      {permission === 0 && (
        <SurveySettingsToggle initialValue={optionalSurveyOnce} />
      )}

      <SurveyManager 
        permission={permission}
        assignedBranchId={assignedBranchId}
        activeLanguages={activeLanguages}
        branches={branches}
      />
    </div>
  )
}
