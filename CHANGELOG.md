# Change log

## 2.0.0-rc.1 — 2026-11-03 (release candidate; not published)

This follow-up implements the requested persistence, rendering, Unicode, colour, interchange, and interaction improvements. The maintained entry point remains `GlyphPoint-v1a-layout-fixed.html`; the current project schema is `glyphpoint-v3`. Candidate packaging and draft-release tooling are present. Project-license selection and exact-commit CI qualification remain explicit release gates; the version label is not a claim that a release has been published or every configured platform has passed.

### Recovery and file saving

- Added automatic IndexedDB checkpoints with a 750 ms edit debounce and five-second maximum scheduling interval. Recovery is explicitly selectable after reload and includes document names, dimensions, timestamps, and deletion controls.
- Bounded the archive and pending serialized writes to 12 document sessions/32 MiB payload, with 16 MiB per checkpoint. Added unique tab/document identities, atomic write/eviction, stale-write protection, and visible unavailable/quota/busy errors.
- Added native file-picker Save and Save As when supported, plus explicit Download project JSON and a browser download fallback. Direct writes clear dirty state only after successful completion of the current revision; download requests remain dirty because their completion cannot be verified.
- Reset remembered save destinations on document changes and protected pending save/recovery work against newer revisions and document replacement.
- Repaired continuation-review races involving edits during checkpoint deletion, Save As destination names during concurrent editing, and delayed imports across document restoration.

### Rendering, jobs, and appearance

- Replaced one-DOM-span-per-cell rendering with a viewport-based Canvas 2D renderer, scheduled paint budgets, separate overlays, and hit testing that accounts for scrolling, zoom, and display scale.
- Moved Flood fill and Resize/Skew into cancellable worker jobs with progress, revision guards, atomic installation, and a cooperative fallback.
- Embedded DejaVu Sans Mono 2.37 regular, bold, oblique, and bold-oblique faces with provenance hashes and their independent license notice. New cells use the bundled font; existing cell font choices remain supported.
- Added glyph fitting, complete-field PNG export, and Print preparation using the complete artwork rather than the current viewport. PNG fixes the exported pixels when font fallback differs between viewers.

### v3 data model and interchange

- Added one extended Unicode grapheme per cell/palette entry, up to 32 code points. Combining marks, joined emoji, and flags remain together; long rows use streaming validation and invalid/overlong clusters are rejected without truncation.
- Added independent cell foreground/background overrides alongside palette/field inheritance, including painted space backgrounds. Cell colours can apply to the selection/focused cell or become brush defaults.
- Preserved colour/style data through copy, move, transforms, text placement, history, recovery, JSON, and native HTML. v1/v2 migration seeds missing palette defaults where required before clearing legacy ignored cell overrides.
- Expanded inert foreign-HTML import to inherited inline and embedded stylesheet rules, supported CSS specificity/order/`!important`, named/RGB/HSL colours, alpha compositing, per-cell colours, supported fonts/styles, and line/visibility handling.
- Added explicit warnings for unsupported HTML/CSS and bounded node/depth/style/rule/selector/declaration/matching work. Imported resources/scripts remain inert and external CSS/fonts are not fetched.
- Corrected supported descendant selectors to try farther valid ancestor matches under the same bounded matching-work limit.
- Updated standalone HTML export with v3 embedded project data, individual colours, bundled-font data/notices, fitted glyph sizing, and safe resource policy/escaping.

### Editing and input workflows

- Added Expand to fit, Reject overflow, and explicit Clip overflow policies for paste, selection moves, text placement, and selected transforms. Expansion is validated before mutation; Properties asks before shrinking away non-empty or styled cells.
- Replaced forward-write skew with inverse-sampled sequential horizontal/vertical shear and a separate Skew edges choice. Oversized transformed bounds are rejected intact.
- Added keyboard grid focus/navigation, Shift selection, Space/secondary painting, text entry, deletion, Home/End/Page movement, Select All, and focused-cell descriptions.
- Added a complete Readable text/copy-all view, keyboard palette selection, a secondary-glyph toggle, touch pan controls, and responsive ribbon/classic layouts with larger touch targets.
- Preserved palette-button focus during slot selection, enabled native/assistive click activation, and named Glyph Colour Manager inputs/actions individually.
- Kept newly pasted glyph controls/preferences synchronized and made clipped selected transforms explicitly report discarded overflow.
- Matched flood-fill regions by glyph and stored foreground/background settings; Ignore blanks retains deliberately painted space backgrounds.

