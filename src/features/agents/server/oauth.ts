import 'server-only';
import { siteUrl } from '@/lib/site-metadata';
export function oauthOrigin() {
  if (process.env.NODE_ENV === 'production' && siteUrl.protocol !== 'https:')
    throw new Error('Configure the public HTTPS app URL.');
  return siteUrl.origin;
}
export function oauthSecret() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value || value.length < 32) throw new Error('OAuth is not configured.');
  return value;
}
export const oauthHeaders = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
export function oauthChallenge() {
  return `Bearer resource_metadata="${oauthOrigin()}/.well-known/oauth-protected-resource", scope="project:read"`;
}
