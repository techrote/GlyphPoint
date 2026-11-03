# GlyphPoint agent and RAG reference

**Purpose:** a retrieval-oriented map for agentic development, grounded in the shipped source rather than inferred features. Each `GP-*` section is independently useful as a retrieval chunk. Retrieve the relevant section and named functions before editing; re-read live source when behavior changes.

**Authority order:** current user task and repository controls → current maintained source/tests → this reference and the manual → historical audit/version snapshots. This is documentation, not executable automation or a replacement for user authorization.

**Maintained runtime:** [GlyphPoint-v1a-layout-fixed.html](GlyphPoint-v1a-layout-fixed.html). **Reference baseline:** audit started at commit `12f209718f1bf09d02cef84bbf5d8bd759e0ec5b` on 3 November 2026. The repairs described here are in the same change as this reference; inspect current Git history for the installed revision.

## Retrieval directory

| Chunk | Search terms and question answered | Source anchors |
| --- | --- | --- |
| [GP-001](#gp-001-product-and-file-authority) | What is this app? Which HTML should I edit? Offline, historical, entry point | `init`, `bindUI`; README file table |
| [GP-002](#gp-002-state-and-rendering) | Cells, coordinates, DOM grid, colours, fonts, data model | `state`, `makeCell`, `setCell`, `rebuildGrid`, `renderCellIndex` |
| [GP-003](#gp-003-allocation-and-data-invariants) | Limits, validation, memory, Unicode, malformed imports | `validateDimensions`, `validGlyph`, `normaliseCell`, `normalisePalette`, `includeUsedGlyphs` |
| [GP-004](#gp-004-history-dirty-state-and-document-lifecycle) | Undo, redo, unsaved changes, New, recovery, transactions | `captureDocument`, `snapshot`, `restore`, `trimHistory`, `markDirty`, `newDocument` |
| [GP-005](#gp-005-pointer-tools-and-shape-geometry) | Brush, fill, text, shapes, Shift, pointer capture, even widths | `pointerDown/Move/Up`, `footprintOf`, `drawLine`, `drawShape`, `shapeRows`, `placeText` |
| [GP-006](#gp-006-selection-and-clipboard) | Selection masks, crop, paste, move, rotate, clipboard races | `clipSelection`, `selectedPositions`, `captureSelection`, `transform`, `pasteSelection`, `cutSelection` |
| [GP-007](#gp-007-palette-and-colour-manager) | Global recolour, labels, rename, space, reset, palette import | `paletteEntry`, `setGlyphColour`, `replacePaletteGlyph`, `resetPalette`, `revertGlyphManager` |
| [GP-008](#gp-008-import-export-and-file-schema) | JSON, text, HTML, migration, safe export, round trip | `normaliseProject`, `textDocument`, `htmlDocument`, `importDocumentFile`, `exportHtml` |
| [GP-009](#gp-009-ui-layout-keyboard-and-browser-storage) | Ribbon, classic, zoom, ruler scroll, shortcuts, localStorage | `setUiMode`, `setZoom`, `renderRulers`, `keyboard`, `loadLocalPrefs` |
| [GP-010](#gp-010-test-and-ci-map) | Tests, browser checks, reproduction, Actions, qualification | `tests/*`, `scripts/check.cjs`, `.github/workflows/quality.yml` |
| [GP-011](#gp-011-task-routing-and-change-recipes) | Where to implement a feature, regression workflow, doc updates | Task-to-file table and ordered implementation recipe |
| [GP-012](#gp-012-known-boundaries-and-evidence-discipline) | What is unsupported? What remains unqualified? | Manual, audit, browser/platform limits |

## GP-001 Product and file authority

**Keywords:** standalone HTML, offline, launch, current version, historical version, no build.

GlyphPoint is a browser editor of a rectangular grid of Unicode code points, rendered as DOM spans. It is not a raster/image editor, terminal emulator, font renderer, presentation slide tool, or GPU/WebGPU application. The runtime contains its own HTML, CSS, and JavaScript; it needs no server or network fetch to edit and export.

`GlyphPoint-v1a-layout-fixed.html` is the maintained entry point. `GlyphPoint-v1a.html` and `GlyphPoint-v04a.html` retain their original bytes as historical snapshots; their old defects remain. Do not develop all three in parallel or invent a new “latest” filename per task. The initial layout-fixed file differed from v1a only in classic palette/view CSS, so it was the natural maintenance base.

`init` loads preferences, creates an 80 × 80 blank document, binds controls, builds shapes/palette, and sets initial view state. `bindUI` is the event-wiring map. The application remains a downloadable single file. `package.json` exists for development checks, not runtime compilation or package publication.

**Read next:** [README](readme.md), [new-user guide](docs/new-user-guide.md), [working instructions](AGENTS.md).

## GP-002 State and rendering

**Keywords:** row major, cell schema, palette foreground, background, font, DOM, repaint.

`state` holds dimensions, cells, palette/slots, field background, square-cell mode, selection, clipboard, history/future, current tool/brush/shape, view preferences, and transient pointer/dialog fields. Cell index is `y * state.cols + x`; `xy`, `idx`, and `inBounds` convert/check coordinates. Width/height and selection units are cells, not display pixels.

`makeCell(ch)` creates `{ch, fg, bg, font, bold, italic, underline}` with default font `Cascadia Mono` and false style flags. `ch` is one code point. `fg`/`bg` are legacy metadata; actual rendering obtains foreground from `getGlyphColour(ch)` and background from `state.fieldBg`. Whitespace foreground equals the shared field background. The same glyph cannot have independently different displayed colours in different cells.

`setCell` validates bounds/glyph capacity, updates glyph counts, establishes palette membership before painting, merges the cell record, and marks state dirty. The caller normally finishes a compound operation with `markDirty` to update the title/revision. `autoAddGlyph` must ensure actual palette membership independently of `knownGlyphs`; an erased/removed glyph can reappear later.

`rebuildGrid` recreates one `<span class="cell">` per cell, recalculates usage, ensures palette membership, renders, updates stats, recalculates zoom dimensions/rulers, and rebuilds palette UI. Bulk changes rebuild; individual strokes call `setCell`. `renderSelection` and `renderPreview` add overlays; they are not artwork. `renderCellIndex` uses `textContent` and CSS properties, never imported markup.

Changing the colour model, grapheme representation, or DOM-per-cell approach is architectural work and requires explicit compatibility/testing decisions.

## GP-003 Allocation and data invariants

**Keywords:** 512, 65536, 16 MiB, 4096, reserved space, surrogate, validation, history budget.

| Invariant | Requirement |
| --- | --- |
| Field dimensions | Integer 1–512 for each axis; product ≤ 65,536. |
| Cell array | Exactly `cols * rows` independent valid cell records. |
| Import file | ≤ 16 × 1024 × 1024 bytes before read/parse. |
| Palette | Unique single-code-point glyphs, ≤ 4,096 entries including mandatory U+0020 space. |
| Space | Reserved for erasing/blank cells; cannot be removed or renamed. At most 4,095 other glyphs fit. |
| Glyph | One code point; no C0/C1 controls, lone surrogates, or U+2028/U+2029. |
| Colour | Valid six-digit hex for document background; palette/legacy invalid colours have documented fallbacks. |
| Font | `SAFE_FONTS` allowlist; unsupported input becomes `Cascadia Mono`. |
| History | Combined undo+redo count ≤ 60 and cell-record count ≤ 262,144. |
| Selection | Current bounds and mask coordinates lie within the field after clipping. |

`validateDimensions` rejects invalid dimensions before allocation. `normaliseCell` copies known fields and enforces the glyph/font/style representation. `normalisePalette` accepts legacy strings or entry objects, rejects duplicates/invalid glyphs, and ensures reserved space; it never silently truncates to 72 entries. `includeUsedGlyphs` fills missing cell glyphs or throws before capacity is exceeded.

All imported data must pass the same path; a file extension, schema marker, or previously saved-looking payload is not sufficient validation. Browser input `min`/`max` attributes are hints, not enforcement. Resize/Properties validate in their handlers as well.

## GP-004 History, dirty state, and document lifecycle

**Keywords:** snapshot, Undo, Redo, revert, unsaved, download, beforeunload, atomic import.

`captureDocument` copies dimensions, cells, selection, palette, primary/secondary slots, background, square mode, document name, and Ignore blanks. `snapshot` records the state before a mutation and clears redo. `trimHistory` applies both combined budgets. `restore` rebuilds dependent UI, persists restored palette preferences, and conservatively marks the restored document dirty; it does not claim to match the last downloaded file.

Take one snapshot before a meaningful compound edit, after validation. Pointer colour edits group `input` events until `change`. A colour manager Revert restores its opening document snapshot and is itself undoable; it is not just a palette replacement. Palette colours/labels and field appearance are saved document content.

`markDirty` updates the title asterisk and `documentRevision`. New/file replacement must invalidate pending asynchronous operations and reset drawing/move/text-anchor state. The page's `beforeunload` listener requests browser protection for tracked unsaved changes; browsers decide whether to show it.

`saveProject` requests a download and then clears dirty state. It cannot observe whether a user later cancels or discards the browser's download. Text/HTML exports do not clear dirty state. Project open is clean; text/HTML imports are unsaved editable documents. There is **no canvas autosave, recovery archive, or cloud sync**.

## GP-005 Pointer tools and shape geometry

**Keywords:** Pencil, Eraser, flood fill, brush diameter, even width, secondary, shapes, Shift, text.

`pointerDown`, `pointerMove`, and `pointerUp` dispatch tools. Only primary and secondary pointer buttons initiate canvas actions. Left-button Pencil/Fill and Glyph-style shape strokes use the primary glyph; right-button equivalents use secondary. Shape fill independently chooses Primary or Secondary. Pointer cancel, lost capture, and window blur end the active gesture and clear previews.

`footprintOf` produces exact square `size × size` footprints, circular footprints within the same box, or the configured 3:1, 5:1, 1:3, 1:5 rectangle. Even sizes use origin `-floor((size - 1)/2)`; do not reintroduce `-floor(size/2)..floor(size/2)`, which adds an extra cell. Shape stroke thickness uses the same square footprint with width 1–8; brush size is 1–60.

`drawLine` is integer Bresenham traversal. `shapeRows`, `outlineRingFromRows`, `shapeEdges`, and `drawShape` implement rectangles, ellipses, triangles, diamond, arrows, lines, and diagonals. Shift uses `snapB` to constrain equal absolute axis extents; geometry can extend beyond the grid before clipping. Always check `inBounds(x,y)` **before** linearizing coordinates into a Set; out-of-range x can otherwise wrap into a different row. `drawRingChar` also bounds-checks neighbours. Degenerate one-row/one-column ellipses must render finite outlines.

`floodFill` matches glyph identity over four-way neighbours. `placeText` uses the text parser, applies an allowed font and style flags, and repeats each code point into 1×1, 2×2, or 3×3 cells. Transparent skips spaces; Opaque writes them. This is character replication, not glyph raster scaling or per-cell background painting. Skew uses a forward mapping clipped to the current resized field and can contain holes/overwrites.

## GP-006 Selection and clipboard

**Keywords:** mask, free form, bounding box, move, clip, crop, transform, async clipboard, quadratic.

A rectangular selection is `{type:'rect', x, y, w, h}`. A free selection adds `mask`, an array of relative `[dx,dy]` coordinates. The mask is authoritative; its bounding box is not permission to edit all enclosed cells. `clipSelection` returns a valid landed selection or null; `selectedPositions` emits in-bounds selected cells only.

`captureSelection` returns `{w,h,map,type,mask}`, where `map` is serializable `["dx,dy", cell]` entries. Clipboard text is constructed through a Map, avoiding the former per-cell linear search. `cropSelection` starts with blanks and copies selected cells, preserving the mask's holes without repeated `mask.some` scans.

Copy retains styled cells in the session clipboard and attempts plain-text system clipboard output. Paste prefers this internal clipboard. Only when it is absent does the editor request external text; it captures the destination and revision before awaiting permission. A changed document cancels the pending paste. Cut clears the originally captured region synchronously before waiting for system clipboard completion, avoiding deletion of a later selection.

Moves/pastes clip content and selection to the field; discarded content is recoverable with Undo. Ignore blanks skips blank **source** cells during move/paste; it is not an alpha layer. Free-form transformations relocate only selected cells; destinations can overwrite existing cells they actually land on. Rotating the whole field 90° swaps dimensions; rotating a selection keeps its top-left anchor and clips overflow.

## GP-007 Palette and colour manager

**Keywords:** global recolour, represents label, colourway, remove, reset, manager Revert, browser preferences.

Palette entries are `{glyph, colour, represents}`. `paletteEntry` and `getGlyphColour` are the lookup path. `setGlyphColour` records history/dirty state unless called inside an already snapshotted input gesture. The manager exposes search, sort, hex/native colour inputs, usage counts, labels, rename, reset/remove, six colourways, palette import/export, and Revert.

Both palette editing and manager rename replace that glyph throughout the canvas and keep active slots consistent. U+0020 is reserved; manager rows hide whitespace. A used glyph cannot be removed until its canvas uses are replaced/erased. Removing an unused glyph does not permanently prohibit later automatic re-addition.

Reset prioritizes all used glyphs plus space, resets their colours, then adds defaults within remaining capacity. Slots prefer `#` and `+` when available and otherwise select valid entries. Palette import similarly retains omitted entries still used on the canvas; capacity failures leave the document unchanged.

`gcmOpeningSnapshot` stores the full opening document. Revert restores glyph replacements, background, palette, labels, and slots and can itself be undone. Closing the manager keeps changes. Palette preferences may persist locally, but every project also saves its own palette. A project's normalized palette is authoritative over browser defaults.

## GP-008 Import, export, and file schema

**Keywords:** JSON v1 v2, BOM, tabs, newline, HTML XSS, CSP, embedded metadata, round trip.

See [project-format.md](docs/project-format.md) for exact field details and examples. `projectPayload` writes v2; `normaliseProject` accepts v1/v2 and rejects palette-only payloads used as projects. Validate exact cell count before mapping cells, reject non-boolean square mode and invalid supplied backgrounds, and retain only known safe fields. Legacy per-cell foregrounds may seed missing palette entries but do not override the global palette at render time.

`readImportFile` enforces the file-size budget. `importDocumentFile` increments an import generation, reads/parses a candidate, ignores superseded reads, asks before replacing a dirty document, and calls `installDocument`. A failed parse/validation must not add history or partially modify state. Palette import is a separate document edit with equivalent validation-before-mutation.

`textDocument` removes an initial BOM, normalizes CRLF/CR, expands tabs to four-column stops, removes one terminal newline, preserves additional blank rows, and pads ragged Unicode-code-point rows. Empty text and unsupported controls are rejected. Plain text export ends each complete rectangle with a final LF and has no ANSI colour escapes.

`htmlDocument` parses only into detached template content. Native `script#glyphpoint-data[type="application/json"]` is parsed as data and normalized; otherwise `#art`/`pre` is walked for text and an explicit subset of inline styles. Script/style/resource nodes never enter the live document. External conflicting colours collapse to the first colour per glyph with a status warning.

`exportHtml` writes every cell, escapes visible text, uses safe classes/fixed fonts/validated CSS, and embeds escaped normalized v2 JSON. The data block is authoritative on re-import; manual changes to visible spans alone do not modify it. The export's CSP denies resources except generated inline styling. Preserve `<` escaping inside JSON and the escaped closing-script delimiter inside the application's own JavaScript template string.

## GP-009 UI layout, keyboard, and browser storage

**Keywords:** ribbon, classic, overflow, ruler, zoom, dialog, accessibility, preferences, localStorage.

`setUiMode` switches the same controls/state between ribbon and classic CSS. `updateClassicOverflow` detects sidebar scrolling needs. Palette growth changes layout height, so sidebar overflow must be checked after UI rebuilds. Do not maintain separate behavior for the two layouts.

`setZoom` clamps 25–800% in quarter steps and updates transformed canvas overflow margins. `rebuildGrid` recalculates those margins after dimensions/square mode change. `renderRulers` accounts for cell size and scroller padding; scroller events synchronize ruler offsets. Grid/rulers/status/fullscreen are view choices; field background and square-cell geometry are saved content.

`keyboard` returns early for editable controls, IME composition, already handled events, and open modal dialogs. Ctrl/Meta shortcuts operate at editor scope: Z, Shift+Z/Y, C/X/V, N/S/P. Delete clears an active selection. Escape closes menus/pickers, cancels previews, and clears selection outside a modal. Unmodified +/= and − adjust zoom. There is no application Ctrl+A or letter-tool shortcut.

`safeStorageGet/Set` tolerate unavailable storage. Keys are `glyphpoint.palette.v3` (with v2 read fallback) and `glyphpoint.uiMode.v1`. Only palette choices and mode persist. File URLs, localhost, private windows, browser profiles, and different browsers may have separate stores. System clipboard and fullscreen availability remain browser-controlled.

Icon buttons/dialogs have accessible names and status text is announced. This does not establish full keyboard-only canvas editing or screen-reader/WCAG conformance.

## GP-010 Test and CI map

**Keywords:** Node test, Playwright, source extraction, regression, Chromium, Firefox, CI cost.

| Layer | Command / file | Scope |
| --- | --- | --- |
| Static/docs | `npm run check`, [scripts/check.cjs](scripts/check.cjs) | Inline JS syntax, static IDs, standalone resources, local Markdown links/headings. |
| Editor model | `npm test`, [editor tests](tests/editor.test.cjs) and [file tests](tests/files.test.cjs) | Actual runtime functions in a VM; geometry, masks, clipboard races, history/palette/limits. |
| VM adapter | [tests/helper.cjs](tests/helper.cjs) | Extracts the script; omits init and stubs DOM rendering, not data operations. |
| Browser workflows | `npm run test:browser`, [tests/browser.cjs](tests/browser.cjs) | Actual local file in Chromium/Firefox, download/reimport, rejected inputs, inert HTML, dialogs/layout startup. |
| CI | [.github/workflows/quality.yml](.github/workflows/quality.yml) | Two jobs on PR/main, finite timeouts, cancellation of superseded runs. |

Development uses Node ≥22; CI selects 24. `npm ci` installs pinned Playwright; `npx playwright install chromium firefox` installs its matching engines. For Linux system dependencies use `--with-deps`. The app itself has no build or runtime package dependency.

The browser suite blocks and records HTTP(S) requests and fails unexpected attempts; it also fails uncaught JavaScript errors. To compare a baseline use an absolute `GLYPHPOINT_APP` override, not a copied implementation inside tests. Record browser versions and tested source identity. CI success is evidence for those checks, not proof of universal browser/platform correctness.

## GP-011 Task routing and change recipes

**Keywords:** add tool, change import, fix export, add option, agent work, route.

| Task | First code to read | Required adjacent concerns |
| --- | --- | --- |
| Fix a brush/shape | `footprintOf`, `drawLine`, `shapeRows`, `drawShape` | Exact widths, degenerate geometry, in-bounds indexes, primary/secondary and fill behavior. |
| Change a selection operation | `clipSelection`, `selectedPositions`, `transform` | Free masks, overlap, clipping, history, linear data access. |
| Add a saved property | `state`, `captureDocument`, `projectPayload`, `normaliseProject` | Default/migration, UI synchronization, undo/redo, JSON+HTML round trip, format docs. |
| Change palette behavior | `normalisePalette`, `includeUsedGlyphs`, manager handlers | Space/capacity, glyph reuse, dirty/history, local persistence, manager Revert. |
| Change file parsing | `readImportFile`, `importDocumentFile`, parser | Validation before state mutation, size/shape limits, stale reads, hostile input, schema compatibility. |
| Change export | `projectPayload`, `exportHtml`, `cellsToText` | Every cell/run/style, Unicode, escaping, no resources, actual downloaded-file reimport. |
| Change layout/shortcuts | CSS, `setUiMode`, `bindUI`, `keyboard` | Both interfaces, modal focus, scroll/zoom, accessible names, pointer cancellation. |

Start by reproducing one bounded defect or defining the requested behavior. Inspect existing tests and write a meaningful regression where needed. Make the smallest coherent runtime change, then update its manual/format/RAG contract. Run relevant local checks and inspect CI for the commit being integrated. Keep unrelated snapshots and user work unchanged. A task asking only for review does not authorize implementation or posting; follow the actual user's scope.

## GP-012 Known boundaries and evidence discipline

**Keywords:** limitations, backlog, accessibility, mobile, fonts, performance, no autosave.

The editor is synchronous and DOM-based. Maximum-size fills/rebuilds, large palettes, and deep history can be costly despite budgets. There is no worker, virtualization, layers, autosave, recovery file, cloud collaboration, binary image import, ANSI-colour output, terminal-width algorithm, or grapheme-cluster model. External HTML styling is intentionally partial. Skew may clip/overwrite cells; selection transforms may clip outside the field. Font availability varies by device.

Headless Chromium/Firefox Linux workflows do not substitute for physical Windows/macOS testing, mobile touch/pen qualification, print inspection, fullscreen behavior, real permission prompts, or accessibility conformance. Browser tests of forbidden network attempts establish the tested paths; source review covers additional paths but is not a formal proof of absence.

Do not label a review “all bugs fixed” or declare a production release from this reference. The [audit](docs/quality-audit-2026-11-03.md) separates repaired defects, measured evidence, and remaining limits. No project license was selected during the audit. When source/tests and this document differ, inspect and reconcile the discrepancy rather than treating a retrieved paragraph as authority over code.
