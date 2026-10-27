import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { privilegedClient } from '@/lib/server/privileged';
import { FILE_BUCKET } from '@/features/files/domain';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return new Response('File unavailable.', { status: 404, headers });
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user)
    return new Response('Sign in to download this file.', { status: 401, headers });
  const { data: file, error } = await supabase.rpc('authorize_file_download', { p_id: id });
  if (error || !file)
    return new Response('This file is unavailable or its release conditions are not met.', {
      status: 403,
      headers,
    });
  const { data, error: signError } = await privilegedClient()
    .storage.from(FILE_BUCKET)
    .createSignedUrl(file.path, 60, { download: file.name });
  if (signError || !data)
    return new Response('Download unavailable. Please retry.', { status: 503, headers });
  return new Response(null, { status: 303, headers: { ...headers, Location: data.signedUrl } });
}