### Source, documentation, qualification, and releases

- Split editable runtime sources into `src/` modules and a template, with deterministic assembly of the same single-file application. Source/build consistency is now a required check.
- Expanded model, recovery/save, renderer, grapheme/HTML, job, edge, browser, and interaction regressions against the shipped implementation.
- Configured Quality as four expanded jobs: source/docs/model/package checks, full Linux Chromium/Firefox/WebKit suites, Windows Chromium smoke, and macOS WebKit smoke. Configured coverage is a qualification plan until the exact revision passes; physical-device and assistive-technology evidence remain separate.
- Added reproducible candidate ZIP/checksum/source-manifest packaging and a manual draft-prerelease workflow gated on an owner-selected root `LICENSE` and successful Quality results for the exact main commit.
- Reworked the new-user guide, comprehensive manual, format/RAG references, developer/security guidance, platform qualification, follow-up audit, and release/license decision documents. Historical audit/changelog entries remain scoped to their original revisions.
- Left the application license for an explicit owner decision. The bundled font's Bitstream Vera/DejaVu notice is independent and does not license the project.

See [candidate notes](releases/v2.0.0-rc.1.md), [implementation follow-up](docs/quality-followup-2026-11-03.md), [platform qualification](docs/platform-qualification.md), and the [release process](docs/release-process.md) for the evidence and remaining gates.

## 2026-11-03 — Quality and documentation pass

The maintained application remains `GlyphPoint-v1a-layout-fixed.html`. The earlier HTML files are preserved as historical snapshots. This entry records a maintenance pass, not a published release or a new project schema.

### Data integrity and file handling

- Repaired HTML export so every cell and style is retained; safe styling/escaping and inert embedded v2 project JSON support editable round trips.
- Added validation and finite budgets for imports, dimensions, cell counts, palettes, fonts, Unicode, and resize/skew controls.
- Replaced active-document HTML parsing with inert template parsing and a limited text/style importer.
- Removed silent 72-entry palette truncation; reserved space ensures blank/erase operations remain valid at palette capacity.
- Made failed imports transactional, guarded superseded asynchronous reads, and added dirty-document/page-exit protection.
- Normalized text BOM/CRLF/CR, four-column tabs, Unicode widths, ragged rows, and final-newline handling.

### Editing correctness

- Protected native text-field/dialog shortcuts from canvas commands and added Ctrl/Command+Shift+Z redo.
- Completed document history for background, square mode, slots, palette, and identity; bounded combined history memory.
- Made palette changes dirty/undoable; aligned glyph replacement paths and made manager Revert restore renamed canvas content.
- Preserved free-form masks through transforms/crop, clipped moved/pasted selections, and repaired asynchronous cut/paste races.
- Replaced quadratic clipboard lookup and masked crop traversal with indexed/linear copying.
- Corrected even brush/stroke sizes, edge wrapping in shape outlines/box glyphs, degenerate ellipses, and diagonal segment traversal.
- Implemented transparent text's space-skipping behavior, pointer cancellation, zoom/ruler synchronization, and clearer accessible names.

### Repository

- Added a populated README, first-use guide, comprehensive manual, agent/RAG reference, AGENTS instructions, contributor guide, format reference, audit, and security/data-handling notes.
- Added deterministic editor regressions, Chromium/Firefox workflow checks, source/documentation validation, a pinned test dependency lockfile, and two bounded GitHub Actions jobs.
- Left project licensing for the repository owner to decide; no license was inferred from dependencies.
