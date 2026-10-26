import { requireSession } from '@/lib/server/session';
import { Shell } from '@/components/shell';
import { DashboardView } from '@/components/dashboard-view';
export const dynamic = 'force-dynamic';
export default async function Dashboard() {
  const { supabase, user } = await requireSession();
  const { data, error } = await supabase
    .from('projects')
    .select('*, project_members!inner(role)')
    .eq('project_members.user_id', user.id)
    .order('created_at', { ascending: false });
  const projects = (data || []).map((project) => ({
    ...project,
    role:
      project.project_members[0]?.role === 'freelancer'
        ? ('freelancer' as const)
        : project.project_members[0]?.role === 'client'
          ? ('client' as const)
          : undefined,
  }));
  const name = String(user.user_metadata.full_name || user.email?.split('@')[0] || 'there');
  return (
    <Shell name={name}>
      <DashboardView projects={projects} error={Boolean(error)} />
    </Shell>
  );
}
