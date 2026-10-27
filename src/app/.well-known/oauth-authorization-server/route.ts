import { oauthOrigin } from '@/features/agents/server/oauth';
import { oauthServerMetadata } from '@/features/agents/oauth';
export function GET() {
  return Response.json(oauthServerMetadata(oauthOrigin()), {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
