# ADR-001 Provider pins for the product's model roles

## Context

The PRD pins AG-1, AG-2 and AG-3 to Anthropic claude-sonnet-5 and AG-4 to deepseek-chat (an alias DeepSeek retired on 24 July 2026), and its LD-05 asks for the verifier on a different provider family. On 3 September 2026 Ghaisan locked the product to one provider and one API, Z.ai GLM, with no fallback family, and then locked every product model role to one model id, `glm-5.3-flash` (run notes, deviation D-05). A live probe on 2026-09-03 confirmed that `glm-5.3-flash` is served on api.z.ai, that JSON mode works, and that `reasoning_effort` low produced zero reasoning tokens.

## Decision

Every model role runs on Z.ai (`https://api.z.ai/api/paas/v4`, OpenAI-compatible) on the one model id `glm-5.3-flash`, through the one gateway module in `src/gateway`, the only code path that calls a provider:

| Role | Model id | Effort | Prompt |
|---|---|---|---|
| AG-1 Extractor (build time) | `glm-5.3-flash` | high | its own versioned file `prompts/<role>/v<N>.md` |
| AG-2 Composer (runtime; extractive-first, carries the latency target) | `glm-5.3-flash` | low | its own versioned file |
| AG-3 Drafter (runtime, asynchronous) | `glm-5.3-flash` | high | its own versioned file |
| AG-4 Verifier and Redliner (runtime) | `glm-5.3-flash` | low | its own versioned file, question-blind |
| embedding | local model, no provider call (ADR-009) | n/a | none |

Verifier independence is prompt-and-question-blindness plus the deterministic gates. AG-4 uses a separate prompt file and system role from every authoring role, receives claim and span pairs inside a typed JSON envelope that never contains the question, returns verdicts and never edits; the redliner schema has no edit field. Gates C1 to C6, the hash rendering of procedures, the typed-numeral rule and the physically separate draft store carry the anti-fabrication guarantee and do not depend on which model id answers. AC-LOOP-06's "different model id" leg is replaced by "different prompt file and question-blind envelope"; the configuration assertion checks that.

Every call sets `response_format` to JSON object and validates the parsed object against the role's Zod schema; a parse or schema failure counts as not entailed for AG-4 and as a retry-once then block for AG-3. Reasoning cannot be switched off through the API; the effort level is the explicit per-role setting above, never left to the provider's default. Every call stores model id, prompt version (the SHA-256 of the prompt file), gateway configuration hash and corpus version on the trace, the draft or the evaluation run it produced.

## Alternatives

