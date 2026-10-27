import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';

export const agentScope = 'project:read';
export function oauthResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: [agentScope],
    bearer_methods_supported: ['header'],
    resource_documentation: `${origin}/docs/agents`,
  };
}
export function oauthServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [agentScope],
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: false,
  };
}
const redirectUri = z
  .string()
  .max(1000)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      !url.hash &&
      (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1'))
    );
  }, 'Use an HTTPS callback or a loopback callback.');
const clientSchema = z.object({
  client_name: z.string().trim().min(1).max(80),
  redirect_uris: z.array(redirectUri).min(1).max(5),
  token_endpoint_auth_method: z.literal('none').default('none'),
  grant_types: z.array(z.literal('authorization_code')).length(1).default(['authorization_code']),
  response_types: z.array(z.literal('code')).length(1).default(['code']),
});
export type OAuthClient = z.infer<typeof clientSchema>;
export function hashOAuth(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
export function pkceChallenge(value: string) {
  return createHash('sha256').update(value).digest('base64url');
}
function secretKey(secret: string, purpose: string) {
  if (secret.length < 32) throw new Error('OAuth is not configured.');
  return createHmac('sha256', secret).update(`parius:oauth:${purpose}:v1`).digest();
}
/** Registration is signed, not fetched from arbitrary client URLs or stored as public credentials. */
export function registerOAuthClient(input: unknown, secret: string) {
  const client = clientSchema.parse(input);
  const encoded = Buffer.from(JSON.stringify(client)).toString('base64url');
  const signature = createHmac('sha256', secretKey(secret, 'client'))
    .update(encoded)
    .digest('base64url');
  return { ...client, client_id: `pc1.${encoded}.${signature}` };
}
export function readOAuthClient(id: string, secret: string): OAuthClient {
  if (id.length > 9000) throw new Error('Invalid OAuth client.');
  const [version, encoded, signature, extra] = id.split('.');
  if (version !== 'pc1' || !encoded || !signature || extra)
    throw new Error('Invalid OAuth client.');
  const expected = createHmac('sha256', secretKey(secret, 'client')).update(encoded).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    throw new Error('Invalid OAuth client.');
  return clientSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString()));
}
export function authorizationRequest(query: URLSearchParams, origin: string, secret: string) {
  for (const key of [
    'client_id',
    'redirect_uri',
    'response_type',
    'code_challenge',
    'code_challenge_method',
    'state',
    'resource',
    'scope',
  ]) {
    if (query.getAll(key).length > 1) throw new Error('Duplicate OAuth parameter.');
  }
  const request = z
    .object({
      client_id: z.string().max(9000),
      redirect_uri: redirectUri,
      response_type: z.literal('code'),
      code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      code_challenge_method: z.literal('S256'),
      state: z.string().max(2000).optional(),
      resource: z.literal(`${origin}/api/mcp`),
      scope: z.literal(agentScope).default(agentScope),
    })
    .parse(Object.fromEntries(query));
  const client = readOAuthClient(request.client_id, secret);
  if (!client.redirect_uris.includes(request.redirect_uri))
    throw new Error('Unregistered callback.');
  return { ...request, client };
}
export function oauthRedirect(
  request: ReturnType<typeof authorizationRequest>,
  origin: string,
  result: { code: string } | { error: 'access_denied' },
) {
  const target = new URL(request.redirect_uri);
  for (const [key, value] of Object.entries(result)) target.searchParams.set(key, value);
  if (request.state !== undefined) target.searchParams.set('state', request.state);
  target.searchParams.set('iss', origin);
  return target.toString();
}
export function encryptOAuthToken(token: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(secret, 'token'), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function decryptOAuthToken(value: string, secret: string) {
  const bytes = Buffer.from(value, 'base64url');
  const cipher = createDecipheriv('aes-256-gcm', secretKey(secret, 'token'), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
}
/** Validate audience, issuer, scope and expiry before using an OAuth project key. */
export function createOAuthAccessToken(
  key: string,
  resource: string,
  expiresIn: number,
  secret: string,
) {
  return `po1.${encryptOAuthToken(
    JSON.stringify({
      key,
      resource,
      issuer: new URL(resource).origin,
      scope: agentScope,
      expires: Math.floor(Date.now() / 1000) + expiresIn,
    }),
    secret,
  )}`;
}
export function readOAuthAccessToken(token: string, resource: string, secret: string) {
  if (!token.startsWith('po1.') || token.length > 2000) throw new Error('Invalid access token.');
  return z
    .object({
      key: z.string().regex(/^parius_[A-Za-z0-9_-]{43}$/),
      resource: z.literal(resource),
      issuer: z.literal(new URL(resource).origin),
      scope: z.literal(agentScope),
      expires: z
        .number()
        .int()
        .gt(Math.floor(Date.now() / 1000)),
    })
    .parse(JSON.parse(decryptOAuthToken(token.slice(4), secret))).key;
}
export function tokenRequest(form: URLSearchParams, origin: string, secret: string) {
  for (const key of [
    'client_id',
    'redirect_uri',
    'grant_type',
    'code',
    'code_verifier',
    'resource',
  ]) {
    if (form.getAll(key).length > 1) throw new Error('Duplicate OAuth parameter.');
  }
  const input = z
    .object({
      grant_type: z.literal('authorization_code'),
      client_id: z.string().max(9000),
      redirect_uri: redirectUri,
      code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
      resource: z.literal(`${origin}/api/mcp`),
    })
    .parse(Object.fromEntries(form));
  const client = readOAuthClient(input.client_id, secret);
  if (!client.redirect_uris.includes(input.redirect_uri)) throw new Error('Unregistered callback.');
  return input;
}
