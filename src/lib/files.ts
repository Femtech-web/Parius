import { z } from 'zod';
export const FILE_BUCKET = 'parius-project-files';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const fileTypes = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  txt: 'text/plain',
  zip: 'application/zip',
} as const;
export const fileInput = z.object({
  projectId: z.uuid(),
  key: z.uuid(),
  name: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[^\x00-\x1f\x7f/\\]+$/, 'Use a filename without paths or control characters.'),
  size: z.number().int().min(1).max(MAX_FILE_BYTES),
  kind: z.enum(['attachment', 'preview', 'final']),
  milestoneId: z.uuid().nullable(),
  rule: z.enum(['on_approval', 'invoice_paid']).nullable(),
  invoiceId: z.uuid().nullable(),
  quote: z.string().min(1).max(1000).nullable(),
});
export type FileInput = z.infer<typeof fileInput>;
export type ProjectFile = {
  id: string;
  project_id: string;
  uploaded_by: string;
  name: string;
  size_bytes: number;
  mime: string;
  kind: 'attachment' | 'preview' | 'final';
  milestone_id: string | null;
  agreement_id: string | null;
  release_rule: 'on_approval' | 'invoice_paid' | null;
  invoice_id: string | null;
  terms_quote: string | null;
  status: 'pending' | 'ready' | 'removed';
  created_at: string;
  released_at: string | null;
  object_deleted_at: string | null;
};
export const FILE_COLUMNS =
  'id,project_id,uploaded_by,name,size_bytes,mime,kind,milestone_id,agreement_id,release_rule,invoice_id,terms_quote,status,created_at,released_at,object_deleted_at';
export function fileMime(name: string) {
  const extension = name.split('.').at(-1)?.toLowerCase();
  return fileTypes[extension as keyof typeof fileTypes] || null;
}
export function validateFileBytes(bytes: Uint8Array, name: string, expectedSize: number) {
  const mime = fileMime(name);
  if (!mime || bytes.length !== expectedSize || !bytes.length || bytes.length > MAX_FILE_BYTES)
    throw new Error('The uploaded file does not match its declared type or size.');
  const starts = (a: number[]) => a.every((b, i) => bytes[i] === b);
  let valid = false;
  if (mime === 'application/pdf') valid = starts([37, 80, 68, 70, 45]);
  if (mime === 'image/png') valid = starts([137, 80, 78, 71, 13, 10, 26, 10]);
  if (mime === 'image/jpeg') valid = starts([255, 216, 255]);
  if (mime === 'image/webp')
    valid = starts([82, 73, 70, 70]) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (mime === 'application/zip')
    valid = starts([80, 75, 3, 4]) || starts([80, 75, 5, 6]) || starts([80, 75, 7, 8]);
  if (mime === 'text/plain') {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      valid = !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text);
    } catch {
      valid = false;
    }
  }
  if (!valid) throw new Error('The uploaded content does not match this file type.');
  return mime;
}
