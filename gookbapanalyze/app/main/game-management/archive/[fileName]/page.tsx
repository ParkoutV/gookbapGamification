import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { redirect } from 'next/navigation';
import { DashboardClient } from '@/app/main/DashboardClient';
import SurveyResultsClient from '@/app/main/survey-results/SurveyResultsClient';

export default async function ArchiveViewerPage({ params }: { params: Promise<{ fileName: string }> }) {
  const resolvedParams = await params;
  const fileName = decodeURIComponent(resolvedParams.fileName);
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: account } = await adminClient
    .from('accounts')
    .select('permission, assigned_branch_id')
    .eq('user_id', user.id)
    .single();

  const isAdmin = account?.permission === 0;

  if (!isAdmin) {
    return <div className="p-8 text-red-500 font-bold text-center">접근 권한이 없습니다. (최고 관리자 전용)</div>;
  }

  // Fetch Archive Snapshot
  const { data: snapData, error } = await adminClient.storage
    .from('admin_assets')
    .download(`archives/${fileName}`);

  if (error || !snapData) {
    console.error("Archive Download Error:", error, "fileName:", fileName);
    return <div className="p-8 text-red-500 font-bold text-center">아카이브 파일을 불러올 수 없습니다. ({fileName})</div>;
  }

  const snapshotText = await snapData.text();
  const archiveSnapshot = JSON.parse(snapshotText);

  // Reconstruct branches list for SurveyResultsClient
  const branchesMap = new Map<string, string>();
  (archiveSnapshot.tracksData || []).forEach((t: any) => {
    if (t.branches) {
      branchesMap.set(t.branches.branch_id || 'UNKNOWN', t.branches.branch_name);
    }
  });

  const branches = Array.from(branchesMap.entries()).map(([id, name]) => ({
    branch_id: id,
    branch_name: name
  }));

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-20">
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-6 py-4 rounded-xl shadow-sm text-center font-bold text-lg">
        🔒 현재 페이지는 {new Date(archiveSnapshot.metadata.createdAt).toLocaleString('ko-KR')} 에 생성된 아카이브(읽기 전용) 뷰어입니다.
      </div>

      <section>
        <h2 className="text-2xl font-bold mb-6 flex items-center">
          <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-md mr-3 text-sm">ARCHIVE</span>
          KPI 대시보드
        </h2>
        <DashboardClient isAdmin={isAdmin} assignedBranchId={account?.assigned_branch_id} archiveSnapshot={archiveSnapshot} />
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-6 flex items-center">
          <span className="bg-green-100 text-green-700 px-3 py-1 rounded-md mr-3 text-sm">ARCHIVE</span>
          설문조사 결과
        </h2>
        <SurveyResultsClient permission={account?.permission} assignedBranchId={account?.assigned_branch_id} branches={branches} archiveSnapshot={archiveSnapshot} />
      </section>
    </div>
  );
}
