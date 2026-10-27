import { FILE_COLUMNS, type ProjectFile } from '@/features/files/domain';
import type { MemoryReference, MemorySuggestion } from '@/features/memory/domain';
import type {
  Invoice,
  PaymentRecord,
  PaymentRequest,
  PaymentClaim,
  InvoiceBalance,
} from '@/features/payments/domain';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/server/session';
import { Shell } from '@/components/layout/shell';
import { Workspace } from '@/features/projects/components/workspace';
import type {
  ActivityEvent,
  AgreementResolution,
  Agreement,
  Approval,
  Member,
  Message,
  Milestone,
  Project,
} from '@/lib/domain';
import { z } from 'zod';
import type { ScopeAssessment } from '@/features/conversation/scope-review';
export const maxDuration = 60;
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, user } = await requireSession();
  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !project) notFound();
  const results = await Promise.all([
    supabase
      .from('messages')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(101),
    supabase
      .from('agreement_versions')
      .select('*')
      .eq('project_id', id)
      .order('version', { ascending: false }),
    supabase.from('agreement_approvals').select('*').eq('project_id', id),
    supabase.from('milestones').select('*').eq('project_id', id).order('created_at'),
    supabase.from('project_members').select('*').eq('project_id', id),
    supabase.from('agreement_resolutions').select('*').eq('project_id', id),
    supabase.rpc('read_project_activity', { p_project: id, p_limit: 51 }),
    supabase
      .from('scope_assessments')
      .select(
        'id,project_id,agreement_id,message_id,status,result,model,created_at,completed_at,memory_revision,recalled_memory_ids,recall_status,prompt_version,memory_influences',
      )
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('memory_references')
      .select(
        'id,owner_id,project_id,scope,lesson,status,job_id,blob_id,replaces_id,created_at,deletion_requested_at',
      )
      .eq('owner_id', user.id)
      .or(`scope.eq.personal,project_id.eq.${id}`)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(100),
    supabase.from('memory_state').select('revision').eq('owner_id', user.id).maybeSingle(),
    supabase
      .from('invoices')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(26),
    supabase
      .from('payment_records')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(0),
    supabase.from('payment_requests').select('*').eq('project_id', id).limit(0),
    supabase
      .from('payment_claims')
      .select('id,project_id,request_id,digest,status,reason,proof,created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(0),
    supabase.from('invoice_balances').select('*').eq('project_id', id).limit(0),
    supabase
      .from('project_files')
      .select(FILE_COLUMNS)
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(51),
    supabase
      .from('memory_suggestions')
      .select('id,project_id,assessment_id,kind,lesson,created_at')
      .eq('owner_id', user.id)
      .eq('project_id', id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);
  if (results.slice(0, 7).some((r) => r.error))
    throw new Error('The project details could not be loaded.');
  const issued = await supabase
    .from('invoices')
    .select('id')
    .eq('project_id', id)
    .not('issued_at', 'is', null)
    .limit(1);
  const paymentModeLocked = Boolean(issued.error || issued.data?.length);
  const messages: Message[] = (results[0].data || []).slice(0, 100).reverse();
  const agreements: Agreement[] = results[1].data || [];
  const approvals: Approval[] = results[2].data || [];
  const milestones: Milestone[] = results[3].data || [];
  const members: Member[] = results[4].data || [];
  const invoiceIds = (results[10].data || []).slice(0, 25).map((i) => i.id);
  const balancePage = invoiceIds.length
    ? await supabase
        .from('invoice_balances')
        .select('*')
        .eq('project_id', id)
        .in('invoice_id', invoiceIds)
    : { data: [], error: null };
  return (
    <Shell
      name={String(user.user_metadata.full_name || user.email?.split('@')[0] || 'Your workspace')}
    >
      <Workspace
        key={`${id}:${user.id}`}
        project={{ ...(project as Project), payment_mode_locked: paymentModeLocked }}
        messagesHasMore={(results[0].data || []).length > 100}
        invoicesHasMore={(results[10].data || []).length > 25}
        messages={messages}
        agreements={agreements}
        approvals={approvals}
        milestones={milestones}
        members={members}
        resolutions={(results[5].data || []) as AgreementResolution[]}
        activity={((results[6].data || []) as ActivityEvent[]).slice(0, 50)}
        activityHasMore={(results[6].data || []).length > 50}
        assessments={(results[7].data || []) as ScopeAssessment[]}
        scopeReviewReady={!results[7].error}
        memories={(results[8].data || []) as MemoryReference[]}
        memoryRevision={results[9].data?.revision || 0}
        memoryReady={!results[8].error && !results[9].error}
        memorySuggestions={(results[16].data || []) as MemorySuggestion[]}
        suggestionsReady={!results[16].error}
        invoices={((results[10].data || []) as Invoice[]).slice(0, 25)}
        paymentRecords={(results[11].data || []) as PaymentRecord[]}
        paymentRequests={(results[12].data || []) as PaymentRequest[]}
        paymentClaims={(results[13].data || []) as PaymentClaim[]}
        invoiceBalances={(balancePage.data || []) as InvoiceBalance[]}
        paymentsReady={!balancePage.error && !results.slice(10, 15).some((r) => r.error)}
        files={((results[15].data || []) as ProjectFile[]).slice(0, 50)}
        filesHasMore={(results[15].data || []).length > 50}
        filesReady={!results[15].error}
        userId={user.id}
      />
    </Shell>
  );
}
