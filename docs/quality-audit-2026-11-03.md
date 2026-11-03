# GlyphPoint quality audit — 3 November 2026

## Outcome and scope

The baseline had useful drawing and palette features, but several data-loss and input-handling defects made its save/export and editing workflows unreliable. This maintenance pass repairs the reproduced defects, establishes one maintained file, adds executable regression coverage and CI, and documents both user and development contracts. It does not declare a production release or universal browser certification.

**Baseline:** [`12f209718f1bf09d02cef84bbf5d8bd759e0ec5b`](https://github.com/techrote/GlyphPoint/commit/12f209718f1bf09d02cef84bbf5d8bd759e0ec5b). At inspection the repository contained three standalone HTML versions and a two-byte README, with no tests, workflow runs, open issues, or open pull requests. The newest `GlyphPoint-v1a-layout-fixed.html` contained the v1a application plus classic-layout adjustments, so it became the maintenance target. The other two HTML files retain their baseline content and are clearly labeled historical.

The audit covered source structure, drawing/selection algorithms, state/history, palette management, persistence, local files, HTML trust boundaries, browser workflows, repository documentation, and regression infrastructure. Two independent code-review passes examined editing behavior and file/security handling; a separate documentation pass checked instructions against source. Runtime changes were integrated centrally to avoid competing edits to the single HTML file.

## Contents

- [Repaired findings](#repaired-findings) — Defects, user impact, repairs, and verification routes.
- [Data contracts established](#data-contracts-established) — Bounded allocations and predictable saved-state behavior.
- [Verification evidence](#verification-evidence) — Local automated results, browser scope, and CI provenance.
- [Documentation delivered](#documentation-delivered) — User guidance and source-grounded agent context.
- [Remaining limitations](#remaining-limitations) — Explicit residual risks and useful next work.
- [Reproduction and maintenance](#reproduction-and-maintenance) — Commands and how to avoid overstating evidence.

## Repaired findings

Severity here prioritizes impact: **High** means lost/corrupted content or an unsafe export boundary; **Medium** means incorrect operations, state inconsistencies, or avoidable heavy work; **Low** means misleading UI/repository behavior. It is not a formal CVSS assessment.

| ID | Severity | Baseline problem and impact | Repair and verification |
| --- | --- | --- | --- |
| GP-A01 | High | `exportHtml` reset its buffer whenever a glyph changed without flushing the prior run. A row exported only its final glyph run; same-glyph style changes were not separated. | Emit every cell with explicit safe glyph/font/style classes. Browser tests compare complete exported text, styles, cell positions, and re-imported data. |
| GP-A02 | High | Imported `font` values were concatenated through `JSON.stringify` into a double-quoted style attribute. Ordinary quoting was malformed and malicious metadata could introduce attributes in a downloaded HTML file. | Normalize fonts to a fixed allowlist, use generated classes, escape text/embedded JSON, and restrict exported resource/script behavior with CSP. Hostile font and HTML browser fixtures verify no executable attributes or script effects. |
| GP-A03 | High | Project imports trusted dimensions and cell objects after only shallow format checks, then mutated live state before discovering failures. Invalid dimensions, cell counts, or records could corrupt the open document. Resize/Properties similarly lacked finite validation. | Validate candidate data and allocation limits before mutation. Browser tests reject zero/negative/fractional/excessive dimensions, invalid cells/control characters, mismatched arrays, and invalid JSON without changing current state. |
| GP-A04 | High | Palette normalization silently stopped at 72 entries while editing/importing could add more. Reloading or reopening lost later colours/labels. | Apply one explicit capacity, retain all valid entries, and reject overflow. A browser fixture opens/saves/reloads 80 non-space entries plus reserved space. |
| GP-A05 | High | Glyph-manager rename changed canvas glyphs without dirty state/history; Revert restored only the palette, leaving renamed artwork and some appearance changes behind. | Snapshot complete document state, align both rename paths, mark palette edits dirty, and make manager Revert restore the opening document. Model and browser tests exercise rename/revert/undo. |
| GP-A06 | High | Global keyboard commands intercepted text-field/dialog copy, cut, paste, undo, Delete, and punctuation; editing an input could modify artwork or zoom. | Guard editable targets, modal dialogs, IME composition, and handled events. Model and real-dialog tests verify typing and native text shortcuts stay isolated. |
| GP-A07 | Medium | Free-form transforms and crops used the entire bounding rectangle, altering or including cells outside the mask. | Move/transform only selected coordinates; crop fills holes with blanks. Regression fixtures preserve distinct unselected cells. |
| GP-A08 | Medium | Paste/move left selection bounds outside the field; later capture could produce invalid cell objects. | Clip landed bounds/masks and exclude out-of-bounds cells from capture. Tests cover rectangular/free masks and stale selections. |
| GP-A09 | Medium | Cut awaited browser clipboard completion and then deleted whichever selection was current. Pending external paste could target a changed/new document. | Capture source/destination before awaiting; cut the original region synchronously; cancel a stale external paste on document revision changes. Delayed-promise regressions cover both races. |
| GP-A10 | Medium | Copy performed a linear search through every captured cell for every output character. | Use an indexed Map for text reconstruction. Masked crop likewise copies selected coordinates once rather than repeatedly scanning masks. Correctness is tested without fragile timing thresholds. |
| GP-A11 | Medium | Even brush/stroke widths produced an extra row/column. Shape indexes could wrap horizontally into another row; box-line neighbours connected across edges; zero-height ellipses generated invalid geometry; shallow diagonals dropped points. | Exact footprints, bounds before linear indexes, bounded neighbour lookup, degenerate ellipse handling, and direct line traversal. Deterministic geometry tests reproduce the edge cases. |
| GP-A12 | Medium | Undo omitted background, square mode, active slots, and document identity; background/palette edits often did not snapshot or mark dirty. | A shared complete-document snapshot powers undo/redo and manager Revert, with grouped colour gestures and a finite combined history budget. Regression tests restore all relevant fields and exercise capacity limits. |
| GP-A13 | Medium | Opening a file could replace dirty artwork without warning; there was no exit warning or newer-import guard. | Validate first, confirm immediately before replacing dirty state, ignore superseded reads, reset transient gestures on New/open, and request browser page-exit protection. Download-completion limitations remain documented. |
| GP-A14 | Medium | HTML import discarded colours/styles/background from its own export and included script/style text as artwork. | Native exports contain inert escaped project JSON for full normalized round trips. External `<pre>` import copies only supported text/styles from unattached template content; browser probes confirm no script/resource effects. |
| GP-A15 | Medium | Palette changes could leave missing active choices, stale on-screen colours, or used glyphs absent from the palette. A full palette without blank space could make erase/New/save unusable. | Reserve U+0020 within capacity, block its removal/rename, retain used entries, choose valid fallback slots, re-add reused glyphs before rendering, and make Reset capacity-safe. Boundary regressions cover these interactions. |
| GP-A16 | Medium | Transparent and Opaque text both erased underlying spaces; newline/tab/Unicode handling differed across import/paste paths. | One bounded code-point text parser; transparent text skips blanks and opaque text writes them. Four-column tabs and documented newline/padding rules apply consistently. |
| GP-A17 | Low | Cancelled pointers could leave drawing active; ruler offsets and zoom margins became stale; some controls/dialogs lacked accessible names. | End gestures on cancel/lost capture/blur; resynchronize rulers and zoom; reserve Classic scrollbar width without clipping controls; label controls/dialogs and status output. These repairs do not establish keyboard-only canvas or accessibility conformance. |
| GP-A18 | Low | UI/palette persistence failures were silent despite messages suggesting local persistence. The app title said v10 while filenames said v1a. | Show session-only persistence guidance when storage writes fail, use a neutral product title, and document the canonical file and actual storage model. |

## Data contracts established

- **Dimensions:** integer 1–512 per axis, at most **65,536 cells overall**.
- **File imports:** **16 MiB** maximum before read/parse.
- **Palette:** **4,096 total entries**, including the reserved space; valid entries are retained or an operation is rejected rather than silently truncated.
- **History:** at most **60 undo+redo snapshots** and **262,144 retained cell records** combined. The nearest usable history is retained as budgets trim older entries.
- **Characters:** one supported Unicode code point per cell, with explicit rejection of control/lone-surrogate/line-separator values unsuitable for a grid cell.
- **Document model:** one global foreground per glyph, one field background, per-cell font/style flags, and optional square-cell geometry.
- **Formats:** existing v1/v2 JSON readers remain; v2 remains the output schema. External HTML is a documented subset; native exported HTML has validated embedded project data.

See [the format reference](project-format.md) for field-level behavior and intentional normalization. These bounds are guardrails for this implementation, not hardware-independent latency promises.

## Verification evidence

### Editor and source checks

The Node suite executes actual application functions extracted from the maintained HTML, omitting startup and stubbing rendering. **32 deterministic editor/file regressions passed locally** after the repairs. They cover geometry, free selections, clipping, async clipboard behavior, keyboard isolation, full history, reserved-space/palette capacity, reused glyphs, and history budgets.

Against the original baseline, 15 of the first 16 regressions failed; the Unicode copy-content regression passed on the baseline. This establishes that the suite detects the principal original bugs rather than merely mirroring the new implementation. The baseline comparison is narrower than the final expanded suite.

`npm run check` parses the complete shipped JavaScript, checks static IDs/self-containment, and validates local Markdown links and heading references. The suite has no runtime package dependency.

### Real-browser workflows

The twelve Chromium workflow scenarios passed locally under **Playwright 1.56.1 / Chromium 141.0.7390.37**. They opened the actual local application file and exercised JSON/text/HTML downloads and reimports, both UI modes, malformed imports, palette persistence, manager Revert, dialog typing, malicious font values, and inert HTML containing remote resources. Both mode screenshots were visually inspected and exported grid positions were checked numerically.

The browser harness records and blocks external HTTP(S) attempts and fails unexpected requests and uncaught page errors. The hostile fixtures produced neither executable effects nor requested resources. This is test evidence for those paths, not a proof covering arbitrary future changes.

Matching **Firefox 142.0.1** was installed locally, but the local execution environment rejected creation of its sandboxed content process (`/proc/self/uid_map: EPERM`). Its sandbox was not disabled and this local lane is **not counted as passing**. The same Firefox suite subsequently passed on the standard Ubuntu GitHub Actions runner, as recorded below.

The twelve scenarios include real-pointer cancellation/secondary drawing, appearance undo, invalid Properties/Resize preservation, and transparent text. Classic sidebar containment was checked at 1440 × 720 and through repeated height changes after repairing scrollbar-gutter clipping. The exact final count and CI result belong to the tested commit's workflow logs; do not infer a remote pass from a local Chromium pass.

### CI provenance

[Quality](../.github/workflows/quality.yml) contains two bounded jobs: source/docs/editor tests, and Chromium plus Firefox workflows. It uses Node 24, exact Playwright/lockfile versions, pinned action commit IDs, read-only repository permissions, per-ref concurrency cancellation, and finite timeouts. It runs on PRs and pushes to `main`; branch pushes do not duplicate PR runs.

On 3 November 2026, [hosted run 41699814029](https://github.com/techrote/GlyphPoint/actions/runs/41699814029) completed successfully for PR #1 head `e8a962996da11f0e961984f91833acdce6af0d43`. Both jobs succeeded. The inspected logs record **32 Node regression passes, 12 Chromium scenario passes, and 12 Firefox scenario passes**. The runtime was independently reviewed at that head with no remaining merge blocker. The subsequent documentation corrections do not change the runtime.

Consult [GitHub Actions](https://github.com/techrote/GlyphPoint/actions/workflows/quality.yml) and [PR #1](https://github.com/techrote/GlyphPoint/pull/1) for final-head and post-merge provenance. The local Firefox sandbox failure above remains a local-environment limitation; it is distinct from the successful hosted Firefox qualification.

## Documentation delivered

| File | Audience and purpose |
| --- | --- |
| [README](../readme.md) | Canonical launch path, capabilities, docs directory, limits, and developer checks. |
| [New-user guide](new-user-guide.md) | Guided first drawing, project download/reopen, export choices, and early troubleshooting. |
| [Instruction manual](manual.md) | Comprehensive control-by-control operation, workflows, formats, shortcuts, limitations, and troubleshooting. |
| [RAG reference](../RAG.md) | Twelve retrieval chunks with source symbols, invariants, task routing, schema/test maps, and evidence discipline. |
| [AGENTS](../AGENTS.md) | Repository instructions for future agents, preserving the single-file architecture and authorization boundaries. |
| [Contributor guide](../CONTRIBUTING.md) | Development commands, testing layers, implementation conventions, and review process. |
| [Format reference](project-format.md) | Exact data schemas, normalization, imports/exports, and storage behavior. |
| [Security](../SECURITY.md) | Trust boundaries, network/storage handling, and qualified security-reporting guidance. |
| [Change log](../CHANGELOG.md) | User-visible repairs and repository improvements. |

The documentation avoids claiming unsupported layers, raster import, ANSI-colour export, autosave, grapheme support, or platform certification. No license was added: project licensing remains an owner decision.

## Remaining limitations

**Data durability:** Save is a browser download request; the page cannot prove the file reached permanent storage. There is no autosave or recovery inventory. Keep project downloads and verify reopening them. Browser preferences are not an artwork backup.

**Scale and responsiveness:** Rendering uses one DOM span per cell; fills, reflows, palette updates, and much of history are synchronous. Large fields/palettes can still stall despite allocation budgets. Future performance work should measure representative fields and consider batching/virtualization or workers without weakening validation/history semantics.

**Typography and interchange:** One code point is not one grapheme or terminal display column. Font fallback, wide glyphs, combining marks, emoji, and OS rendering can differ. Global per-glyph foreground and shared background cannot reproduce arbitrary per-cell styled HTML. External HTML imports support a narrow style subset; native project/HTML files are the reliable editable formats.

**Accessibility and devices:** Controls have improved names and dialog-key isolation, but keyboard-only grid drawing, full screen-reader interaction, mobile touch/pen behavior, and formal accessibility conformance remain unqualified. Physical Windows/macOS and browser permission-prompt checks remain useful before making platform-specific claims.

**Geometry and printing:** Skew is a clipped forward mapping and can overwrite or leave holes. Selection destinations may overwrite other cells; out-of-field destinations are clipped. Printed output depends on browser pagination/background settings and needs human preview. These are documented behaviors, not silently promised lossless operations.

**Historical files:** The two older snapshots retain the original defects. They remain available for provenance, not recommended editing/import entry points.

## Reproduction and maintenance

```sh
npm run check
npm test
npm ci
npx playwright install chromium firefox
npm run test:browser
```

Use `npx playwright install --with-deps chromium firefox` on Linux hosts lacking system libraries. Tests may run with `GLYPHPOINT_APP` set to an absolute alternative source file for baseline comparisons. Do not weaken the suite or disable a browser sandbox to conceal an environment limitation.

Future reviews should distinguish code review, model tests, headless browser checks, hosted CI, and physical user acceptance. Report the actual source identity and what was observed; update this report with follow-up evidence without rewriting the historical baseline as if it had always been healthy.
