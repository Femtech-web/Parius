import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authorizationRequest } from '@/features/agents/oauth';
import { authorizeOAuth } from '@/features/agents/server/oauth-actions';
import { oauthOrigin, oauthSecret } from '@/features/agents/server/oauth';
import { createClient } from '@/lib/supabase/server';
import { Brand } from '@/components/ui/brand';
import { control } from '@/components/ui/control-styles';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Connect an agent', robots: { index: false, follow: false } };
export default async function ConnectAgent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
    else if (value !== undefined && key !== 'error') query.set(key, value);
  }
  let request: ReturnType<typeof authorizationRequest>;
  try {
    request = authorizationRequest(query, oauthOrigin(), oauthSecret());
  } catch {
    return (
      <main id="main" className="mx-auto max-w-xl px-6 py-20">
        <Brand />
        <h1 className="mt-10 text-3xl">This connection request is invalid.</h1>
        <p className="mt-4 text-ash">Start again from your AI client.</p>
        <Link className="mt-6 inline-block text-ice" href="/docs/agents">
          Read the agent guide
        </Link>
      </main>
    );
  }
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    redirect(`/login?next=${encodeURIComponent('/projects/connect-agent?' + query.toString())}`);
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id,name,project_members!inner(user_id)')
    .eq('project_members.user_id', user.id)
    .order('created_at', { ascending: false });
  return (
    <main id="main" className="mx-auto max-w-xl px-6 py-16 text-paper">
      <Brand />
      <h1 className="mt-10 text-[30px] font-normal tracking-tight">Connect one project.</h1>
      <p className="mt-4 text-sm leading-7 text-ash">
        <strong className="font-medium text-paper">{request.client.client_name}</strong> is asking
        to read a Parius project. Choose which project to share. Access lasts one hour.
      </p>
      <p className="mt-4 break-all text-xs leading-6 text-ash">
        Application callback: {new URL(request.redirect_uri).origin}. This is a client-supplied
        application name; approve only the connection you started.
      </p>
      <p className="mt-5 text-sm leading-7 text-ash">
        The agent can read the approved agreement, milestones, invoices visible to your role and the
        latest 30 messages. Private memories, AI reviews and file contents stay private. This
        connection cannot send messages, change terms, make payments, reconcile receipts or release
        files.
      </p>
      {(params.error || error) && (
        <p role="alert" className="mt-5 text-sm text-danger">
          Connection could not be created. Check project access and the OAuth migration, or revoke
          an old agent connection before trying again.
        </p>
      )}
      <form action={authorizeOAuth.bind(null, query.toString())} className="mt-8">
        <label htmlFor="oauth-project" className="mb-3 block text-xs">
          Project to share
        </label>
        <select
          id="oauth-project"
          name="project"
          required
          disabled={Boolean(error) || !projects?.length}
          className="w-full rounded-xl border border-white/20 bg-slate p-4 text-sm"
        >
          {(projects || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {!projects?.length && (
          <p className="mt-3 text-xs text-ash">Join or create a project in Parius first.</p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className={control.primary}
            name="decision"
            value="allow"
            disabled={Boolean(error) || !projects?.length}
          >
            Allow read-only access
          </button>
          <button className={control.secondary} name="decision" value="deny">
            Cancel
          </button>
        </div>
      </form>
      <p className="mt-6 text-xs leading-6 text-ash">
        You can revoke this connection in the project’s Payments → Connect a project agent section.
        When it expires, reconnect from your AI client. No refresh token is issued.
      </p>
    </main>
  );
}
