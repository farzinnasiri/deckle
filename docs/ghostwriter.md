# Ghostwriter

Ghostwriter reads existing writing when the writer presses Check. Three small switches control the pass: Fixes, Style, and Review. Fixes and Style start enabled; Review starts disabled. A selection limits the editable scope while the whole current paper supplies context. Checking never changes ink.

Fixes correct clear spelling, grammar, punctuation, accidental duplicate words, and unambiguously wrong vocabulary. Each has one correction. Style offers optional improvements to phrasing, concision, rhythm, and repetition. It provides up to three useful alternatives, with the recommendation first. A repeated-word pattern can be one finding covering several passages with different replacements. Review gives evidence-based reader feedback on clarity, pacing, narrative continuity, and delivery. It asks for the author's judgment and contains no executable replacement.

An ivory proof tape rises from a dark mechanical head beside the paper. Arrows move between findings and feed their highlighted ink into view. Choosing a Style alternative changes the preview only. Apply runs the visible correction or chosen alternative through the machine. Apply all uses each remaining finding's chosen alternative, or its first recommendation. Dismiss excludes a finding from application. Review feedback has no Apply action and never enters bulk playback. The tape fits short findings and scrolls longer ones within a fixed slot. Numbered radio rows show Style alternatives directly; the recommended option appears first. The counter and Apply key stay in the head below the tape. Desktop placement and scene framing remain fixed; phones reserve a lower tray shared with the hardware options.

Closing the tape keeps the highlights; click one to return, or Check for a fresh pass. Reviews live in memory for the current paper and account. Unchanged desk handoffs, formatting, caret movement, and light changes preserve them. Whitespace changes rebase anchors and every alternative. Correcting one affected occurrence retains the others, including other passages in a grouped finding. Unrelated prose changes invalidate the pass. A grammar correction preserves nearby feedback; rephrasing its evidence clears that feedback. Undo and redo restore matching text, choices, and dismissals from a bounded history. Reloading, switching papers or accounts, or a successful new check replaces the pass.

## Mechanical application

The paper feeds to each passage before the machine erases and retypes only the changed letters. Edits run from the bottom upward. Stop, Escape, clicking the paper, moving the carriage, or typing takes over. The editor restores an unfinished replacement before human input continues. Completed replacements remain; pending ones stay available. Undo restores an individual Apply or whole Apply all batch as one step. Reduced motion applies local replacements at once. Edits retain ribbon and formatting and do not count toward daily writing activity.

The hardware drawer retains its metal switches, On/Off lamps, Check key, sounds, and existing placement. Check remains depressed with amber feedback while reading or applying, including backend retries. Escape cancels a check; closing the drawer leaves inference running. Completion releases the key with a green signal; failures show an explanation. Switch changes affect the next check. Notes and Ghostwriter close one another without cancelling a request. Results arriving behind Notes or Settings remain put away. Side placement uses a viewport of at least 1100 by 480 pixels outside the phone layout; narrower layouts use the bottom tray.

## Finding contract

The strict JSON schema has separate branches for each category: Fix requires exactly one alternative, Style one to three, and Review zero. Invalid output retries receive the validation reason. Failure logs record the attempt, stage and static validation message without the paper or generated wording.

The response contains findings rather than a flat replacement list:

```json
{
  "findings": [
    {
      "kind": "style",
      "title": "Repeated emphasis",
      "reason": "Two nearby uses of really weaken the emphasis.",
      "anchors": ["I was really tired.", "It was really cold."],
      "alternatives": [
        {
          "label": "Trim the repetition",
          "edits": [
            { "before": "I was really tired.", "after": "I was tired." },
            { "before": "It was really cold.", "after": "It was cold." }
          ]
        },
        {
          "label": "Keep the intensity",
          "edits": [
            { "before": "I was really tired.", "after": "I was exhausted." },
            { "before": "It was really cold.", "after": "It was freezing." }
          ]
        }
      ]
    }
  ]
}
```

Kinds are `fix`, `style`, and `review`. Fix requires exactly one alternative; Style requires one to three, without manufactured synonyms; Review requires zero. Every finding has a title, reason, and exact supporting anchors. Each replacement must lie within one of its finding's anchors. Empty `after` removes text. Insertions quote enough context to locate the missing words. Model-provided offsets are never trusted.

`ghostFindings` in `lib/ghostwriter.ts` locates every quotation uniquely within scope and attaches UTF-16 offsets. Server and browser both reject missing or ambiguous quotations, protected clippings, disabled categories, duplicate alternatives, malformed findings, and conflicting changed ink across any combination of alternatives. Separate edits may share unchanged quotation context. The low-level `ghostEdits` validator and playback reject executable Review edits. `lib/ghost-review.ts` owns selection, dismissal, rebasing, and history. The editor rechecks source ink and clipping provenance before application.

The system prompt lives in `ghostInstructions` in `lib/ghostwriter.ts`. It preserves dialect, fragments, register, meaning, uncertainty, imagery, and the writer's intention. It distinguishes correctness from taste and asks the reader to describe a concrete difficulty instead of declaring the writing objectively wrong. It forbids continuation, invented content, automatic paragraph rearrangement, generic praise, and ratings. A pass may legitimately return no findings.

## Backend

