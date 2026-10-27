import 'server-only';
import Groq from 'groq-sdk';
import { z } from 'zod';
import type { Agreement, Message } from '@/lib/domain';
import {
  scopeContext,
  scopeSystemPrompt,
  explainedScopeSchema,
  verifiedScopeResponse,
} from '@/features/conversation/scope-review';
export async function reviewScope(
  agreement: Agreement,
  message: Message,
  lessons: { id: string; lesson: string }[] = [],
  options: { model?: string; timeoutMs?: number } = {},
) {
  const model = options.model || process.env.GROQ_SCOPE_MODEL || 'openai/gpt-oss-120b';
  if (!['openai/gpt-oss-120b', 'openai/gpt-oss-20b'].includes(model))
    throw new Error('Unsupported scope model.');
  if (!process.env.GROQ_API_KEY) throw new Error('Scope review is not configured yet.');
  const client = new Groq({
    apiKey: process.env.GROQ_API_KEY,
    timeout: options.timeoutMs ?? 30000,
    maxRetries: 0,
  });
  const deadline = Date.now() + (options.timeoutMs ?? 30000);
  const context = scopeContext(agreement, message, lessons);
  const verified = await verifiedScopeResponse(
    agreement,
    message,
    lessons,
    async (correctEvidence) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('The analysis did not finish.');
      const response = await client.chat.completions.create(
        {
          model,
          temperature: 0,
          max_completion_tokens: 3500,
          reasoning_effort: 'low',
          messages: [
            {
              role: 'system',
              content:
                scopeSystemPrompt +
                (correctEvidence
                  ? '\nYour previous output failed evidence validation. Copy each quote as one exact, contiguous substring from its supplied source, preserving punctuation, capitalization and whitespace. Never paraphrase quotes or add ellipses. If request.body is shorter than 1,000 characters, use its full text as message_quote. Use only supplied memory IDs and literal lesson substrings; never invent attribution. All other requirements still apply.'
                  : ''),
            },
            { role: 'user', content: context },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'scope_review',
              strict: true,
              schema: z.toJSONSchema(explainedScopeSchema),
            },
          },
        },
        { timeout: remaining },
      );
      const choice = response.choices[0];
      if (choice?.finish_reason !== 'stop' || !choice.message.content)
        throw new Error('The analysis did not finish.');
      // Parsing belongs to output validation, so a non-JSON completion can also be retried.
      try {
        return JSON.parse(choice.message.content);
      } catch {
        return null;
      }
    },
  );
  return { ...verified, model };
}
