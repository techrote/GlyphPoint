# GlyphPoint agent and RAG reference

**Purpose:** a retrieval-oriented map for agentic development, grounded in live source and tests. Each `GP-*` section is independently useful. Retrieve the relevant section and named functions before editing; inspect source again when behavior changes.

**Authority order:** current user task and repository controls → current maintained source/tests → this reference and the manual → historical audit/version snapshots. This reference documents behavior; it does not replace user authorization.

**Maintained runtime:** [GlyphPoint-v1a-layout-fixed.html](GlyphPoint-v1a-layout-fixed.html). **Development sources:** [src/](src/app.js), assembled by [scripts/build.cjs](scripts/build.cjs). The November 2026 audit is historical evidence; the v3 implementation supersedes its former no-autosave, DOM-cell, code-point, and palette-only rendering limitations. Inspect Git history for the revision actually in use.

## Retrieval directory

| Chunk | Search terms and question answered | Source anchors |
| --- | --- | --- |
| [GP-001](#gp-001-product-and-file-authority) | Which file do I edit? Build, standalone, offline, modules | `scripts/build.cjs`, `src/app.html`, `init`, `initWorkflows` |
| [GP-002](#gp-002-state-and-rendering) | v3 cells, canvas, viewport, frame budget, fonts, PNG | `state`, `makeCell`, `GPRenderer.create`, `resolveStyle`, `exportPNG` |
| [GP-003](#gp-003-allocation-and-data-invariants) | Limits, Unicode graphemes, controls, malformed input | `validateDimensions`, `normaliseCell`, `GPInterchange.validGrapheme` |
| [GP-004](#gp-004-history-dirty-state-and-document-lifecycle) | Undo, autosave, recovery, direct Save, quota, download | `markDirty`, `GPRecovery.create`, `createFileSaver`, `installDocument` |
| [GP-005](#gp-005-pointer-tools-and-shape-geometry) | Brush, touch, fill, worker, resize, skew, cancellation | `pointerDown/Move/Up`, `GPJobs.run`, `runDocumentJob`, `placeText` |
| [GP-006](#gp-006-selection-and-clipboard) | Masks, move, paste, crop, rotate, Expand/Clip/Reject | `selectedPositions`, `planPlacement`, `transform`, `pasteSelection` |
| [GP-007](#gp-007-palette-and-colour-manager) | Inherited versus explicit colours, labels, reset, Revert | `normalisePalette`, `setGlyphColour`, `commitCellStyle`, `revertGlyphManager` |
| [GP-008](#gp-008-import-export-and-file-schema) | v1/v2 migration, v3 JSON, inert CSS import, exports | `normaliseProject`, `GPInterchange.parseHtml`, `exportHtml` |
| [GP-009](#gp-009-ui-layout-keyboard-and-browser-storage) | Keyboard canvas, screen-reader text, pan, mode, zoom | `handleCanvasKeyboard`, `updateAccessibleCell`, `setUiMode` |
| [GP-010](#gp-010-test-and-ci-map) | Node, Playwright, source parity, CI, qualification | `tests/*`, `scripts/check.cjs`, `.github/workflows/quality.yml` |
| [GP-011](#gp-011-task-routing-and-change-recipes) | Agent task routing, implementation recipe | Task-to-source table and change workflow |
| [GP-012](#gp-012-known-boundaries-and-evidence-discipline) | Remaining limits, browser capability, physical testing | Manual, format reference, qualification evidence |

## GP-001 Product and file authority

**Keywords:** standalone HTML, offline, build, modules, historical snapshots, source of truth.

GlyphPoint edits a rectangular grid of Unicode grapheme cells with palette defaults, optional per-cell colours, font/style preferences, and a field background. Its viewport uses Canvas2D. The application remains a downloadable offline HTML file; Node and Playwright are development tools, not runtime dependencies. All runtime scripts, styles, and bundled fonts are embedded. Worker source is built into a local Blob; artwork does not require network requests.

Edit the source modules/template, then run `npm run build` to regenerate the maintained HTML. `npm run check` rejects a shipped file that differs from the current source assembly. Do not hand-edit generated HTML or develop a second competing runtime. `GlyphPoint-v1a.html` and `GlyphPoint-v04a.html` are unchanged historical snapshots.

| Source | Responsibility |
| --- | --- |
| [src/app.html](src/app.html) | Static UI, dialogs, accessibility structure, CSS, build placeholders. |
| [src/app.js](src/app.js) | Document model, normalization, history, tools, palette, file/export handlers. |
| [src/interchange.js](src/interchange.js) | `GPInterchange`: grapheme helpers, colour parsing, bounded inert HTML/CSS import. |
| [src/recovery.js](src/recovery.js) | `GPRecovery`: IndexedDB archive, lifecycle checkpointing, direct-save/download results. |
| [src/renderer.js](src/renderer.js) | `GPRenderer`: visible-cell Canvas2D painting, overlay canvas, hit testing, PNG. |
| [src/jobs.js](src/jobs.js) | `GPJobs`: shared fill/resize generator, Blob worker, cooperative fallback. |
| [src/workflows.js](src/workflows.js) | Long-operation coordination, placement policy, keyboard canvas, recovery UI, cell styles. |
| [assets/fonts/fonts.css](assets/fonts/fonts.css) | Embedded DejaVu Sans Mono faces; preserve adjacent manifest/license notices. |

`init` loads preferences, creates the renderer and blank 80 × 80 field, binds ordinary controls, then runs `initWorkflows` for recovery, direct saving, accessible cell interaction, and extended controls. `bindUI` remains the main event map. The build orders modules before app/workflows and calls `init` once.

**Read next:** [README](readme.md), [new-user guide](docs/new-user-guide.md), [working instructions](AGENTS.md).

## GP-002 State and rendering

**Keywords:** row major, grapheme, per-cell colour, Canvas2D, viewport, dirty cells, geometry cache, font, PNG.

`state` owns dimensions, cell/palette data, active slots, field background, square geometry, selection/clipboard/history, cursor, brush and placement choices, and transient UI/pointer fields. Cell index is `y * state.cols + x`; `idx`, `xy`, and `inBounds` operate in cells, not device pixels.

`makeCell(ch)` creates `{ch,fg,bg,font,bold,italic,underline}`. New cells use `DejaVu Sans Mono`, empty colour overrides, and false style flags. `ch` is one grapheme cluster, up to 32 code points. Empty `fg` inherits the glyph palette; empty `bg` inherits `fieldBg`. A valid explicit hex value overrides inheritance only in that cell. Keep saved styles in cell data, never solely in the renderer or DOM.

`setCell` enforces bounds/glyph capacity, updates glyph usage, ensures palette membership, merges a cell, and invalidates its rendered position. It sets dirty state, but the caller must finish a saved-content edit with `markDirty` to advance the revision and schedule recovery. `rebuildGrid` now recalculates model-derived counts, palette, ruler/zoom state, and canvas invalidation; it does not create one DOM node per cell.

`GPRenderer.create` receives canvas/overlay/scroller/spacer elements plus `getState` and colour lookup hooks. `invalidateCell`, `invalidateAll`, `setView`, and `setOverlays` schedule animation-frame work. The default frame limit is 512 work units and a six-millisecond time budget. Artwork and selection/hover/cursor overlays share that budget so large masks cannot monopolize a frame. The renderer paints visible cells and bounds each viewport backing surface to 16 × 1024 × 1024 device pixels; the model remains complete in memory.

`metrics`, `hitTest`, and `ensureCellVisible` centralize scroll, padding, zoom, device-pixel ratio, and cell geometry. Use these APIs rather than reconstructing coordinate arithmetic in tools. `stats` exposes bounded rendering counters for tests; `whenIdle` allows assertions after queued paint; `destroy` cancels frames/listeners and releases resources.

`resolveStyle` honors cell overrides before palette/field defaults. Glyph geometry is measured and cached without caching colours; fit scaling contains wide/italic ink within each cell. Embedded regular/bold/oblique/bold-oblique DejaVu faces improve portable rendering. Other allowlisted families still depend on browser/OS fallback. Font readiness triggers repaint.

`exportPNG` copies a coherent document revision, loads used font faces, paints the full field in yielding batches, and excludes view-only grid/selection overlays. It bounds pixel allocation and releases the temporary canvas after encoding. PNG preserves that rendering; project JSON preserves editability. Do not claim universal Unicode font coverage or pixel-identical text rasterization across platforms.

## GP-003 Allocation and data invariants

**Keywords:** 512, 65536, 16 MiB, 4096, reserved space, 32 code points, Segmenter, validation.

| Invariant | Requirement |
| --- | --- |
| Field dimensions | Integer 1–512 per axis; product ≤65,536. |
| Cell array | Exactly `cols * rows` valid cell records. |
| Input file | ≤16 × 1024 × 1024 bytes before read/parse. |
| Palette | ≤4,096 unique valid graphemes, including mandatory U+0020 space. |
| Space | Cannot be removed/renamed; erasing writes inherited blank cells. |
| Glyph | One extended grapheme cluster; ≤32 code points; no C0/C1 controls, lone surrogates, U+2028/U+2029. |
| v3 cell colours | Empty/omitted or six-digit hex; invalid supplied overrides are rejected. |
| Field background | Required normalized six-digit hex after default handling. |
| Font | Fixed `SAFE_FONTS` allowlist; unknown input becomes a safe fallback. |
| History | Combined undo+redo ≤60 snapshots and ≤262,144 cell records. |
| Recovery | ≤12 checkpoints / 32 MiB UTF-8 payloads; one project ≤16 MiB. |
| Selection | Bounds and mask positions must be valid after placement and clipping. |

`GPInterchange.splitGraphemes` and `validGrapheme` use `Intl.Segmenter`; older engines retain ASCII support and explicitly reject unsupported Unicode. Do not replace this with `Array.from` for new v3 text. Code-point counting is still required when validating a v1/v2 cell and the 32-code-point cluster budget. Preserve the original sequence; there is no automatic NFC normalization.

`validateDimensions`, `normaliseCell`, `normalisePalette`, and `includeUsedGlyphs` must run before allocating/installing candidates. Palette fallback is intentionally more permissive than explicit v3 cell colours. HTML import adds independent node/depth/style/rule/selector-work limits; see [project-format.md](docs/project-format.md). Browser input min/max attributes and schema markers alone are not validation.

## GP-004 History, dirty state, and document lifecycle

**Keywords:** Undo, autosave, IndexedDB, quota, snapshot, Save as, File System Access, download, beforeunload.

`captureDocument` copies dimensions, cells, palette/slots, field/background geometry, selection, document name, and Ignore blanks. `snapshot` records before mutation and clears redo; `trimHistory` enforces both retained-history budgets. `restore` rebuilds dependent UI and marks the result dirty. It does not claim to match a file on disk. Compound gestures should have one meaningful undo point, including background-colour input gestures and colour-manager Revert.

`markDirty` advances `documentRevision`, updates the title, schedules `recovery.touch()`, and refreshes the accessible current-cell description. Autosave never clears project dirty state. Save does so only after a confirmed filesystem write for the still-current document revision. Download requests, PNG/text/HTML exports, and recovery commits remain distinct outcomes.

### Recovery integration API

`GPRecovery.create({capture,validate,getName,report,...})` is schema-neutral. `capture` supplies the full canonical project payload including `format`; `validate` is `normaliseProject`. Injected storage/clock/IDs make failure and race tests deterministic.

| API | Contract |
| --- | --- |
| `touch()` | Mark a newer revision; schedule a 750 ms debounce and five-second continuous-edit maximum. |
| `flush()` | Capture/validate/serialize synchronously before returning a promise; queue the detached snapshot. Resolve status after writes; report write failures without claiming success. |
| `beginDocument()` | Allocate a new identity. Call `flush()` before replacing outgoing state, then call this after replacement. |
| `list()` | Read safe summaries, newest first; no implicit restore. Errors are reported and rejected. |
| `read(id)` | Validate stored envelope/size/JSON/project, returning `{project,name,updatedAt,id}` without installing it. |
| `remove(id)` | Serialize explicit deletion with checkpoint writes. Suppress only the revision present at the deletion request; later edits, including edits while deletion waits, remain eligible for recovery. |
| `attachLifecycle(window,document)` | Best-effort flush on hidden/pagehide; return a detach function. |
| `getStatus()` / `dispose()` | Read latest status / flush, detach, and close owned resources. |

The archive is IndexedDB `glyphpoint.recovery.v1`, stores `documents` and `summaries`. IDs contain random session and document components, preventing same-filename tab overwrite. One latest checkpoint is retained per identity. Writes and explicit deletions share a serial queue, and superseded queued records collapse to the newest. A deletion must precede snapshots of edits made after its request, including outgoing-document snapshots captured before New/Open. Pending snapshots also have finite count/byte budgets; a full queue retains only a retry marker for the current document until queued writes drain. New checkpoint plus oldest-other-entry eviction commits atomically. Resolve writes on transaction completion, not request success; quota/abort failure must roll back proposed eviction too. Payload-byte limits differ from browser disk quota accounting. Debounce/max-wait timings are scheduling targets and can be delayed by browser suspension or busy JavaScript.

There is no canvas localStorage fallback. Pending/saving/saved/unavailable/error states must remain visible; do not hide quota/private/blocked storage failures. A failed outgoing-document write must identify that document even after New. Startup advertises archive entries; `openRecovery` requires explicit selection, checks revision races, confirms replacement when needed, then installs and marks dirty. Reading damaged data cannot mutate the current document.

### File save integration API

`GPRecovery.createFileSaver({capture,validate,getName,getRevision,download,report})` exposes `save({saveAs,download})`, `reset()`, `capabilities()`, and `isCurrentDocument(result)`. The picker is invoked before awaiting asynchronous work, preserving the initiating user gesture. Its handle is reused only in the current document. New/Open resets it. Save snapshots the payload and revision before any picker/write delay.

Only a successful writable-stream `close()` returns `kind:'saved'`; `current` also verifies document identity/revision. Root `saveProject` rechecks `isCurrentDocument(result)` after its await before adopting the destination filename, and additionally requires current/revision equality before clearing dirty state. A successful Save As updates the displayed destination for the same document even when newer edits remain unsaved. Picker cancellation, interrupted write, permission/close failure, and competing saves return distinct non-success outcomes. Explicit Download or absent direct-file support returns `kind:'downloaded'`, meaning requested, and retains dirty state. JSON is compacted if indentation would break the 16 MiB round-trip budget.

Beforeunload requests browser protection for dirty content. Visibility/pagehide flushing and IDB commit improve recovery but do not guarantee survival of immediate termination, eviction, profile loss, or cleared site data. Keep portable files for independent backups.

## GP-005 Pointer tools and shape geometry

**Keywords:** Pencil, Eraser, touch, pen, pan, primary/secondary, flood fill, worker, resize, skew.

`pointerDown/Move/Up` dispatch tools through renderer hit testing and pointer capture. Pointer cancel, lost capture, and window blur end gestures and clear previews. Primary/secondary glyphs remain independent; a persistent Secondary toggle makes secondary drawing available without a right mouse button. Pan mode drags scroll offsets instead of painting. The drawing surface supports pointer/touch events; physical device qualification is a separate evidence requirement.

`footprintOf` gives exact square/circular or ratio brush bounds. Even widths start at `-floor((size - 1)/2)`; avoid inclusive endpoints that add an extra row/column. Brush size is 1–60; shape width is 1–8. `drawLine` uses integer Bresenham traversal. `shapeRows`, `outlineRingFromRows`, `shapeEdges`, and `drawShape` cover supported geometry. Check `inBounds` before flattening coordinates; out-of-range x must never wrap into another row. Degenerate shapes must remain finite.

`paintCell` combines a glyph with current brush foreground/background overrides. `placeText` segments graphemes, applies allowed font/style, and repeats each grapheme into scale cells. Opaque text writes backgrounds; transparent text skips spaces. Replication does not rotate or rasterize the glyph outline.

`GPJobs.kernel` is the shared bounded generator for flood fill and resize/skew. Fill matches glyph plus explicit foreground/background identity across four-way neighbours. Resize/skew uses two sequential shears and inverse nearest-neighbour sampling, avoiding the old forward-map holes/collisions and singular simultaneous-skew transform. Angles must be finite within −89…89 degrees. Expand computes finite output bounds; Reject refuses overflow; Clip explicitly accepts discarded outer content. Sampling a discrete transformed grid can still repeat or omit source cells.

`GPJobs.run` prefers a local Blob worker; unsupported/blocked workers fall back to the same generator with event-loop yields every 1,024 steps. `runDocumentJob` shows progress/cancel controls, marks the workspace busy, captures revision, and commits only a current uncancelled result. Validation/failure/cancellation must not partially mutate state or add undo history. New/Open aborts old work; stale results are discarded. Ordinary small edits and serialization are not all worker-based.

## GP-006 Selection and clipboard

**Keywords:** free mask, paste, move, clip, expand, reject, crop, rotate, asynchronous clipboard.

A rectangular selection is `{type:'rect',x,y,w,h}`. A free selection adds relative `[dx,dy]` mask positions. The mask, not its bounding box, authorizes affected cells. `clipSelection` and `selectedPositions` keep landed state in bounds. `captureSelection` returns serializable cell entries plus mask/type; Map-based lookup avoids per-cell searches. Cropping starts with blanks and copies only selected positions.

Copy retains full styled cells internally and attempts plain-text system clipboard output. Paste prefers this internal clipboard. External clipboard reads capture destination/revision before awaiting permission; a changed document discards the result. Cut clears the originally captured region before awaiting clipboard output.

`state.edgePolicy` defaults to Expand. `planPlacement` validates bounds/capacity before snapshot or mutation; `applyPlacement` grows/rebases existing content and related coordinates. Paste, move, text placement, and selected transformations use this policy. Reject leaves the document unchanged. Clip discards overflow deliberately and reports it. Free masks and Ignore blanks remain authoritative after rebasing; blank-skipping is a source-cell rule, not an alpha layer.

A whole-field quarter turn swaps dimensions. A selected transform relocates only its selected cells and can overwrite destination content it actually reaches; expansion prevents outer loss but does not create layers. Transforming cells does not mirror glyph outlines. Brush/shape drawing still uses bounded cell operations at field edges; do not assume every tool expands the document.

## GP-007 Palette and colour manager

**Keywords:** global recolour, inherited paint, per-cell override, represents, rename, reset, Revert.

Palette entries are `{glyph,colour,represents}`. `paletteEntry`, `getGlyphColour`, `normalisePalette`, and `includeUsedGlyphs` define defaults and membership. `setGlyphColour` updates inherited appearances, history, dirty/recovery state, and preferences. Explicit cell foregrounds remain unchanged. Likewise, field background updates only cells whose background inherits.

`openCellStyle` / `commitCellStyle` configure the brush or apply explicit/inherited foreground/background to a selection or focused cell. Brush choices are transient; applying them changes saved cell data. `applyBundledFont` updates the selected cells or complete field. All applied edits must be undoable and dirty.

The manager supports search, sort, colour input, usage, labels, glyph replacement, reset/remove, colourways, import/export, and Revert. Replacing a glyph changes its occurrences and active slots while preserving other cell data. U+0020 is reserved and whitespace rows are hidden. Used entries cannot be removed; unused removed glyphs may later be automatically re-added.

Reset retains used glyphs plus space before adding defaults. Palette import retains omitted entries used by the current field and fails before mutation if they do not fit. `gcmOpeningSnapshot` stores the entire document; Revert restores palette, replaced glyphs, backgrounds, and cell overrides and is itself undoable. Closing the dialog keeps edits. A project's palette takes precedence over browser defaults.

## GP-008 Import, export, and file schema

**Keywords:** v3, v1/v2 migration, grapheme, BOM, tabs, CSS cascade, inert HTML, CSP, embedded JSON.

[project-format.md](docs/project-format.md) is the exact field/example reference. `projectPayload` writes v3. `normaliseProject` accepts v1/v2/v3, rejects palette-only payloads as projects, checks exact cell count before mapping, and copies known safe fields. v3 cells have real independent colour overrides.

Legacy v1/v2 cells still require one code point. Migration first preserves the historical missing-palette-entry seed from a valid legacy cell foreground, then clears legacy cell `fg`/`bg` so previously ignored metadata does not change visible art. Existing palette/field colours remain authoritative. New saves use v3; relabelling v3 as v2 does not create compatibility.

`readImportFile` checks bytes; `importDocumentFile` guards asynchronous reads with generation, validates the candidate, confirms replacement when dirty, then calls `installDocument`. Rejected/stale imports must leave document and history unchanged. `textDocument` normalizes BOM/line endings, four-cell tabs, one final newline, grapheme rows, and rectangular padding. Plain text has no ANSI colours or style metadata.

`htmlDocument` first reads native inert `script#glyphpoint-data[type="application/json"]`. Without native metadata, `GPInterchange.parseHtml` uses detached template content and never attaches imported nodes or CSS. Its bounded cascade handles inline/embedded styles, tags/classes/IDs/descendant/child selectors, specificity, source order, and `!important`. It preserves independently resolved cell foreground/background, compositing alpha to opaque colour. Nodes split inside a grapheme are segmented together; conflicting styles within that grapheme use its first code point and report a warning.

Unsupported selectors, external style sheets/imports, resource URLs, variables, gradients, media, scripts, and complex positioning do not become executable/live document content. Limits bound tree traversal, CSS parsing, selector count, and matching work. See the format reference for the exact subset and warning behavior; this is not a browser layout renderer.

`exportHtml` writes visible safe cell markup and escaped normalized v3 JSON. Native metadata is authoritative on re-import even if visible spans were edited. Preserve escaped closing-script delimiters and `<` escaping inside JSON. Bundled fonts and their notices can travel with the export; its CSP permits generated inline styling/font data and denies external resources. Keep outputs within the same re-import byte budget. JSON/HTML/PNG tests must check actual output, per-cell colours, grapheme preservation, and font/style behavior.

## GP-009 UI layout, keyboard, and browser storage

**Keywords:** ribbon, classic, zoom, scroll, keyboard grid, accessible text, touch, preferences.

`setUiMode` switches one state/control set between ribbon and classic layouts. `updateClassicOverflow` responds to sidebar/palette growth. Both views use the same model and renderer. `setZoom` clamps 25–800% in quarter steps; renderer metrics drive hit testing, dimensions, and synchronized rulers. Grid/rulers/status/fullscreen are view choices; field background and square geometry are saved content.

The canvas wrapper is a focusable ARIA grid with an active row/cell proxy. `updateAccessibleCell` reports one-based row/column, glyph/label, resolved colours, and selection state. `focusCanvas` ensures the cursor is visible. Arrow/Home/End/Page keys move it; Shift extends selection; Ctrl/Meta+A selects the field when the grid is focused. Space uses the selected tool, Enter opens text entry, and Delete/Backspace clears the selection or focused cell. `openTextView` provides selectable/copyable/exportable full text. This semantic proxy does not expose thousands of DOM grid cells.

`keyboard` scopes application shortcuts around editable targets, IME composition, handled events, and open modal dialogs. Ctrl/Meta operations include undo/redo, clipboard, New, Save, and Print. Do not consume native text-editing shortcuts inside inputs. Keep pointer cancellation, touch Pan/Secondary controls, keyboard focus, and progress cancellation reachable without hover-only affordances.

Palette/UI localStorage keys remain `glyphpoint.palette.v3` (v2 fallback) and `glyphpoint.uiMode.v1`; artwork recovery is separate IndexedDB. File URLs, localhost, private sessions, browser profiles, and browsers may have different stores. Clipboard, fullscreen, printing, file-picker permissions, and storage availability remain browser controlled. Keyboard implementation and semantic labels are testable improvements; screen-reader conformance requires qualification beyond DOM assertions.

## GP-010 Test and CI map

**Keywords:** build parity, Node VM, Playwright, actual IndexedDB, browser rendering, CI, qualification.

| Layer | Command / source | Scope |
| --- | --- | --- |
| Assembly / static / docs | `npm run build`, `npm run check`; [build](scripts/build.cjs), [check](scripts/check.cjs) | Exact source-to-shipped parity, inline syntax, IDs/resources, Markdown links/anchors. |
| Model and module regressions | `npm test`; [editor](tests/editor.test.cjs), [files](tests/files.test.cjs), [workflows](tests/workflows.test.cjs), [interchange](tests/interchange.test.cjs), [recovery](tests/recovery.test.cjs), [renderer](tests/renderer.test.cjs) | Actual model/module code, migrations, geometry, races, Unicode/limits, recovery/save state. |
| VM adapter | [tests/helper.cjs](tests/helper.cjs) | Executes shipped script without init; stubs UI, not document operations. |
| Editor browser flows | [tests/browser.cjs](tests/browser.cjs) | Real standalone editor, controls, imports/exports, keyboard, pointer, storage/UI integration. |
| Recovery browser flows | [tests/recovery.browser.cjs](tests/recovery.browser.cjs) | Shipped module in offline file context; real IDB reload, tabs, eviction, rollback, damaged-entry handling. |
| Interchange browser flows | [tests/interchange.browser.cjs](tests/interchange.browser.cjs) | Inert DOM/CSS import, colour cascade, markup/grapheme boundaries, resource rejection. |
| Renderer browser flows | [tests/renderer.browser.cjs](tests/renderer.browser.cjs) | Real Canvas2D, bounded painting, pixel/export behavior and dimensions. |
| CI | [.github/workflows/quality.yml](.github/workflows/quality.yml) | Bounded source/docs/model and browser jobs; superseded ref runs cancel. |

Use Node ≥22; CI uses 24. Install pinned tooling with `npm ci`, then matching engines with `npx playwright install chromium firefox webkit` (`--with-deps` where needed on Linux). `npm run test:browser` invokes [scripts/browser-suite.cjs](scripts/browser-suite.cjs); individual browser files accept engine arguments for focused local checks. CI runs full Chromium/Firefox/WebKit coverage on Linux, a Chromium smoke profile on Windows, and a WebKit smoke profile on macOS. Matrix concurrency is bounded and obsolete ref runs cancel. The source job also packages candidate artifacts; packaging is separate from public release publication. The distributed app requires neither these packages nor a runtime build.

Module tests verify parity with the bundled source where applicable. Browser cases block/record unexpected HTTP(S) requests and uncaught errors. Use an absolute `GLYPHPOINT_APP` override for an intentional baseline rather than copying application logic into a fixture. Record source identity and actual engines for reported results. A blocked local engine is not a passed test; do not disable security controls to make a qualification claim.

## GP-011 Task routing and change recipes

**Keywords:** implementation map, agent development, add saved field, regression, documentation.

| Task | First source to read | Required adjacent concerns |
| --- | --- | --- |
| Add/change saved data | `state`, `captureDocument`, `projectPayload`, `normaliseProject` | Explicit migration, defaults, recovery, undo/redo, JSON/HTML round trip. |
| Change render/zoom/hit test | `GPRenderer`, `eventCell`, `renderRulers` | Viewport/frame budgets, overlays, DPR/scroll, fonts, PNG, semantic cursor. |
| Change a brush or shape | `footprintOf`, `drawLine`, `drawShape` | Exact/even widths, degenerate geometry, valid indices, primary/secondary paint. |
| Change fill or resize | `GPJobs.kernel`, `runDocumentJob` | Worker/fallback equivalence, cancellation/stale revision, validation before snapshot, limits. |
| Change selection placement | `clipSelection`, `planPlacement`, `transform` | Free masks, overlap, Expand/Clip/Reject, undo, source blank semantics. |
| Change recovery/save | `GPRecovery`, `initWorkflows`, `saveProject`, `installDocument` | Transaction completion, failure status, multiple tabs, deletion, close/revision proof, download honesty. |
| Change Unicode or HTML import | `GPInterchange`, `normaliseProject`, `htmlDocument` | Grapheme boundaries, v1/v2 migration, hostile resources, finite CSS work, atomic imports. |
| Change palette/styles | `normalisePalette`, `commitCellStyle`, manager handlers | Space/capacity, overrides/inheritance, reuse, dirty/history, full manager Revert. |
| Change accessibility/mobile UI | `src/app.html`, `handleCanvasKeyboard`, pointer handlers | Modal/editable scope, focus/cursor, touch pan/secondary, real platform qualification. |

Reproduce a bounded defect or define the requested behavior, inspect adjacent contracts, implement one coherent fix, and add meaningful regression coverage for its failure mode. Regenerate the standalone artifact and update manual/format/RAG contracts. Run the relevant checks once sufficient risks are covered, then inspect the CI for the commit being integrated. Preserve unrelated user work and historical snapshots. Follow actual user authorization for external writes, license choices, and release publication.

## GP-012 Known boundaries and evidence discipline

**Keywords:** residual limits, recovery eviction, Unicode fonts, physical workflows, license, release.

Recovery is local, bounded, and subject to browser storage/termination rules. Direct file saving depends on browser capability and user permission; download completion remains unverifiable from the application. There is no cloud sync or retained recovery history for every edit. History and clipboard are session-local.

The renderer avoids a DOM cell for every document cell and long fill/resize jobs yield or run in a worker. The complete model/history and palette controls still consume bounded memory; imports, normalization, serialization, and some commands remain synchronous. Do not describe the whole editor as asynchronous or claim unlimited size/performance.

Cells represent graphemes rather than terminal columns. Font coverage, emoji fallback, and rasterization can vary; PNG freezes an image, not editable text semantics. External HTML uses a defined safe subset. There are no layers, binary image-to-glyph import, ANSI-colour export, full CSS layout emulation, or collaborative editing. Grid resampling and intentional Clip can discard details; Expand is finite and can reject excessive dimensions.

Keyboard canvas editing, semantic current-cell output, text view, and mobile controls are implemented. Headless Linux/browser emulation still does not certify physical Windows/macOS/mobile hardware, native picker dialogs, screen readers, print devices, or WCAG conformance. Keep a platform qualification matrix truthful; a procedure is not evidence that it was executed.

The [historical audit](docs/quality-audit-2026-11-03.md) distinguishes original findings and evidence. New release/version notes must use current tests and source identity. Bundled-font licenses do not choose a license for the application. Do not invent ownership, publish a release, or claim all defects are fixed based on this document. Resolve source/document discrepancies against live implementation and explicit task scope.