- The earlier split inside the same provider (`glm-5.3` at effort high for AG-1 and AG-3, `glm-5.3` at effort low for AG-4, `glm-5.3-flash` for AG-2): superseded by D-05.
- DeepSeek V4 for the authoring roles with GLM as the verifier (Crown's earlier default): superseded by the revision.
- A second provider family for AG-4, as the PRD's LD-05 asked: rejected by the revision.

## Consequences

- No code path calls DeepSeek, Anthropic, OpenAI or any gateway service.
- The provider-independence wording of the PRD and the deck becomes prompt-and-question-blindness within one provider and one model id, stated plainly on the Evaluation page and in appendix A5.
- The confirmation run of AC-EVAL-05 is the proof: 30 labelled entailment pairs (15 supported, 15 unsupported) from the golden set plus the WO-240007 drafting case; AG-4 must agree with the labels on at least 27 of 30 with at most one false accept, and the drafter must produce a draft with no unsourced numeral.
- If that run fails there is no fallback family and no second model id: the fix is a revision of the AG-4 prompt (a new prompt version) and a repeat of the run until it passes, every attempt recorded below.
- Recorded replays (`recordings/<case_id>/<role>.json`) are refreshed as a reviewed commit whenever a prompt version or this pin changes.

## Records

- Role table as implemented in `src/gateway/config.ts` on 2026-09-05. Every row is parsed against the 9.13 `GatewayRole` contract at module load; `gateway_config_sha256` is the SHA-256 of the canonical JSON of this table and changes with any cell or any prompt edit, so its value is read from a `gateway_call` row rather than copied here. AG-4 has two tasks under the one 9.13 role name (verify, redline; ARCHITECTURE 13 decision 8): both write `gateway_call.role = "AG-4"` and share that role's budget.

| task | 9.13 role | model_id | effort | response_format | temperature | max_tokens | timeout_ms | prompt file (prompt_version = SHA-256 of the file) | tokens_per_day | spend_cap_idr_per_day |
|---|---|---|---|---|---|---|---|---|---|---|
| AG-1 Extractor (build time) | AG-1 | `glm-5.3-flash` | high | json_object | 0 | 8192 | 120000 | `prompts/AG-1/v1.md` | 20,000,000 | 150,000 |
| AG-2 Composer | AG-2 | `glm-5.3-flash` | low | json_object | 0 | 2048 | 20000 | `prompts/AG-2/v2.md` | 3,000,000 | 20,000 |
| AG-3 Drafter | AG-3 | `glm-5.3-flash` | high | json_object | 0 | 16384 | 75000 | `prompts/AG-3/v2.md` | 3,000,000 | 20,000 |
| AG-4 Verifier | AG-4 | `glm-5.3-flash` | low | json_object | 0 | 2048 | 20000 | `prompts/AG-4/verify/v1.md` | 3,000,000 (shared) | 20,000 (shared) |
| AG-4 Redliner | AG-4 | `glm-5.3-flash` | low | json_object | 0 | 2048 | 60000 | `prompts/AG-4/redline/v1.md` | shared with the verifier | shared with the verifier |
| embedding | embedding | `Xenova/multilingual-e5-small` (local_onnx, ADR-009) | n/a | n/a | null | 512 (the input limit) | 5000 | none | 0 (local, unmetered) | 0 |

- Request shape, every chat task: `POST {base_url}/chat/completions` with `thinking: { type: "enabled" }`, `reasoning_effort` equal to the row's effort, `response_format: { type: "json_object" }`, `temperature: 0`, the row's `max_tokens`, `stream: false`; the prompt file is the system message and the envelope is the user message as canonical JSON (keys sorted, no whitespace), nothing concatenated into an instruction (AC-ANS-18). `AbortSignal.timeout(timeout_ms)` on every call; retries with backoff 500 ms then 2000 ms on timeout, 5xx and 429, at most two, each attempt its own `gateway_call` row with outcome `timeout` or `provider_error` and one `ok` row per logical call; a reply that is not JSON or fails the role's output schema is `parse_failed` with no retry (the caller's rule applies). The envelope is parsed against the role's input contract before any call, so a verifier envelope carrying a question is a thrown error, never a request.
- Why the AG-3 row moved on 2026-09-07, from `8192 / 120000 / prompts/AG-3/v1.md` to `16384 / 75000 / prompts/AG-3/v2.md`. AG-3 is the one role whose reply is a whole document, and the T4 live runs on the seeded corpus showed the first row could not produce one inside the drafting route's `maxDuration` of 300 s (ADR-004): of four live attempts on the GA-1201A cluster three ended at exactly 8192 completion tokens, which is a truncated reply that does not parse and costs the round its retry, and the one complete two-round draft took 352 s. Three measurements, in the order they were taken, settled the new row.
  - `max_tokens`. A complete draft returned 5904 and 6653 completion tokens under prompt v1 and 4284 to 6679 under v2, and only about 1200 of those are the reply itself: the JSON AG-3 returns canonicalises to 4033 to 5204 bytes, so the rest is reasoning, which the row cannot switch off (`thinking` is always on and the effort is `high`, Ghaisan's lock). 16384 is well over twice the largest complete reply measured and far inside this model's own maximum output length of 128K tokens (https://docs.z.ai/api-reference/llm/chat-completion, read 2026-09-07), so a truncated reply stops being a failure mode rather than being made rarer.
  - The envelope. What costs a drafting round its wall clock is the reasoning the envelope provokes, not the reply. The GA-1201A envelope was 63,228 bytes and, with its prompt, 22,345 to 22,440 input tokens, and one call over it returned in 122 and 146 s. `src/loop/evidence.ts` now sheds the six section bodies of an asset's approved lessons once the evidence passes its byte budget, which the drafter may not reproduce and does not need, since it refers to an approved lesson by its `opl_id` and reads what it teaches from `opl_steps`. The same envelope is then 38,565 bytes and 15,517 input tokens, and the same call returned in 50.1 and 58.5 s.
  - `timeout_ms`, which is the number that had to close against the 300 s. The gateway retries a timeout twice inside one call, so one AG-3 call costs up to `3 x timeout_ms` plus 2.5 s of backoff whatever the caller does. Across the runs, eight complete replies took 39.4 to 60.6 s and no reply ever arrived between 61 s and the cut: a call that misses that band hangs rather than answering slowly, so a timeout is a stall to abandon cheaply, not a reply to wait for. At 90,000 a run whose second round hit two stalls took 307.6 s, over the route. 75,000 is a fifth again the slowest complete reply, gives a whole retry ladder of 227.5 s, and leaves a first round of its measured 53 s and a second round's whole ladder inside the route.
  - What did not move: `reasoning_effort` stays `high` (D-05), the model id and the provider are unchanged, and the drafting stayed one AG-3 call per round. Splitting a round into two calls, one for sections 1 to 3 and one for 4 to 6, was measured and rejected: the reply is roughly 1200 tokens of the 5000 to 6700 a call returns, so two calls would reason over the same envelope twice and cost more wall clock than the one they replace.
  - The row as accepted, three live runs on the seeded corpus (version v1) against the GA-1201A cluster, each in its own sandbox as `supervisor_demo`: `in_review` in 52.0 s with 21 fields and a passing redline; `in_review` in 60.8 s with 22 fields, one slot and a passing redline that noted it; `blocked` in 113.1 s after two rounds, on a redline reason naming section 2's permit-controlled action. Ten AG-3 and AG-4 calls, every one `ok`, AG-3 returning 4298 to 5147 completion tokens against the 16384 cap, so nothing was truncated and nothing timed out.
- Price constants (`src/gateway/config.ts`), read from https://docs.z.ai/guides/overview/pricing on 2026-09-05 for `glm-5.3-flash`: list price USD 0.15 per 1M input tokens, USD 0.03 per 1M cached input tokens, USD 0.50 per 1M output tokens; a promotion at USD 0.075, 0.015 and 0.25 runs until 24:00 on 2026-09-09 (UTC+8) and is not relied on. The page does not state how reasoning tokens are billed; the gateway records the provider's `prompt_tokens` and `completion_tokens` as input and output. The spend estimate charges every input token at the uncached list price, so it over-estimates and never under-estimates.
- Currency constant for the IDR spend cap: USD 1 = IDR 17,656.567526, the open.er-api.com reference rate (exchangerate-api.com) of 2026-09-04T00:02:31Z; a configuration constant, refreshed by editing `config.ts`.
- The token and spend caps above are configuration policy, not measurements; the Admin surface displays them as read from the configuration (ARCHITECTURE 9.3). The daily check sums today's UTC `gateway_call.input_tokens + output_tokens` per role and prices them with the constants; at or above either cap the gateway returns `budget_exhausted` without a provider call.
- Confirmation run AC-EVAL-05: pending. The result, the model id and the prompt versions are written here when the run lands.
- Terms reading for Z.ai (training use, retention, processing region, access and payment from Indonesia): human-gated, to be recorded and dated by Ghaisan.

## Status

Accepted 2026-09-03
