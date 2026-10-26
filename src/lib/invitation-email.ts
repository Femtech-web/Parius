import { z } from 'zod';
export const invitationEmailInput = z.object({
  projectId: z.uuid(),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  email: z.email().max(254).trim().toLowerCase(),
});
export function invitationMessage(
  origin: string,
  token: string,
  from: string,
  recipient: string,
  projectName: string,
) {
  const url = new URL(`/invite/${token}`, origin).href;
  return {
    from,
    to: [recipient],
    subject: 'Your invitation to Parius',
    text: `You have been invited to join “${projectName}” on Parius.\n\nOpen your invitation:\n${url}\n\nSign in with Google or your email, then choose Accept invitation to join as the client. Creating an account does not accept the invitation automatically.\n\nThis private link expires in 7 days from creation and can be used once. Anyone holding it can accept, so do not forward it. A newer invitation may replace it.\n\nIf you were not expecting this invitation, you can ignore this email.\n\nParius`,
  };
}
export async function submitInvitationEmail(
  apiKey: string,
  id: string,
  message: ReturnType<typeof invitationMessage>,
  transport: typeof fetch = fetch,
) {
  const response = await transport('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `parius-invitation/${id}`,
    },
    body: JSON.stringify(message),
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('Invitation email not confirmed');
  const data: unknown = await response.json();
  const parsed = z.object({ id: z.string().min(1).max(200) }).safeParse(data);
  if (!parsed.success) throw new Error('Invitation email not confirmed');
  return parsed.data.id;
}
