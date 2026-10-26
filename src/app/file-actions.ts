'use server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/server/session';
import { privilegedClient } from '@/lib/server/privileged';
import {
  FILE_BUCKET,
  FILE_COLUMNS,
  fileInput,
  fileMime,
  validateFileBytes,
  type FileInput,
  type ProjectFile,
} from '@/lib/files';
import type { ActionResult } from './actions';

export async function reserveFile(
  input: FileInput,
): Promise<ActionResult & { id?: string; path?: string; status?: string; mime?: string }> {
  const parsed = fileInput.safeParse(input);
  if (!parsed.success)
    return { error: 'Choose a supported file up to 10 MB and complete its delivery details.' };
  const value = parsed.data,
    mime = fileMime(value.name);
  if (!mime) return { error: 'Use a PDF, PNG, JPG, WebP, TXT or ZIP file.' };
  const { supabase } = await requireSession();
  const { data, error } = await supabase.rpc('reserve_project_file', {
    p_project: value.projectId,
    p_name: value.name,
    p_mime: mime,
    p_size: value.size,
    p_kind: value.kind,
    p_milestone: value.milestoneId,
    p_rule: value.rule,
    p_invoice: value.invoiceId,
    p_quote: value.quote,
    p_key: value.key,
  });
  if (error || !data)
    return {
      error:
        error?.code === 'P0001' ? error.message : 'The upload could not be prepared. Please retry.',
    };
  return { ...data, mime };
}
export async function finishFile(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { error: 'Invalid file.' };
  const { supabase, user } = await requireSession();
  const { data: file } = await supabase
    .from('project_files')
    .select('id,project_id,uploaded_by,object_path,name,size_bytes,status,kind')
    .eq('id', id)
    .single();
  if (!file || file.uploaded_by !== user.id || file.status === 'removed')
    return { error: 'This upload is unavailable.' };
  if (file.status === 'ready') return { success: 'File uploaded.' };
  const service = privilegedClient();
  const { data, error } = await service.storage.from(FILE_BUCKET).download(file.object_path);
  if (error || !data)
    return { error: 'The file upload could not be confirmed. Retry the same file.' };
  try {
    const bytes = new Uint8Array(await data.arrayBuffer());
    validateFileBytes(bytes, file.name, file.size_bytes);
    const { error: saveError } = await service.rpc('finish_project_file', {
      p_id: id,
      p_hash: createHash('sha256').update(bytes).digest('hex'),
    });
    if (saveError) return { error: 'The upload expired or access changed. Choose the file again.' };
  } catch {
    // Reject before sharing. Preserve the tombstone if storage cleanup needs retry.
    const { error: removeError } = await supabase.rpc('remove_project_file', { p_id: id });
    if (!removeError) {
      const { error: cleanupError } = await service.storage
        .from(FILE_BUCKET)
        .remove([file.object_path]);
      if (!cleanupError) await service.rpc('finish_file_removal', { p_id: id });
    }
    revalidatePath(`/projects/${file.project_id}`);
    return {
      error: 'This content does not match the declared file type or size. Choose another file.',
    };
  }
  revalidatePath(`/projects/${file.project_id}`);
  return {
    success:
      file.kind === 'final'
        ? 'Final file uploaded. It remains locked until you release it.'
        : 'File uploaded.',
  };
}
export async function releaseFile(id: string, confirmed: boolean): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success || confirmed !== true)
    return { error: 'Review and confirm the release terms first.' };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('release_project_file', { p_id: id, p_confirm: confirmed });
  if (error)
    return { error: error.code === 'P0001' ? error.message : 'The file could not be released.' };
  const { data } = await supabase.from('project_files').select('project_id').eq('id', id).single();
  if (data) revalidatePath(`/projects/${data.project_id}`);
  return { success: 'Final file released. Downloads still check the agreed release conditions.' };
}
export async function removeFile(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { error: 'Invalid file.' };
  const { supabase, user } = await requireSession();
  const { data: file } = await supabase
    .from('project_files')
    .select('project_id,object_path,uploaded_by')
    .eq('id', id)
    .single();
  if (!file || file.uploaded_by !== user.id)
    return { error: 'Only the uploader can remove this file.' };
  const { error } = await supabase.rpc('remove_project_file', { p_id: id });
  if (error) return { error: 'The file could not be removed.' };
  revalidatePath(`/projects/${file.project_id}`);
  const service = privilegedClient();
  const { error: storageError } = await service.storage
    .from(FILE_BUCKET)
    .remove([file.object_path]);
  if (storageError)
    return { success: 'File access removed. Storage cleanup is pending; you can retry cleanup.' };
  const { error: saveError } = await service.rpc('finish_file_removal', { p_id: id });
  return {
    success: saveError
      ? 'File access removed. Cleanup confirmation is pending.'
      : 'File removed. Previously issued download links may work for up to 60 seconds.',
  };
}
export async function readFilePage(
  projectId: string,
  cursor?: { created_at: string; id: string },
): Promise<{ files?: ProjectFile[]; hasMore?: boolean; error?: string }> {
  if (
    !z.uuid().safeParse(projectId).success ||
    (cursor &&
      (!z.uuid().safeParse(cursor.id).success ||
        !z.iso.datetime({ offset: true }).safeParse(cursor.created_at).success))
  )
    return { error: 'Invalid file page.' };
  const { supabase } = await requireSession();
  let query = supabase.from('project_files').select(FILE_COLUMNS).eq('project_id', projectId);
  if (cursor)
    query = query.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(51);
  return error
    ? { error: 'Files could not be loaded.' }
    : { files: (data || []).slice(0, 50) as ProjectFile[], hasMore: (data || []).length > 50 };
}

export async function readFileRecord(id: string): Promise<ProjectFile | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { supabase } = await requireSession();
  const { data } = await supabase.from('project_files').select(FILE_COLUMNS).eq('id', id).single();
  return data as ProjectFile | null;
}
