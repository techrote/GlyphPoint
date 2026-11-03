# Project and interchange formats

This is the maintained editor's data contract. Source authority is [GlyphPoint-v1a-layout-fixed.html](../GlyphPoint-v1a-layout-fixed.html), especially `normaliseProject`, `normaliseCell`, `normalisePalette`, `textDocument`, `htmlDocument`, and `exportHtml`. Filename versions and project-schema versions are independent.

## Contents

- [Project JSON](#project-json) — Required fields and normalized cell/palette data.
- [Validation and resource limits](#validation-and-resource-limits) — Allocation, character, palette, and history bounds.
- [Compatibility](#compatibility) — Legacy v1 fields and intentional normalization.
- [Palette-only JSON](#palette-only-json) — Portable glyph colours and active slots.
- [Plain text](#plain-text) — Code points, tabs, line endings, and rectangular padding.
- [Standalone HTML](#standalone-html) — Visible artwork plus inert editable data.
- [External HTML imports](#external-html-imports) — Supported text/style subset and colour conflicts.
- [Transaction and storage behavior](#transaction-and-storage-behavior) — Atomic imports and the distinction between downloads and preferences.

## Project JSON

The writer produces `format: "glyphpoint-v2"`. A minimal complete project is:

```json
{
  "format": "glyphpoint-v2",
  "cols": 2,
  "rows": 1,
  "cells": [
    {"ch":"A","fg":"","bg":"","font":"Cascadia Mono","bold":false,"italic":false,"underline":false},
    {"ch":" ","fg":"","bg":"","font":"Cascadia Mono","bold":false,"italic":false,"underline":false}
  ],
  "glyphPalette": [
    {"glyph":"A","colour":"#a8e6a3","represents":"Wall"},
    {"glyph":" ","colour":"#000000","represents":""}
  ],
  "glyphPrimary": "A",
  "glyphSecondary": " ",
  "square": false,
  "fieldBg": "#000000"
}
```

| Field | Contract |
| --- | --- |
| `format` | Reader accepts `glyphpoint-v1` and `glyphpoint-v2`; writer uses v2. |
| `cols`, `rows` | Required positive integer dimensions within both axis and area budgets. |
| `cells` | Required flat row-major array, exactly `cols * rows` records. Index is `y * cols + x`. |
| `glyphPalette` | Optional array; defaults to the built-in palette if absent or null. Used glyphs and reserved space are added during normalization when capacity allows. |
| `glyphPrimary`, `glyphSecondary` | Optional active drawing choices. Must be present in the normalized palette to be selected; otherwise fall back to available entries. |
| `fieldBg` | Six-digit `#rrggbb` colour; when absent or null, defaults to `defaultBg` from v1, then black. Invalid non-null values are rejected. |
| `square` | Optional boolean; false if absent. A supplied non-boolean is rejected. |

`docName`, dirty state, history, clipboard, selection, zoom, UI mode, tool choices, and open dialogs are not persisted in the project payload. The opened filename becomes the document name. Unknown object fields are not copied into application state.

Each cell has the following normalized representation:

| Cell field | Behavior |
| --- | --- |
| `ch` | Exactly one supported Unicode code point; required. A space is a blank cell. |
| `fg`, `bg` | Legacy per-cell colour metadata. Valid six-digit hex is retained; otherwise empty. Display colour is still global per glyph plus the shared field background. |
| `font` | One of `Cascadia Mono`, `Cascadia Code`, `Consolas`, `Courier New`, `DejaVu Sans Mono`, `monospace`. Unsupported names normalize to `Cascadia Mono`. Actual installed fonts/fallbacks determine appearance. |
| `bold`, `italic`, `underline` | True only when the supplied value is the boolean `true`; missing/other values normalize to false. |

Each palette entry has `glyph`, `colour`, and `represents`. Glyphs are unique. Valid six-digit colours normalize to lowercase. Invalid/missing palette colours use a valid legacy `glyphColours[glyph]` entry when available, otherwise the built-in default for that glyph or white. `represents` is an optional string truncated to 80 UTF-16 code units. Colour fallback is intentional normalization; malformed glyphs and duplicate entries are rejected.

When a cell references a glyph missing from the palette, normalization adds an entry using the first encountered cell's valid legacy foreground or the default glyph colour. Consequently, a legacy project may normalize to a larger palette. A palette without space gains the reserved U+0020 entry if there is room.

## Validation and resource limits

| Resource | Limit |
| --- | --- |
| Width or height | 1–512 cells each. |
| Field area | At most 65,536 cells; 512 × 512 is rejected despite each axis being individually valid. |
| Input file | At most 16 MiB (`16 * 1024 * 1024` bytes), before reading/parsing. |
| Palette | At most 4,096 unique entries, **including reserved U+0020 space**. At most 4,095 non-space entries fit. |
| Glyph | Exactly one code point; C0/C1 controls, lone surrogates, and U+2028/U+2029 are rejected. |
| Label | 80 UTF-16 code units after normalization. |
| HTML walk | Nesting depth at most 100; the same grid and palette budgets apply. |
| Retained undo + redo | At most 60 snapshots and 262,144 retained cell records combined. Older history is discarded as either budget is reached. |

These are allocation bounds for a DOM-based editor, not performance guarantees. A two-code-point flag, combining sequence, or joined emoji cannot occupy one cell as a single glyph. Plain supplementary-plane characters represented by a surrogate pair in JavaScript are valid single code points. Single combining marks and wide/emoji code points may not look useful in a clipped fixed grid.

## Compatibility

Both recognized schema strings use the same current validation path. Legacy string palette entries and `glyphColours` mappings remain readable. Missing fonts/formatting flags receive safe defaults; `defaultBg` is recognized when `fieldBg` is absent or null. Unsupported font metadata cannot become HTML attributes or arbitrary CSS.

The current reader does not reproduce arbitrary old per-cell foreground/background rendering: GlyphPoint's current model assigns one foreground colour to each glyph and one background to the field. JSON export retains valid legacy metadata, but the visible rendering follows the palette. Keep an original file if conversion fidelity matters.

Old malformed files that declared impossible dimensions, mismatched cell counts, duplicate palette glyphs, or control characters are now rejected. Rejection does not partially install the file. There is no silent 72-entry palette truncation.

## Palette-only JSON

**Colours… → File → Export palette…** downloads `glyphpoint-palette.json`:

```json
{
  "format": "glyphpoint-v2",
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

The reader supplies reserved space when missing. The manager accepts palette-only files or a compatible project's palette. Importing a palette does not import project cells. Missing entries still used on the current canvas are retained with their current colours; a palette that cannot fit those entries is rejected before mutation. A valid imported background can change the current field.

A palette-only payload is not a project and is rejected by **Open GlyphPoint project**. Use the manager's import action. Palette imports are undoable and dirty the current document.

## Plain text

The text reader removes an initial BOM, normalizes CRLF and CR to LF, expands tabs to the next four-column stop, counts Unicode code points, and removes **one** final newline as a conventional file terminator. Further empty rows remain. Ragged rows are padded to the maximum code-point width; a retained empty row has at least one blank cell when every row is empty. A completely empty text payload is rejected.

Text import inherits the current palette, background, and square-cell choice, adding missing glyphs. Plain text export writes the full rectangular grid with LF separators and one final LF. It carries no palette, font/style, selection, or background information. This is ordinary text, not terminal ANSI colour escape sequences.

## Standalone HTML

The current export has two parts:

- A visible `<pre id="art">` containing one span per cell, with validated palette/font classes and bold/italic/underline classes. CSS grid retains rectangular or square cell geometry.
- `<script id="glyphpoint-data" type="application/json">` containing the normalized v2 document payload. This is a data block, not executable JavaScript.

The JSON data block escapes `<`, `>`, and `&`; visible cell text is HTML-escaped. Dynamic CSS uses numeric dimensions, fixed font names, and validated colours. A restrictive Content Security Policy allows the generated inline styling and denies other resource types. The HTML export needs no external assets or executable code.

Opening this HTML through GlyphPoint's **Open coloured HTML** uses the embedded data, validates it as a project, and restores the complete normalized cell/palette/background/square state. Editing only the visible spans in an exported file does not update the embedded project data: the embedded JSON is authoritative on re-import. Modify that data consistently or remove it to request the external HTML text/style importer.

Export is refused if the result exceeds the same 16 MiB re-import budget. Save a JSON project or reduce the field in that case. Exporting HTML does not clear the project's unsaved-change indicator.

## External HTML imports

Without native embedded data, the importer reads `#art` or the first `<pre>`. It copies text, line breaks, tabs, and supported inline styling. Hex `#rgb`/`#rrggbb` and opaque `rgb(r,g,b)` colours are supported; CSSOM-normalized equivalents may also work. Fonts use the fixed allowlist. Bold/strong, italic/em, underline tags and supported inline style properties carry those flags. The `<pre>` inline background supplies the shared background if supported.

External stylesheets, complex selectors, images, script/style text, iframes, SVG, and embedded objects do not become artwork. The importer parses into inert template content and never attaches that content to the live document. This protects the editor's DOM and avoids loading imported resources.

The first foreground encountered for each glyph wins because the document has one colour per glyph. Later conflicting colours produce a status message. Multiple independent cell backgrounds, arbitrary typography, computed stylesheet layout, and browser screenshots are outside this importer. Use a native JSON project or current native HTML export for faithful editable interchange.

## Transaction and storage behavior

`readImportFile` enforces the byte budget; parsers prepare a normalized candidate; `installDocument` snapshots and installs it only after validation and any dirty-document confirmation. A generation counter discards superseded file-read results. Invalid files leave cells, palette, dimensions, document name, and history unchanged.

Project open clears the dirty flag. Text and HTML imports mark the resulting editable document unsaved. New and page exit protect tracked unsaved changes with browser-managed confirmation behavior. No such prompt guarantees recovery if the tab/process is terminated.

`saveProject` requests a browser download and then clears the dirty indicator. The browser controls completion, naming, destination, and cancellation; verify the downloaded file. It does not write directly back into the original file. Local storage contains palette preferences and UI mode, never a canvas recovery document. Undo and clipboard data are session-local.