Sign-in and an operator-assigned Ghostwriter feature flag are required for inference. Unassigned accounts do not see the controls and cannot start a check. See [feature flags](feature-flags.md) to enable or revoke a tester. Local writing and cloud saving remain independent. The authenticated Next.js route at `POST /api/ghostwriter` checks the Clerk account and origin, then uses Deckle's existing secret-protected Convex bridge to invoke an internal action. No provider credential reaches the browser. Convex mints a short-lived service token with `getServiceToken("ai-gateway")`. No new SDK is needed.

The model receives the current paper, editable range, protected clipping ranges, and enabled categories. It returns suggestions under the contract above. A response to an outdated paper is discarded. Review and application happen locally and do not require another inference call.

Only the current paper is sent when Check is pressed. Notes and the archive are not sent. Prompts and model responses are not saved separately or logged by this integration. Applied changes become ordinary local editing/replay events with `origin: "ghost"`, and follow the desk's existing cloud-save choice. The gateway request requires zero-data-retention endpoints and providers that do not collect data; if none are available, the request fails. Provider usage and billing metadata can still be retained.

Each pass reviews the complete editable scope, up to 12,000 UTF-16 code units, and returns all needed corrections without a suggestion-count cap. Inference makes at most three attempts, each with a 90-second timeout and a 16,000-token output allowance including reasoning. Truncated responses are retried rather than exposed as a partial review. Provider errors, network/timeouts, and unusable generated output retry after one second, then two seconds. Only the third inference failure is shown to the user, with sanitized diagnostics. Input, account, authentication, and local admission failures keep their immediate errors. The pass reserves and counts once across all attempts. The bridge allows 285 seconds, the browser 290 seconds, and the route 300 seconds, covering 273 seconds of inference and backoff. Per-account admission allows one active request, at least ten seconds between starts, and 30 starts per UTC day. Failed requests count toward the allowance because providers may charge for them. Stopping discards an outstanding response; a Convex action already running can finish its remaining attempts and still incur a charge. Reservations expire after five minutes if an action fails before cleanup.

The shared Convex deployment also serves the published frontend. The HTTP bridge accepts its older grammar/wording/structure options during rollout and returns the first recommended corrections in the old flat contract. Its Structure switch requests style alternatives, since that client can only display executable corrections. It merges overlapping quotation context so the published validator can still read independent corrections. A merged result beyond the older contract returns an explicit 422 error and leaves the paper unchanged. Remove `lib/ghostwriter-legacy.ts` after the frontend rollout. New clients receive the full finding contract.

## Model choice, checked 16 October 2026

The first model is `z-ai/glm-5.3-flash`, at `reasoning.effort: "low"`. Z.ai's latest Flash model requires reasoning and supports low, high, and max. Disabling thinking is rejected. Low is appropriate for a short copyediting pass. The prompt asks for minimal changes and preserves language, dialect, contractions, intentional fragments, facts, and meaning.

OpenRouter currently lists common GLM 5.3 Flash endpoints at $0.15 input and $0.50 output per million tokens, with observed provider throughput of roughly 86 to 187 tokens per second across several standard-price endpoints. These are provider observations, not Deckle measurements. Convex chooses the serving provider and does not accept throughput-based routing preferences. Requests cap acceptable provider prices at $0.50 input and $1.00 output per million tokens to prevent an unexpectedly expensive route. No frontier fallback is configured.

Claude Haiku 5.5 is the strongest next candidate to compare, at listed standard endpoint rates of $0.10 input and $0.50 output and 115 to 185 tokens per second. Kimi K2.6's listed headline output price is $3.20 per million tokens. Gemini 3.8 Flash lists $3.75 output at its current discount and roughly 81 to 106 tokens per second. Those two cost more for this small task. No public speed or coding benchmark establishes which best preserves a writer's voice. A comparison on representative English, Persian, and other user writing is still needed before claiming a quality winner.

Sources: [Convex setup](https://docs.convex.dev/ai-gateway/setup), [models](https://docs.convex.dev/ai-gateway/models), [gateway HTTP API](https://docs.convex.dev/ai-gateway/api), [Z.ai reasoning controls](https://docs.z.ai/guides/capabilities/thinking), [GLM pricing and throughput](https://openrouter.ai/z-ai/glm-5.3-flash), [Haiku](https://openrouter.ai/anthropic/claude-haiku-5.5), [Kimi](https://openrouter.ai/moonshotai/kimi-k2.6), [Gemini](https://openrouter.ai/google/gemini-3.8-flash).

## Setup and validation

Use the existing Clerk and Convex bridge configuration. The linked Convex team needs AI Gateway access on a paid plan. No separate model-provider key is required. Sync backend changes to the intended development deployment before live inference. This project shares that deployment with the public app, as documented in the README.

Run `npm test`, `npm run typecheck`, and `npm run build` before publishing. Automated coverage includes finding validation, alternatives and conflicts, grouped edits, dismissal, protected clippings, Unicode, rebasing, interruption, undo/redo, legacy bridging, authentication, retries and reservation cleanup.

For browser verification, sign in with the ignored development test account and temporarily enable its Ghostwriter flag. Use the mixed fixture in `tests/ghost-editorial.test.ts` to check that choosing changes no ink, Apply uses the selected alternative, Apply all excludes feedback and dismissals, and Undo restores text and choices. Check both desktop and phone layouts, selection edge scrolling, Escape interruption and typing takeover. Revoke the test flag and remove generated artifacts afterward.

A live gateway check verifies integration, not broad editorial quality. Physical phone keyboards and representative multilingual model quality require separate checks.
