# Browser learning evidence — 27 October 2026

The tester reported signing out and back in as freelancer, then reviewing a newly posted client request in the existing demo project. Six supplied screenshots, captured between **00:31 and 00:35 Africa/Lagos**, show the request, review, cited lessons, suggested reply and paired comparison. Sign-out/sign-in is tester-reported; the screenshots do not independently establish that action.

## Request and stored experience

The client requested a members-only area with customer sign-in and asked what should be decided next. The review used **agreement v1**, recalled **five confirmed lessons**, and cited **two**:

> Before accepting an extra feature, ask for a separately priced change proposal

> In suggested client replies, use one concise paragraph, avoid emoji, and end with one concrete next step without inventing a price or promising approval.

Their verified Mainnet storage references are available as lessons 1 and 10 in the [storage report](mainnet-storage.json).

## Visible result

Both sides of the comparison treated the requested members-only functionality as additional work requiring a separately approved change proposal. The baseline reply used an email format with name placeholders, multiple paragraphs and a closing. The memory-enabled reply used one paragraph and ended with a concrete next step:

> Please let me know if you’d like me to draft that proposal.

The observed benefit is following a confirmed communication preference while preserving the agreement boundary. This is a useful output difference, not proof of a changed scope decision or a general improvement across tasks.

The final screenshot shows:

- Five retrieved lessons and two citations in the memory-enabled comparison.
- Two independent reviews using the same saved agreement/request, system prompt, model, temperature, schema and token limit, with recalled lessons as the changed input.
- Both outputs passed the application's source-quote checks.
- Model `openai/gpt-oss-120b`, prompt version `scope-v3`, and a displayed shared-context SHA-256 hash.
- A notice that neither review changes the agreement or sends a reply.

This browser result is separate from the [fresh-process integration result](fresh-process-review.json), whose memory-enabled review cited three lessons. Do not merge their counts, output text or context hashes.

## Explanation-quality limitation

One visible explanation says the agreement explicitly lists a members-only area as outside scope. The actual displayed clause names e-commerce, product pages, checkout and ongoing maintenance, followed by a general requirement for separately approved additional work. It does not explicitly name a members-only area.

The supported explanation is that sign-in functionality is not among the listed deliverables and therefore appears to require a change proposal. The observed wording overstates that evidence. Source-quote validation establishes literal quotation provenance; it does not guarantee every explanatory statement is accurate. No corrected browser run is claimed here.

Original screenshots are retained privately because they include a personal profile name and browser details. This public summary records the reviewed observations without publishing that information. The screenshots are evidence of an exercised local workflow, not hosted deployment acceptance or a continuous video recording.
