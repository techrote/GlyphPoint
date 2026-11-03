# Project and interchange formats

This is the maintained editor's data contract. Development sources are [app.js](../src/app.js), [interchange.js](../src/interchange.js), [recovery.js](../src/recovery.js), [renderer.js](../src/renderer.js), and [workflows.js](../src/workflows.js). The build embeds these modules in [GlyphPoint-v1a-layout-fixed.html](../GlyphPoint-v1a-layout-fixed.html). Filename versions and project-schema versions are independent.

## Contents

- [Project JSON](#project-json) — v3 fields, grapheme cells, inherited and independent colours.
- [Validation and resource limits](#validation-and-resource-limits) — Allocation, Unicode, imports, history, and export bounds.
- [Compatibility](#compatibility) — Explicit v1/v2 migration and forward compatibility.
- [Palette-only JSON](#palette-only-json) — Portable glyph defaults and active slots.
- [Plain text](#plain-text) — Graphemes, tabs, line endings, and rectangular padding.
- [Standalone HTML](#standalone-html) — Visible artwork plus inert editable data.
- [External HTML imports](#external-html-imports) — Supported CSS cascade, colour conversion, and bounded inert parsing.
- [Transaction and storage behavior](#transaction-and-storage-behavior) — Atomic imports, confirmed file writes, downloads, and recovery.

## Project JSON

The writer produces `format: "glyphpoint-v3"`. A complete small example demonstrates two independently coloured occurrences of the same grapheme:

```json
{
  "format": "glyphpoint-v3",
  "cols": 3,
  "rows": 1,
  "cells": [
    {"ch":"A","fg":"","bg":"","font":"DejaVu Sans Mono","bold":false,"italic":false,"underline":false},
    {"ch":"A","fg":"#ff6633","bg":"#203040","font":"DejaVu Sans Mono","bold":true,"italic":false,"underline":false},
    {"ch":"é","fg":"#aaccff","bg":"","font":"DejaVu Sans Mono","bold":false,"italic":false,"underline":true}
  ],
  "glyphPalette": [
    {"glyph":"A","colour":"#a8e6a3","represents":"Wall"},
    {"glyph":"é","colour":"#ffffff","represents":""},
    {"glyph":" ","colour":"#000000","represents":""}
  ],
  "glyphPrimary": "A",
  "glyphSecondary": "é",
  "square": false,
  "fieldBg": "#000000"
}
```

The last glyph is `e` followed by a combining acute accent. It occupies one cell. Unicode normalization is not applied: precomposed `é` and decomposed `é` remain different palette keys and can coexist.

| Field | Contract |
| --- | --- |
| `format` | Reader accepts `glyphpoint-v1`, `glyphpoint-v2`, and `glyphpoint-v3`; writer uses v3. |
| `cols`, `rows` | Required positive integer dimensions within both axis and area budgets. |
| `cells` | Required flat row-major array, exactly `cols * rows` records. Index is `y * cols + x`. |
| `glyphPalette` | Optional array; defaults to the built-in palette if absent or null. Used glyphs and reserved space are added during normalization when capacity allows. |
| `glyphPrimary`, `glyphSecondary` | Optional active drawing choices. A choice must exist in the normalized palette; otherwise it falls back to available entries. |
| `fieldBg` | Six-digit `#rrggbb` colour. Missing/null falls back to legacy `defaultBg`, then black. Other invalid values are rejected. |
| `square` | Optional boolean; false if absent. A supplied non-boolean is rejected. |

`docName`, dirty state, history, clipboard, selection, zoom, interface mode, brush colour choices, edge policy, tool choices, and open dialogs are not project fields. The opened filename supplies the document name. Unknown object fields are not copied into application state.

### Cells and colour inheritance

| Cell field | v3 behavior |
| --- | --- |
| `ch` | Exactly one printable Unicode extended grapheme cluster, up to 32 code points. Required. U+0020 space is a blank cell. |
| `fg` | Empty string or omitted: inherit this glyph's palette colour. Six-digit hex: independent foreground for this cell. Other supplied values are rejected. |
| `bg` | Empty string or omitted: inherit `fieldBg`. Six-digit hex: independent background for this cell. Other supplied values are rejected. |
| `font` | One of `Cascadia Mono`, `Cascadia Code`, `Consolas`, `Courier New`, `DejaVu Sans Mono`, `monospace`. Missing/unsupported v3 project input becomes `DejaVu Sans Mono`; legacy v1/v2 input retains its `Cascadia Mono` fallback. |
| `bold`, `italic`, `underline` | True only when the supplied value is the boolean `true`; missing/other values become false. |

Colours normalize to lowercase. There is no alpha channel in saved cell colours. HTML import composites supported alpha colours into opaque six-digit values. A cell with explicit foreground keeps that colour when its glyph's palette default changes; set its foreground back to inherit to reconnect it to global recolouring. The same rule applies to explicit backgrounds and the field background. Erasing writes a blank cell with inherited colours and default font/style.

Each palette entry has `glyph`, `colour`, and `represents`. Glyphs must be unique valid graphemes. Missing/invalid palette colours use a valid legacy `glyphColours[glyph]` mapping when available, otherwise a built-in glyph default or white. This palette fallback is intentional; v3 cell overrides are validated strictly. `represents` is an optional string truncated to 80 UTF-16 code units.

If a v3 cell's glyph is absent from the palette, normalization adds it using the first encountered cell's explicit foreground when present, otherwise the default glyph colour. It also inserts reserved U+0020 space when missing. Both operations must fit the palette budget.

### Fonts and rendering

New cells use bundled DejaVu Sans Mono; regular, bold, oblique, and bold-oblique font assets are embedded in the standalone application. **Use embedded font** applies that family to a selection or the whole document. Other permitted families remain available for compatibility and use installed/browser fallbacks. The canvas renderer measures and fits glyph ink within a cell, including wide graphemes and italic overhang.

A project stores text and font preferences, not glyph outlines. The bundled font does not cover every Unicode symbol or emoji, and platform fallback/rasterization can still vary. PNG export preserves the rendered image for sharing where exact appearance matters; it does not carry editable project data. Font license notices are preserved with the bundled font assets and exports that embed them.

## Validation and resource limits

| Resource | Limit |
| --- | --- |
| Width or height | 1–512 cells each. |
| Field area | At most 65,536 cells; 512 × 512 exceeds the area budget. |
| Input file | At most 16 MiB (`16 * 1024 * 1024` bytes), checked before reading/parsing. |
| Project save / HTML export | At most the 16 MiB re-import budget. A JSON save can omit indentation when necessary to fit. |
| Palette | At most 4,096 unique entries, including reserved U+0020 space. |
| Grapheme | One cluster, at most 32 Unicode code points. C0/C1 controls, lone surrogates, U+2028, and U+2029 are rejected. |
| Label | 80 UTF-16 code units after normalization. |
| External HTML tree | At most 200,000 visited nodes; nesting depth at most 100. |
| HTML styles | At most 131,072 style characters, 512 rules, 2,048 selectors, and 8,192 declarations. |
| CSS matching | At most 1,000,000 selector-part checks; supported selectors are at most 256 characters and 16 parts. |
| Retained undo + redo | At most 60 snapshots and 262,144 cell records combined. |
| Recovery archive | At most 12 document checkpoints and 32 MiB of UTF-8 payloads total; each payload at most 16 MiB. |
| PNG image | At most 32 × 1024 × 1024 pixels and 16,384 pixels per side. |

These are allocation budgets, not latency guarantees. The renderer paints a viewport-sized canvas and expensive fill/resize operations use workers or cooperative tasks; normalization, project serialization, palette UI, and some smaller edits still perform synchronous work.

`Intl.Segmenter` supplies grapheme boundaries. Where it is unavailable, ASCII editing remains available and unsupported Unicode input receives an explicit error instead of being silently split. Segmentation follows the browser's Unicode implementation; neither terminal column widths nor bidirectional paragraph layout is part of the grid contract.

## Compatibility

### Reading v1 and v2

Legacy project cells must still contain exactly one Unicode code point. They then pass current printable-glyph validation. Invalid dimensions, mismatched arrays, duplicate palette glyphs, unsupported controls, and exhausted palette capacity fail before installation.

The legacy renderer used one foreground per glyph and a shared field background. Migration first preserves the old rule that a valid legacy cell foreground can seed a missing glyph's palette entry. **v1/v2 `fg` and `bg` cell fields are then deliberately cleared**, including values that were once stored but ignored visually. Activating stale fields as independent v3 paint would change the appearance of existing artwork. The resulting palette and `fieldBg` therefore remain authoritative for migrated cells. Unknown legacy per-cell fields are not preserved as an archival copy; keep an original file if needed.

Legacy string palette entries and `glyphColours` mappings remain readable. `defaultBg` remains the fallback when `fieldBg` is missing/null. Missing font/style fields receive safe defaults; arbitrary font names cannot become executable attributes or arbitrary CSS. Saving a migrated document writes v3.

### Opening v3 in older releases

Older GlyphPoint releases do not understand v3's grapheme and independent-colour contract. They may reject the schema or lose information. Do not relabel v3 JSON as v2: a schema string is a semantic version, not a compatibility switch. Plain text or PNG can be used for noneditable interchange, subject to each format's omissions.

## Palette-only JSON

**Colours… → File → Export palette…** writes `glyphpoint-palette.json`:

```json
{
  "format": "glyphpoint-v3",
  "kind": "palette",
  "glyphPalette": [
    {"glyph":"A","colour":"#ffffff","represents":""},
    {"glyph":" ","colour":"#000000","represents":""}
  ],
  "glyphPrimary": "A",
  "glyphSecondary": "A",
  "fieldBg": "#000000"
}
```

The manager accepts v1/v2/v3 palette files or compatible projects' palettes. Reserved space is supplied if missing. Entries used on the current canvas but omitted from the imported palette are retained; a combined palette that cannot fit is rejected before mutation. A valid supplied background updates the field. Explicit per-cell colours remain explicit and are not overwritten by importing palette defaults.

A palette-only payload is rejected by **Open GlyphPoint project**. Import it through the manager. Palette imports are undoable and mark the current document dirty.

## Plain text

The text reader removes an initial BOM, normalizes CRLF/CR to LF, expands tabs to the next four-cell stop, segments graphemes, and removes one final newline as the conventional file terminator. Additional empty rows remain. Ragged rows are padded to the widest grapheme-cell row. An all-empty retained row has at least one blank cell; a completely empty payload is rejected.

Text import inherits the current palette, field background, and square-cell choice, adding missing glyphs. Cells start with inherited colours. Export writes the full rectangular grid with LF separators and a final LF. It contains no palette, independent colour, font/style, selection, or background information. It is ordinary Unicode text, not terminal ANSI colour escape sequences. A terminal may display a grapheme across a different number of columns than GlyphPoint's one-cell model.

## Standalone HTML

Native HTML contains two representations:

- Visible `<pre id="art">` artwork with safe cell styling and fixed grid geometry.
- `<script id="glyphpoint-data" type="application/json">` containing a normalized v3 project. This is data, not executable JavaScript.

Visible text is HTML-escaped. The data block escapes `<`, `>`, and `&`; the application's own export template also escapes closing script delimiters. Dynamic CSS comes from validated colours, finite dimensions, and allowed font families. The generated Content Security Policy permits the export's own styles and embedded font data while blocking external resources. No imported scripts run.

**Open coloured HTML** uses native embedded JSON first and validates it as a project. It restores cells, per-cell colour overrides, palette, styles, background, and square mode. Editing only visible spans does not change embedded project data: the JSON remains authoritative. Modify both consistently, or remove native metadata to use the external HTML importer.

HTML export is rejected if it exceeds the 16 MiB re-import budget. Save JSON or reduce the field in that case. Exporting HTML or PNG does not clear unsaved changes in the editable project.

## External HTML imports

When native metadata is absent, the importer chooses `#art` or the first `<pre>`. It parses a detached template and never adds imported nodes or style sheets to the live application. Scripts, image/media elements, frames, SVG, embedded objects, and their executable/resource content are ignored. Nothing is downloaded to complete an import.

### Supported styles

| Feature | Imported behavior |
| --- | --- |
| Inline CSS and embedded `<style>` | A bounded cascade resolves supported properties using `!important`, inline priority, selector specificity, and source order. |
| Selectors | Tags, `*`, classes, IDs, combinations of these, descendant selectors, direct-child selectors, and comma lists. |
| Foreground/background | CSS colours accepted by the colour parser, including common hex/rgb/named/alpha forms, become opaque six-digit cell colours. Alpha is composited over inherited backgrounds. |
| Font families | First supported family in the supplied list; unknown families use the configured fallback and produce a warning. Fonts are not downloaded. |
| Font weight/style | Bold/normal/numeric weight, italic/oblique, and corresponding `b`/`strong`/`i`/`em` tags. |
| Decoration | Underline and the `u` tag. Other decoration forms produce a warning. |
| Visibility | `display:none` / `hidden` remove text; invisible content contributes blank cells where appropriate. |
| Rows and spacing | Text newlines, `br`, supported block boundaries, four-cell tabs, and rectangular padding. Complex layout is linearized with a warning. |

The same glyph may retain different foregrounds/backgrounds in different cells. Palette entries provide defaults; an external cell's resolved foreground is saved explicitly. The artwork container's resolved background supplies `fieldBg`, and differing cell backgrounds become overrides.

Adjacent text nodes are segmented together so a combining sequence or joined emoji split across markup can remain one cell. If one grapheme crosses differently styled nodes, the first code point's style is used and the importer reports that decision.

External stylesheets, CSS imports/at-rules, unsupported selectors such as pseudo-classes and attributes, variables, resource URLs, images/gradients, arbitrary positioning, and complex browser layout are outside the importer. Unsupported features produce bounded warnings where detected. This is an editable text/style importer, not a browser screenshot engine. Native project JSON gives the most complete editable interchange.

## Transaction and storage behavior

### Imports and document lifecycle

`readImportFile` enforces the byte budget. Parsers prepare normalized candidates; `installDocument` snapshots and installs only after validation and any dirty-document confirmation. A generation counter discards superseded file reads. Failed imports leave cells, palette, dimensions, document name, and history unchanged.

Project open starts clean; text/HTML import and explicit recovery mark an editable result unsaved. New/Open flush the outgoing recovery snapshot before replacing state, then start a new recovery identity. Asynchronous jobs and direct-save handles are invalidated on document replacement. Undo/redo and the styled internal clipboard remain session-local.

### Direct file save and download

On supporting secure browser contexts, **Save project** invokes the File System Access picker from the user gesture. After a destination is chosen, subsequent saves in that document reuse its in-memory handle. **Save as** chooses another destination. New/Open/reload do not silently reuse a previous document's destination. Opening a file through the ordinary file input does not itself grant write access to that file.

A direct save succeeds only after the writable stream closes successfully. The title's unsaved marker is cleared only when the same document revision is still current. Edits made while the write is pending stay dirty. Picker cancellation, permission failure, interrupted writes, and close failure never report success. Overlapping save requests do not start competing writes.

Where direct saving is unavailable, Save requests a JSON download. **Download project** always provides that route. The browser controls completion, destination, and cancellation, so the editor reports “download requested” and keeps the dirty indicator. Verify the resulting JSON file yourself. Text, HTML, and PNG exports are also downloads and do not certify that the project was saved.

### Recovery archive

Recovery uses IndexedDB database `glyphpoint.recovery.v1`, with `documents` and `summaries` stores. It schedules the latest checkpoint per document identity after 750 ms without a new edit, with a five-second timer during continuous editing. Browser suspension or busy JavaScript can delay those timers. Writes are serialized; queued checkpoints for the same document collapse to the latest captured revision. The JSON snapshot is detached before a document can be replaced. The pending-write queue is also bounded; if storage is blocked and that queue fills, the current document retries when it drains.

Each tab/session and each New/Open/recovered document gets a unique key. Two tabs do not overwrite the same checkpoint merely because filenames match. The archive holds at most 12 document checkpoints and 32 MiB of UTF-8 JSON payloads, with a 16 MiB individual limit. The oldest other entries are removed in the same transaction as a new checkpoint. A failed transaction rolls back both the new write and its proposed evictions. Payload budgets are not the browser's exact disk/quota accounting.

**Recovery** lists entries and offers explicit **Recover** and **Delete checkpoint** actions; startup only advertises their availability. Recovery validates the envelope, byte size, JSON, and project through the same normalizer before installation. Reading a candidate never installs it by itself. Deleting the current checkpoint suppresses its recreation until another edit; a different active tab may create another checkpoint after its own next edit.

The status distinguishes pending, saving, saved, and unavailable/error. “Recovery saved” means an IndexedDB transaction committed; it does not mean an external project file was written. Quota failures, blocked/unavailable/private storage, and read/write errors are surfaced. There is no hidden localStorage canvas fallback. Saving/downloading project files remains available when recovery fails.

Hidden-page and pagehide events attempt to flush changes. Browsers can terminate a process before the latest debounce or transaction completes, clear/evict storage, or isolate file URLs, localhost, profiles, and private sessions. Recovery is bounded local protection, not an external backup or cloud sync. The beforeunload prompt is likewise browser controlled and cannot guarantee restoration.

Palette/UI preferences continue to use localStorage keys `glyphpoint.palette.v3` (with a v2 read fallback) and `glyphpoint.uiMode.v1`. These are separate from IndexedDB artwork checkpoints.
