import { oauthOrigin } from '@/features/agents/server/oauth';
import { oauthResourceMetadata } from '@/features/agents/oauth';
export function GET() {
  return Response.json(oauthResourceMetadata(oauthOrigin()), {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
