# GlyphPoint implementation follow-up — 3 November 2026

This report tracks the requested implementation of limitations identified in [the first quality audit](quality-audit-2026-11-03.md). Its starting accepted commit is [`7d2a6a6657e8582d5522067adf54572ac3be8f84`](https://github.com/techrote/GlyphPoint/commit/7d2a6a6657e8582d5522067adf54572ac3be8f84). The candidate version is **2.0.0-rc.1** and the new saved-project format is **glyphpoint-v3**.

## Implementation coverage

| Requested issue | Implemented solution | Verification route |
| --- | --- | --- |
| Canvas not autosaved | Debounced IndexedDB recovery with periodic checkpoints during continuous editing; explicit validated recovery; transaction-complete status; unique tab/document keys; bounded archive and pending queue; quota/unavailable/corruption handling. | Recovery unit tests and real IndexedDB reload, concurrent-tab, retention, rollback, and corrupt-record browser scenarios. |
| Save only requests download | Capability-detected direct writes and Save As with per-document handles; success after writable close; revision/identity checks; explicit download fallback that stays dirty. | Saver cancellation, write/close failure, concurrent edits, document replacement, budget, and download tests. Physical native picker acceptance remains separate. |
| Synchronous DOM canvas | Two viewport-sized Canvas2D surfaces, visible-cell culling, dirty-cell invalidation, bounded animation-frame painting, finite pixel budgets; worker/cooperative fill and resize/skew with cancellation and one-step commits. | Maximum-size 800% zoom/backing-size tests, pixel/PNG comparisons, live-frame worker completion/cancellation tests. Other bounded model operations and inert HTML parsing still run on the main thread. |
| One code point per cell | Browser grapheme segmentation, streaming text iteration, up to 32 code points per cell/palette glyph, cross-node grapheme preservation in HTML. | Combining-letter, joined-emoji, flag, invalid/control/overlong cluster, tab, and row-budget tests. |
| One colour per glyph/shared background | v3 optional cell foreground/background overrides with palette/field inheritance; cell-style dialog and brush defaults; style-preserving selection/transform/export. | Same-glyph differently coloured cells, visible pixels, independent undo, v3 JSON and HTML round trips. |
| Font-dependent output | Four embedded DejaVu Sans Mono faces as the new-cell default; font application control; embedded fonts/notices in HTML; full-field PNG/print rendering. | Fonts/load and PNG pixel tests. Missing character coverage and explicitly selected device fonts remain subject to fallback. |
| Narrow HTML styling | Bounded inert CSS parser with supported selectors, cascade/inheritance, named/RGB/HSL colours, alpha flattening, and text styles. | Adversarial and maximum-field importer tests with zero unexpected network requests. Unsupported CSS remains an explicit subset. |
| Clipping/skew loss | Default expansion, reject and explicit clip choices; preflight dimension/palette budgets; negative-origin expansion; inverse-sampled horizontal then vertical shear; shrink confirmation. | Edge/mask/style/undo regressions, reject atomicity, expanded bounds and shear interior coverage tests. |
| Unqualified platform/accessibility workflows | Keyboard field navigation/editing, live row/column/cell descriptions, readable text, touch secondary/pan controls, responsive targets, three bounded hosted OS profiles and a physical acceptance record. | Integrated keyboard, modal cancellation, target-size/containment and touch-emulation tests. See [platform qualification](platform-qualification.md) for evidence boundaries. |
| No license/release preparation | Owner-decision document, independent font notices, versioned notes, deterministic ZIP/checksum/manifest, CI candidate artifact, guarded manual draft-release workflow. | Package archive/hash review and workflow inspection. Root project license and GitHub release publication await the owner's license choice. |

## Architecture and compatibility decisions

Development sources live under `src/`; [scripts/build.cjs](../scripts/build.cjs) deterministically assembles the maintained HTML with embedded font assets. End users still open one offline file. `npm run check` rejects a stale generated artifact, and tests execute the shipped code or verify exact module parity.

Legacy v1/v2 projects retain their earlier appearance. Valid old cell foregrounds can seed palette entries that were missing, as before; ignored old cell overrides are then cleared. v3 stores per-cell colours intentionally. Invalid imports and over-budget results fail before document replacement. The earlier HTML snapshots remain historical.

Recovery checkpoints, file save state, and undo history are distinct. Checkpoint success does not certify a portable file. Undo across document identities resets a retained direct-save handle so it cannot target a different document's file. Worker results are committed only while their captured document revision remains current.

## Continuation review

The interrupted implementation was recovered intact at local commit `499c38ebb77bf7c2e8b596ef8bf0f7dbb692ee06`. Three independent reviews examined persistence and asynchronous document operations, rendering/interchange, and keyboard/platform/release behavior before publication. The continuation addresses these reproduced defects:

| Finding | Correction and regression coverage |
| --- | --- |
| An edit made after requesting checkpoint deletion could be marked as already saved when deletion completed. | Bind deletion suppression to its requested revision and retain a pending checkpoint for newer edits. |
| Save As could remember a new destination while keeping the old displayed filename after a concurrent edit. | Keep the completed destination and document name consistent while retaining the dirty state of newer edits. |
| A delayed palette import could alter a recovered or restored document. | Guard asynchronous imports against document lifecycle changes and stale revisions. |
| A supported descendant CSS selector could choose the nearest matching ancestor and miss a valid farther match. | Use bounded, memoized ancestor backtracking; compare imported styles with actual browser-computed styles and retain the matching-work budget. |
| Pasting a new glyph could update the model without exposing its palette button or saving its preference. | Refresh and persist palette UI once after the paste; verify selection, Undo/Redo, and stored preferences. |
| Semantic palette activation did nothing, and keyboard selection detached the focused button. | Use native button activation and update slot highlights in place; verify semantic click, keyboard focus, Tab, secondary selection, Edit mode, and touch. |
| Glyph Colour Manager inputs lacked individual accessible names. | Name each input/action with its glyph and verify the browser-accessible control names. |
| Selected rotation in Clip mode discarded overflow without identifying the loss in its completion message. | Report the explicit Clip outcome and cover it with a regression. |

The initially suspected resize-cancellation obstruction was ruled out: validation finishes before the modal closes, and the job's Cancel control and Escape path already have a browser regression. Physical-device and actual screen-reader acceptance remain separate from these automated controls and focus checks.

## Verification evidence

Before the continuation repairs, the recovered candidate passed **84 Node regressions** and **37 Chromium browser scenarios**. The rebuilt continuation passes **93 Node regressions** and **40 Chromium browser scenarios** (17 integrated editor, four renderer, five recovery, fourteen interchange), exact generated-source agreement, 152 unique static HTML IDs, and 221 local documentation links. The browser suite opens the shipped offline HTML, checks actual downloads/pixels/input, and rejects unexpected external requests and uncaught errors. Mobile Ribbon and Classic controls passed target-size, overlap, toolbar, and status-containment assertions. Independent cross-review accepted the persistence, CSS/paste/transform, and palette accessibility repairs with no remaining blockers in the reviewed scope.

Independent review also verified ZIP CRCs, safe/unique members, every per-file hash/size, matching embedded/external manifests, deterministic timestamps, and byte-identical repeated packaging. A measured local 65,536-cell/4,096-glyph rebuild improved from about 805 ms to 85 ms after replacing repeated linear palette lookup; this is an environment-specific observation, not a timing guarantee.

Hosted exact-candidate results will be recorded in the integration PR and linked here after the complete configured profiles finish. A local Chromium pass is not substituted for the remote results.

The hosted profiles are Linux Chromium/Firefox/WebKit full workflows, Windows Chromium smoke, and macOS WebKit smoke. Firefox/WebKit simulated pan handlers are exercised with controlled synthetic PointerEvents; Chromium uses protocol touch injection. A synthetic handler check does not establish real-device touch or pointer-capture acceptance. Local Firefox cannot create its sandboxed content process in this environment; local WebKit lacks system libraries. Browser sandbox protections were not disabled to obtain passes. These local limitations do not establish a hosted pass or failure.

## Remaining decisions and physical acceptance

The owner must select the project license and copyright name. [Release process](release-process.md) describes the concrete package and workflow awaiting that choice. This candidate does not invent a license or claim that a GitHub Release was published.

Physical device/screen-reader testing cannot be replaced with a headless CI result. [Platform qualification](platform-qualification.md) supplies the actual workflows and record template for Windows/macOS/mobile, native saving, touch/stylus, printing, NVDA and VoiceOver. Report observed failures against the tested commit rather than claiming universal accessibility or device support.
