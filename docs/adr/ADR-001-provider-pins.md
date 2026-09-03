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

- Confirmation run AC-EVAL-05: pending. The result, the model id and the prompt versions are written here when the run lands.
- Terms reading for Z.ai (training use, retention, processing region, access and payment from Indonesia): human-gated, to be recorded and dated by Ghaisan.

## Status

Accepted 2026-09-03
