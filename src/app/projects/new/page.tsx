import { requireSession } from '@/lib/server/session';
import { Shell } from '@/components/layout/shell';
import { NewProjectView } from '@/features/projects/components/new-project-view';
export const dynamic = 'force-dynamic';
export default async function NewProject() {
  const { user } = await requireSession();
  return (
    <Shell activePage="new-project" name={user.email?.split('@')[0]}>
      <NewProjectView />
    </Shell>
  );
}
