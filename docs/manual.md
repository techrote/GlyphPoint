# GlyphPoint instruction manual

This manual describes the maintained **`GlyphPoint-v1a-layout-fixed.html`** editor. It is a single-file application for editing coloured character grids in a desktop browser. The earlier `GlyphPoint-v1a.html` and `GlyphPoint-v04a.html` files are historical versions and may behave differently.

Start with the [new-user guide](new-user-guide.md) if you want a short worked exercise. This manual is the reference for the available controls and their interactions. Implementation details live in the [maintained application source](../GlyphPoint-v1a-layout-fixed.html); UI labels in this manual correspond to that file. The [repository overview](../readme.md) provides the documentation index. For development, follow [AGENTS.md](../AGENTS.md), the [agent/RAG reference](../RAG.md), and the [project format reference](project-format.md).

## Contents

- [Opening the editor](#opening-the-editor) — Run the local HTML file, with an optional localhost server.
- [How a GlyphPoint document works](#how-a-glyphpoint-document-works) — Understand cells, global glyph colours, styling, coordinates, and persistence.
- [Finding the controls](#finding-the-controls) — Navigate the ribbon, classic sidebar, File menu, and dialogs.
- [Drawing tools](#drawing-tools) — Use Pencil, Flood fill, Eraser, Glyph picker, and Magnifier.
- [Brush size and tips](#brush-size-and-tips) — Choose a square, circular, or ratio-based footprint.
- [Shapes](#shapes) — Draw outlines, filled shapes, lines, and arrows.
- [Placing text](#placing-text) — Enter multiline text with font, style, and repetition controls.
- [Selections and the clipboard](#selections-and-the-clipboard) — Select, move, copy, cut, paste, clear, and crop.
- [Rotation and reflection](#rotation-and-reflection) — Transform the whole field or a selection.
- [Resize, skew, and properties](#resize-skew-and-properties) — Distinguish scaling from changing the field boundary.
- [The glyph palette](#the-glyph-palette) — Choose primary/secondary glyphs and maintain palette entries.
- [Glyph Colour Manager](#glyph-colour-manager) — Manage colours, labels, replacements, colourways, and palette files.
- [Saving, opening, and history](#saving-opening-and-history) — Keep projects, understand undo, and avoid confusing preferences with backups.
- [File formats and exports](#file-formats-and-exports) — Compare JSON projects, palette JSON, text, and standalone HTML.
- [View, navigation, and printing](#view-navigation-and-printing) — Adjust zoom, cell proportions, rulers, and print output.
- [Keyboard and mouse reference](#keyboard-and-mouse-reference) — Find the available shortcuts and mouse actions.
- [Practical workflows](#practical-workflows) — Apply the controls to common drawing and editing tasks.
- [Limits and compatibility](#limits-and-compatibility) — Understand Unicode, fonts, browser capabilities, and performance boundaries.
- [Troubleshooting](#troubleshooting) — Diagnose common symptoms and collect useful bug reports.

## Opening the editor

Download the repository ZIP and extract it, or download the raw `GlyphPoint-v1a-layout-fixed.html` file from GitHub. Open that file in a desktop browser. A GitHub source-code page is a file viewer, not the running editor.

The application contains its own JavaScript, CSS, and interface. Drawing and file downloads do not require a server. There is no application account, cloud synchronisation, or remote project-storage service in the editor.

If you prefer to serve it locally and already have Python, run the appropriate command from the repository folder:

```powershell
# Windows
py -m http.server 8000 --bind 127.0.0.1
```

```sh
# Linux or macOS
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/GlyphPoint-v1a-layout-fixed.html`. A local server can help with clipboard permissions; it does not provide project persistence. Stop it with `Ctrl+C` in the terminal.

Use the maintained filename consistently. Browser preferences belong to the browser's storage context, so a downloaded `file:` copy, a localhost copy, another browser, and a private-browsing window may not share them.

## How a GlyphPoint document works

### Cells and coordinates

The default field is **80 columns × 80 rows**. Coordinates start at **0, 0** in the top-left cell. The horizontal coordinate increases to the right, and the vertical coordinate increases downward. The status bar shows the cell under the pointer and the total field dimensions.

A cell contains:

| Component | User-facing meaning |
| --- | --- |
| Glyph | The character displayed in the cell. A space is an empty-looking cell. |
| Font | The preferred font family for that cell. |
| Bold, italic, underline | Text-style flags, primarily set with the Text tool. |
| Glyph palette reference | The character's foreground colour comes from the document-wide glyph palette. |

GlyphPoint's model uses **one colour per glyph**. If `#` is green, every `#` in the field is green. Changing its palette colour updates all its occurrences. A label in the Colour Manager describes a glyph; it does not create another glyph or another colour instance.

The **field background** is shared by the whole document. Empty cells show that colour. The current renderer uses the glyph palette and field background rather than independent per-cell foreground/background paints. JSON may contain legacy `fg` and `bg` fields; their presence does not imply arbitrary per-cell colouring in the editor.

### Characters are not bitmap pixels

Normal cells use a font-character width and a font-line height. **Square pixels** changes their display proportions to square cells; it does not convert the document to a raster image. Font shapes remain characters.

Text size controls repeat characters into cells. Rotation and reflection move cells; they do not rotate the outline of each glyph. For example, moving a `>` through a horizontal reflection does not automatically turn it into `<`.

Glyph storage is based on Unicode code points. A single visible symbol composed of several code points can occupy several cells. Font coverage and glyph width determine whether it fits cleanly into a cell. Basic ASCII and single-code-point symbols are the most predictable choices.

### What is saved where

| Item | Where it is kept |
| --- | --- |
| Current artwork | In the running page until you save a project. |
| Saved project | A JSON file downloaded through the browser. |
| Undo/redo history | In the current page session; it is not written into project files. |
| Palette preferences and selected glyphs | Browser storage, when available, plus copies in saved projects/palettes. |
| Ribbon/classic layout preference | Browser storage, when available. |
| Text or HTML export | A separate downloaded file. |

There is **no automatic canvas recovery after reload**. Save project files regularly and keep versions for important edits.

## Finding the controls

### Ribbon and classic sidebar

The title-bar mode button switches between a ribbon across the top and a classic sidebar on the left. Its label names the destination: **Classic** switches to the sidebar; **Ribbon** switches back.

Both layouts use the same document, tools, palette, and undo history. In a small window, scroll the ribbon horizontally to reach controls, or scroll the classic sidebar vertically. Use the canvas's own scroll area to navigate artwork larger than the visible workspace.

Most drawing controls are icon buttons. Hover over a button for its tool name or action. A highlighted tool button indicates the current tool. The title bar also contains **Undo**, **Redo**, and the document name. An asterisk before the name indicates unsaved changes tracked by the editor.

### File menu

| Command | Result |
| --- | --- |
| **New** | Creates a blank default-size document. Save the current project first if you need it. |
| **Open GlyphPoint project…** | Reads an editable GlyphPoint JSON project. |
| **Open plain text…** | Imports characters and line breaks as a field. |
| **Open coloured HTML…** | Imports artwork from a supported HTML `pre` element; see the format details below. |
| **Save project** | Downloads an editable JSON project. |
| **Export plain text…** | Downloads the grid as text. |
| **Export standalone HTML…** | Downloads a browser-viewable rendering of the artwork. |
| **Properties** | Changes field dimensions, background, and the blank-skipping option. |
| **Glyph Colour Manager…** | Opens the document-wide glyph/colour table. |
| **Print…** | Opens the browser's print dialog. |
| **Help / shortcuts** | Opens the editor's concise built-in help. |

Dialogs provide their own **Cancel**, **Close**, or action button. **Close** on the Colour Manager keeps edits already applied; use **Revert changes** if you intend to roll them back before closing that session.

## Drawing tools

### Pencil

Select a glyph and choose **Pencil**. Click a cell for one brush stamp or drag to draw a continuous path. Left-button drawing uses the primary glyph; right-button drawing uses the secondary glyph. The brush's **Size** and **Tip** control the painted footprint.

Pencil replaces the cells it touches. It applies the normal drawing font/style rather than retaining old bold, italic, or underlined text underneath. The path between successive pointer positions is filled, so a quick drag still draws connected cells.

### Flood fill

Choose **Flood fill**, then click the target region. It replaces the connected region whose cells contain the same glyph as the clicked cell. Adjacency is horizontal and vertical; diagonally touching cells alone do not connect a region.

The match is based on the character, not on the cell's font or style. Left-click fills with the primary glyph; right-click fills with the secondary glyph. Brush size and tip do not limit flood fill. A continuous outline can contain a fill, but a gap in the outline allows blank regions on either side to connect.

### Eraser

Choose **Eraser** and click or drag. Erasing writes normal spaces with the field's background appearance. It uses the current brush size and tip. It does not reveal a hidden layer; there are no layers underneath the erased cells.

### Glyph picker

Choose **Glyph picker**, then click a cell. Left-click sets its character as the primary glyph; right-click sets it as the secondary glyph. The picker chooses the character, not a complete text-style stamp.

### Magnifier

Choose **Magnifier** and click the canvas. The tool doubles zoom while the current zoom is below 200%, and halves it at or above 200%. This is separate from the explicit **+**, **−**, **1:1**, and slider controls. Select another drawing tool when you finish magnifying.

## Brush size and tips

The **Size** number accepts whole values from **1 to 60**. It affects Pencil and Eraser. Shapes have a separate **Width** control. Use the ratio tips when you want a wider or taller stamp rather than a dragged shape.

| Tip | Footprint concept |
| --- | --- |
| Circle | A circular approximation within an `n × n` cell box, where `n` is Size. |
| Square | An `n × n` group of cells centred around the pointer. |
| 3:1 rectangle | Horizontal rectangle; width is three times its base height. |
| 5:1 rectangle | Horizontal rectangle; width is five times its base height. |
| 1:3 rectangle | Vertical rectangle; height is three times its base width. |
| 1:5 rectangle | Vertical rectangle; height is five times its base width. |

For the ratio tips, Size `n` gives nominal dimensions `3n × n`, `5n × n`, `n × 3n`, or `n × 5n` cells. All brush footprints are clipped at the field boundary. Even-sized footprints cannot have a single central cell, so expect a one-cell directional bias around the pointer.

The hover outline helps you judge the stamp before clicking. A circular stamp can look stretched in ordinary character-shaped cells; turn on **Square pixels** to compare its cell geometry visually.

## Shapes

Choose a shape, then drag between its start and end positions. Release the button to commit. The drag preview marks the bounding area; it is not a complete preview of the final glyph pattern.

| Shape | Behavior |
| --- | --- |
| Line | Connects the drag's endpoints. |
| Rectangle | Uses the drag's bounding box. |
| Ellipse | Fits an ellipse to the bounding box. |
| Triangle | Upright triangle within the bounds. |
| Right triangle | Right-angled triangle with its vertical side at the left and base at the bottom. |
| Diamond | A diamond centred within the bounds. |
| Arrow right/left/up/down | Direction is chosen by the button; the arrowhead scales with the shorter dimension and the shaft stretches. |
| Diagonal `/` | Ascending diagonal across the bounds. |
| Diagonal `\` | Descending diagonal across the bounds. |

Drag in either direction to position the bounding box. Shape orientation is determined by its button, not by dragging in the opposite direction. You can use reflection or rotation afterward to obtain another orientation.

### Stroke, fill, and width

| Control | Option | Effect |
| --- | --- | --- |
| **Stroke** | **Glyph** | Uses the primary glyph for a left-button outline, or the secondary for a right-button outline. |
| **Stroke** | **Lines** | Uses line/box-drawing characters chosen for the local edge direction. |
| **Stroke** | **None** | Omits the outline. A line/diagonal without a stroke draws nothing. |
| **Fill** | **None** | Leaves the shape's interior untouched. |
| **Fill** | **Primary** | Fills using the primary glyph. |
| **Fill** | **Secondary** | Fills using the secondary glyph. |
| **Width** | `1`–`8` | Sets the shape stroke's cell thickness. |

The mouse button selects the character for **Glyph** strokes: left uses primary and right uses secondary. The **Fill** setting is independent and explicitly chooses Primary or Secondary. Line and diagonal shapes use Stroke/Width but have no interior fill. The brush-tip selector does not change shape geometry.

Thicker shape strokes are stamped around their path and can extend outside the original drag bounds. Filled shapes also use the shape-width stamping behavior, so increasing Width can enlarge the apparent filled area. The field boundary clips the result.

**Lines** means character-based line rendering, not vector paths. Box-drawing corners and junctions are characters and are coloured through the same glyph palette as everything else. Their appearance depends on the font.

### Shift constraint

Hold **Shift** while dragging to constrain the shape's cell-space bounds to equal width and height. For a line, this produces a 1:1 diagonal constraint; it is not a horizontal/vertical snapping system. A 1:1 cell-space shape can still look stretched when the cells themselves are not square.

## Placing text

Choose **Text**, then click the starting cell. Enter one or more lines in the dialog and choose **Place text**. The clicked cell is the top-left anchor. Newlines advance to another text row; content past the right or bottom edge is clipped rather than automatically wrapping to the next row.

| Control | Meaning |
| --- | --- |
| Text area | The characters to insert. Newlines create additional rows. |
| **Font** | Preferred font: Cascadia Mono, Consolas, Courier New, or generic monospace. Availability depends on installed fonts. |
| **Scale** | `1×`, `2×`, or `3×`; each character is repeated into a square block of that many cells per side. |
| **Bold**, **Italic**, **Underline** | Style flags applied to the inserted cells. |
| **Background → Transparent** | Skips spaces in the text, preserving existing destination cells under those spaces. |
| **Background → Opaque** | Places spaces too, clearing their destination cells to the shared field background. |

Scale `2×` repeats `A` into four `A` cells. It does not draw a larger outline of the letter. Choose `1×` for ordinary readable captions.

Characters use their own palette colours. Choosing `#` as the primary glyph does not make every letter in a typed sentence take `#`'s colour. Open **Colours…** to recolour the letters you introduced. Characters added by drawing or import can appear automatically in the palette.

The background choice controls placement of blank characters; it does not create independently coloured text backgrounds or change the document's global background. Both modes replace non-space characters at the destination.

Text placement is an edit to the cells. There is no persistent text box to reopen later; edit the cells, undo the placement, or place replacement text.

## Selections and the clipboard

### Create a selection

Choose **Select**, choose **Rectangular selection** or **Free-form selection**, then drag on the field.

- A rectangular selection includes both drag endpoints.
- A free-form selection follows the pointer path and closes it into a polygon when you release. The mask contains cells inside that polygon.
- **All** selects the entire field and activates the Selection tool.

The display highlights the selection boundary. The status bar reports the width and height of its bounding box; for a free-form selection, this is not the number of selected cells.

Starting a drag outside the existing selection creates another selection. Starting inside it moves the selected content. To avoid moving an existing selection accidentally, begin a new selection in a cell outside its bounds, or press **Escape** outside a dialog to clear the current selection first.

### Move, copy, cut, and paste

To move artwork, use the Selection tool and drag from inside the selection to its new location. Moving clears the source cells and places the captured content at the destination. A free-form move carries only the cells within its mask. It can overwrite existing artwork. Use Undo immediately if the result is not intended.

| Action | Result |
| --- | --- |
| **Copy** | Captures selected cells into GlyphPoint's internal clipboard and attempts to copy a plain-text representation to the system clipboard. |
| **Cut** | Copies the selection, then clears its source cells. |
| **Paste** | Pastes at the current selection's top-left corner, or at `(0, 0)` if there is no selection. |
| **Clear** / **Delete** | Replaces selected cells with spaces. The field dimensions do not change. |

The internal clipboard carries cell font/style information. The external clipboard representation is plain text, so colour, font, and text-style information cannot travel through that representation. Pasted glyphs resolve their colours through the current document palette.

The editor prefers its internal copied selection when one exists. If there is no internal copy, it tries to read text from the system clipboard. Browser permission or origin restrictions can prevent external clipboard access; a failed external copy does not necessarily prevent copying within GlyphPoint.

To paste at a specific location, make a small selection whose top-left corner is at that location, then paste. Pasting is immediate; it does not first create a floating preview that follows your mouse. Cells outside the field are clipped, and the resulting selection is limited to valid field cells.

### Ignore blanks

**Ignore blanks** controls whether ordinary space cells are skipped when pasting or moving content onto another area:

- Checked: a space in the copied content does not overwrite a destination cell.
- Unchecked: spaces overwrite destination cells like other characters.

This is useful when stamping a glyph motif over an existing background. It is not alpha transparency or a separate layer. The similarly named **Glyphs only** checkbox in Properties controls the same setting.

### Crop

**Crop** replaces the field with the selected bounding rectangle. The selection's top-left corner becomes the new `(0, 0)` and its width/height become the new field dimensions.

Cropping a free-form selection uses its rectangular bounds and replaces cells outside the mask with spaces. The result is still a rectangular document, with the field background visible around the retained shape. Save a version before cropping if you need a durable copy of what lies outside the crop.

## Rotation and reflection

The transform buttons provide:

| Action | Cell transformation |
| --- | --- |
| Rotate clockwise | 90° clockwise. |
| Rotate anticlockwise | 90° anticlockwise. |
| **180°** | Half-turn. |
| Mirror horizontally | Reverses left/right cell order. |
| Mirror vertically | Reverses top/bottom cell order. |

With no selection, a transform affects the entire field. A whole-field 90° rotation swaps its width and height. With a selection, the transform is applied at the selection's top-left position. A non-square selection changes its bounding-box dimensions under a 90° rotation; the field itself is not automatically enlarged to fit it.

A free-form transform uses its selected mask. Unselected cells inside the mask's bounding rectangle are not treated as source content. Destination cells reached by the transformed mask can be overwritten, while cells outside the operation remain unchanged.

Transforms preserve each cell's character and text styling. They move characters without substituting directional glyphs: `┌`, `/`, `>`, and similar characters do not automatically change orientation. If your artwork depends on those character shapes, check and replace them afterward.

Content transformed beyond the field edge is clipped. Leave room around a selection before rotating it, or enlarge the field with Properties first. **Ignore blanks** belongs to move/paste; it is not a general promise of transparent transforms.

## Resize, skew, and properties

### Choose the right operation

| Goal | Command | What happens to existing artwork |
| --- | --- | --- |
| Add empty space to the right or bottom | **File → Properties** | Existing cells keep their positions; new cells are spaces. |
| Trim right/bottom cells without scaling | **File → Properties** | Cells outside the new bounds are removed. |
| Keep only a chosen region | **Select → Crop** | The selected bounding rectangle becomes the whole field. |
| Enlarge or shrink the artwork | **Resize** | Resamples the entire field onto new cell dimensions. |
| Shear the artwork | **Resize → Skew** | Moves cells by a horizontal/vertical shear within the output bounds. |

These commands apply to the field. The Resize dialog does not become a selection-only resizer just because a selection exists.

### Resize and Skew dialog

| Control | Use |
| --- | --- |
| **Resize by → Cells** | Enter the desired column and row counts directly. |
| **Resize by → Percentage** | Enter horizontal and vertical percentages of the current dimensions. |
| **Maintain aspect ratio** | Links the dimensions. In percentage mode, it keeps the two percentages equal. |
| **Skew horizontal (°)** | Shears horizontally according to row position. |
| **Skew vertical (°)** | Shears vertically according to column position. |

Resize uses nearest-cell sampling. Increasing the size repeats source cells; decreasing it can omit fine details. It does not perform smooth image interpolation or reconstruct glyph outlines.

Skew is applied after resizing. Each angle accepts finite values between **−89° and +89°**. Its output stays within the chosen dimensions. Shifted content can be clipped, and several source cells can land on the same destination cell. For extreme shears, enlarge the field beforehand and work on a saved copy.

### Properties dialog

**Width** and **Height** change the field boundary while preserving cells at their original top-left coordinates. **Field background** changes the document's shared background. **Glyphs only** is the same preference as **Ignore blanks** in the Selection controls.

Changing the background changes the appearance of blank cells and every glyph's background. It does not change the glyph-colour entries.

## The glyph palette

### Choose glyphs

Outside edit mode, left-click a glyph tile to make it primary and right-click to make it secondary. The small **1** and **2** slots show the current choices. A space is represented by `␣` in the palette so you can distinguish its tile from an empty-looking button; drawing it places a real space, not the visible `␣` symbol.

The primary glyph supplies left-button Pencil/Flood fill and Glyph-mode shape outlines. The secondary supplies those operations with the right button. Shape fill is independently controlled by **Fill → Primary/Secondary**. The two slots can contain the same glyph.

### Edit, add, remove, and reset

1. Choose **Edit**. The button changes to **Done** and palette clicks become edit operations.
2. Click an entry to change its glyph or colour in the palette dialog. Use one Unicode code point. Renaming a glyph replaces its occurrences in the current field as well as its palette entry.
3. Choose the **+** tile to add an entry. Duplicate glyph entries are not allowed.
4. Use **Remove** in the dialog or right-click an entry in edit mode to remove that palette entry.
5. Choose **Done** to restore normal primary/secondary selection.

Only an unused, non-space glyph can be removed. If the glyph occurs on the field, the editor asks you to replace or erase it first. Removal does not act as an erase-all command. **The ordinary space glyph is always reserved and cannot be removed or renamed**, even when the current field contains no spaces; the editor needs it for erasing, padding, and blank cells.

**Reset**, visible in edit mode, gives priority to space and every glyph already used on the field. It restores those glyphs' default colours and adds built-in palette entries into the remaining capacity. It does not clear the field or remove used custom characters. The primary slot prefers `#` and the secondary prefers `+`; if a full palette has no room for those defaults, the slots fall back to available entries. The built-in default palette includes:

| Glyphs | Default colour |
| --- | --- |
| `#`, `+` | `#9ed9e0` |
| `.`, `~`, `>`, `^` | `#c0a8e6` |
| `*` | `#7fd4d4` |
| `X`, `@`, `x` | `#a8e6a3` |
| `O`, `o` | `#b8a6f5` |
| `=`, `-` | `#e6a8d7` |
| `\|`, `<` | `#f6b5c4` |
| Space | Displayed using the field background rather than its palette colour. |

Glyphs without a built-in default normally use white (`#ffffff`) until you choose another colour.

### Palette tile contrast

The contrast toggle beside the palette controls changes tile backgrounds for easier inspection. Neutral mode chooses black or white behind non-whitespace glyphs. Inverted mode uses the inverse of the glyph's colour. This changes palette tiles, not the field background or exported artwork.

Palette preferences are stored locally when browser storage is available. Edits to palette entries, colours, labels, or colourways affect the document, mark it unsaved, and are undoable. Merely choosing primary/secondary slots changes the drawing choices without adding an undo step. Export a palette file if you want a portable copy rather than depending on that browser's preferences.

## Glyph Colour Manager

Open **Colours…** beside the palette or **File → Glyph Colour Manager…**. The manager presents all non-whitespace palette entries. Whitespace is omitted because its appearance follows the field background.

### Rows and editing

| Column/action | Meaning |
| --- | --- |
| **Glyph** | The character. Changing it here replaces that glyph throughout the palette and canvas. |
| **Colour** | Colour-picker input for that glyph. |
| **Hex** | Six-digit `#RRGGBB` colour; short `#RGB` values are not accepted. |
| **Uses** | Number of occurrences of that glyph in the current field. |
| **Represents** | Optional descriptive label, up to 80 characters. |
| **Reset** | Restores the glyph's built-in default colour, or white for a glyph without a built-in default. |
| **Remove** | Removes an unused, non-space palette entry, subject to the palette's minimum-entry rules. Entries still used on the canvas must first be replaced or erased. Reserved space cannot be removed or renamed. |

A replacement glyph must be non-whitespace and must not already be another palette entry. Press Enter or leave the field to commit a valid edit. Invalid glyphs/hex values remain marked for correction. Colours apply to every occurrence of the affected glyph.

**Represents** is metadata for your own vocabulary, such as `water`, `wall`, or `highlight`. It does not change what the editor paints or create automatic drawing rules.

### Search and sorting

Search matches the glyph, its hex colour, or its Represents label. Search is case-insensitive. The sort selector offers:

| Sort | Ordering |
| --- | --- |
| Palette order | The palette's stored order. |
| Glyph | Character ordering. |
| Colour | Hex-value ordering. |
| Usage | Most-used glyphs first. |
| Represents | Label ordering. |

Sorting changes the displayed rows; it does not rearrange the field. A filter that shows zero rows does not mean the palette is empty—clear the search to see everything.

### Colourways and bulk actions

The **Colourway** menu contains **Pastel**, **Neon**, **Ocean**, **Forest**, **Monochrome**, and **High contrast**. Applying one assigns its colour sequence to non-whitespace palette entries in palette order, cycling when there are more glyphs than colours.

Colourway assignment is based on order, not on Represents labels or inferred meaning. **Pastel** applies a sequence to the current palette; it is not the same operation as restoring every glyph's original default mapping.

- **Add glyph** opens the palette-entry dialog.
- **Reset all colours** restores default colours after confirmation; it retains glyphs and labels.
- **Revert changes** restores the document and palette captured when the manager opened, including glyph replacements and background changes. Use it before closing when you want to undo that session's edits.
- **Close** or **×** closes the manager and keeps applied changes.

### Palette import and export

In the manager's **File** menu:

- **Export palette…** downloads `glyphpoint-palette.json` with the palette, primary/secondary glyphs, and field background.
- **Import palette or project…** reads compatible palette data from a GlyphPoint palette file or project. It changes the palette/background; it does not load the project's canvas as a new document.

Save your project or export your current palette before replacing a colour scheme you want to keep. Use the main **Open GlyphPoint project…** command when your intent is to load artwork.

## Saving, opening, and history

### Save projects deliberately

Choose **File → Save project**. The browser downloads `glyphpoint-project.json`. Rename it to an identifiable name or retain dated versions, for example `harbour-2026-11-03.glyphpoint.json`.

Save is a browser download. It does not provide an editor-controlled Save As path, silently overwrite the file you opened, or guarantee that the browser's download completed. Check the download list and the actual file. Repeated saves may have numbered filenames depending on browser settings.

Open the saved JSON using **Open GlyphPoint project…**. A project restores its stored cell data, dimensions, palette, primary/secondary glyphs, background, and square-cell setting. View zoom, interface layout, selection, clipboard, and undo history are not part of the saved artwork.

### New, open, and imports

**New** creates a blank default-size field. The existing palette is still useful for another drawing. Open/import commands replace the current field; save your existing project first if you need a durable copy.

The editor asks before replacing a document it considers dirty and registers an unsaved-changes warning for page exit. Browsers control whether and how an exit warning appears. These warnings do not save a project for you. Invalid or oversized imported files are rejected before changing the current document.

Plain-text and ordinary HTML imports introduce character grids, which use the current glyph-colour system. A project import carries substantially more editing information than a text import. Read the format section before relying on an import/export round trip.

Opening project JSON starts from the saved state without an unsaved marker. Text and HTML imports are marked as unsaved projects, including a native HTML round trip: choose **Save project** to retain a JSON editing copy.

### Undo and redo

Use the title-bar arrows or **Ctrl+Z** / **Ctrl+Y**. Undo restores a prior document-edit snapshot; redo reapplies an undone edit until a new edit creates a new history path.

History is bounded to **60 snapshots** and a combined undo/redo budget of **262,144 retained cells**; a larger field therefore retains fewer steps. It exists only in the current page. It is a convenience for editing, not a versioned backup. It is not written into project files and cannot recover a drawing after the page is closed or reloaded. Save before major crops, resizes, palette changes, and transformations when you want a durable recovery point.

## File formats and exports

### Format comparison

| Format/action | Characters and grid | Colour/styling | Best use |
| --- | --- | --- | --- |
| Project JSON | Full editable field and cell data | Palette, background, text styles, square-cell setting | Primary editable original. |
| Palette JSON | Palette entries only; no field | Glyph colours, labels, selected glyphs, field background | Reusable colour/glyph vocabulary. |
| Plain text | Characters and line breaks | None | Text exchange and ASCII/Unicode workflows. |
| Standalone HTML | Browser-viewable artwork | Exported visual styling | Sharing a viewable result. |

### Project JSON

The current writer uses the format identifier **`glyphpoint-v2`**. The reader also recognises legacy **`glyphpoint-v1`** projects. A project has dimensions, a flat cell array in row-major order, and document settings. A palette-only file is not a complete project even though it uses a compatible format identifier.

Use the editor's commands to produce valid files. Hand-editing a project is a development workflow: dimensions, cell count, glyph representation, and palette rules must remain consistent. See the development reference rather than treating arbitrary JSON as a project.

### Plain text

**Export plain text…** writes `glyphpoint.txt`. Every field row is included, including its spaces, and the export ends with a newline. Colours, font choices, styles, cell proportions, and labels are absent.

**Open plain text…** uses line breaks for rows and the longest row's code-point count for the width. Shorter rows are padded with spaces. Windows CRLF and lone CR line endings are normalised to LF, and a leading Unicode byte-order mark is removed. Tabs expand to **four-column tab stops** rather than becoming a tab-shaped grid cell.

The importer removes **one final newline** as the file's line terminator and preserves any additional blank rows. This matches the editor's text export, which writes one terminating newline. Empty input or a single newline is rejected as empty text. Otherwise, a field with no printable characters is assigned a minimum width of one cell. Project JSON is the more explicit way to preserve a completely blank field's dimensions.

View text in a monospaced font and preserve whitespace. Word wrapping in another text editor can make the drawing look broken without changing the file. Unicode symbols may occupy different display widths in terminals or other applications.

### Standalone HTML

**Export standalone HTML…** writes `glyphpoint-export.html`. The recipient opens it as a normal local web page. The export includes the field's characters, colours, cell fonts/styles, background, and square-cell proportions. It is a view of the artwork, not a copy of the interactive editor, and it does not contain undo history or a working drawing toolbar.

Native exports also contain inert embedded project data. When opened through GlyphPoint's HTML import, an intact native export restores that project state rather than inferring it from visual HTML. This is not executable application code. The embedded data is authoritative: manually changing the visible `pre` artwork without updating or removing the embedded project data does not change what GlyphPoint reimports. Keep the JSON project as the simplest editable original and portable development input.

Keep the JSON project alongside the HTML export if you will edit the drawing again. Another viewer's installed fonts can change the appearance even when the exported characters and CSS are identical.

### Opening HTML artwork

**Open coloured HTML…** first recognises native GlyphPoint export data. For other HTML, it looks for an element with `id="art"`, or otherwise a `pre` element, rather than converting an arbitrary web page into glyph art. Text within that artwork element supplies the character grid, with supported inline foreground colour and font/style information. Scripts, images, arbitrary page layout, and external stylesheets are not converted into drawing instructions.

The import reads a limited set of inline styles; it is not a browser screenshot or an image-to-ASCII converter. Styles that depend on external CSS, complex selectors, layout effects, or unsupported colour syntax can fall back to the editor's supported representation.

| Foreign HTML feature | Supported interpretation |
| --- | --- |
| Foreground colour | Inline `#RRGGBB`, `#RGB`, or integer `rgb(r, g, b)` values. |
| Font | Cascadia Mono, Cascadia Code, Consolas, Courier New, DejaVu Sans Mono, or monospace; unsupported families fall back to Cascadia Mono. |
| Bold/italic/underline | Supported inline style values and `b`/`strong`, `i`/`em`, or `u` elements. |
| Line breaks | Newlines in text and `br` elements. |
| Background | Supported inline `background-color` on the artwork element; otherwise black. |
| Repeated glyph colours | First recognised colour per glyph, with conflicts reported. |

External HTML imports use ordinary character-cell proportions. The native embedded project data is what preserves Square pixels and the full palette metadata.

Imported artwork is constrained by GlyphPoint's one-colour-per-glyph model. If foreign HTML assigns several foreground colours to occurrences of the same glyph, the first colour encountered for that glyph is used and the import reports the conflict. It cannot preserve that foreign per-occurrence colour distinction. Native project data is the authoritative way to preserve editable GlyphPoint state.

### Downloads and portability

The browser controls where downloads go and whether a save dialog appears. The editor uses predictable default filenames so you can recognise the file type; rename them for your own project organisation.

Project and palette files are portable files. Browser-stored preferences are not automatically copied with them or synchronised to another computer. Open a project or import a palette explicitly in the destination browser.

## View, navigation, and printing

| Control | Effect |
| --- | --- |
| View **+** / **−** | Doubles or halves the current zoom, within the allowed range. |
| **1:1** | Resets artwork zoom to 100%. |
| Status-bar **+** / **−** | Adjusts zoom in 25-percentage-point steps. |
| Zoom slider | Selects a zoom between 25% and 800%, in 25-point steps. |
| **Grid** | Shows or hides cell boundary guides. |
| **Rulers** | Shows or hides cell-coordinate rulers, labelled in five-cell intervals. |
| **Status** | Shows or hides the status bar. |
| **Square pixels** | Toggles the field's cell proportions between normal character cells and square cells. |
| Full-screen icon | Requests browser full-screen mode when supported; exit using the browser's normal full-screen escape action. |
| **Background** | Changes the shared field background. |

Zoom magnifies the field's presentation without adding cells or changing saved character data. Browser page zoom is separate and can also change the size of toolbars and dialogs. The square-cell setting changes the artwork's aspect ratio, so it is stored in projects.

Scroll the field inside its viewport to reach distant cells. The coordinate/status display helps identify positions precisely. If a small screen hides controls, scroll the appropriate ribbon/sidebar instead of trying to scroll the entire page.

**File → Print…** uses a print stylesheet that hides the editor controls. The browser determines paper size, scaling, margins, pagination, background printing, and PDF destinations. Inspect the print preview, especially for large fields. If colours or a dark background are missing, check the browser's background-graphics print option.

## Keyboard and mouse reference

Use application shortcuts while working on the canvas. When focus is in an input or text area, normal text-entry behavior takes precedence. On platforms that use Command, the application also recognises the Meta/Command modifier; browser-level shortcuts may still be reserved by the browser or operating system.

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` | New document. |
| `Ctrl+S` | Save project download. |
| `Ctrl+P` | Browser print dialog. |
| `Ctrl+Z` | Undo. |
| `Ctrl+Y` or `Ctrl+Shift+Z` | Redo. |
| `Ctrl+C` | Copy selection. |
| `Ctrl+X` | Cut selection. |
| `Ctrl+V` | Paste. |
| `Delete` | Clear the current selection. |
| `+` or `=` | Increase artwork zoom by 25 percentage points. |
| `-` | Decrease artwork zoom by 25 percentage points. |
| `Shift` during a shape drag | Constrain the shape/line to 1:1 cell-space bounds. |
| `Enter` in supported palette/manager fields | Commit that field's edit. |
| `Escape` outside a dialog | Close menus/colour picker, cancel an in-progress preview, and clear the selection. |
| `Escape` in a native dialog | Close that dialog through the browser's dialog behavior. |

Use the **All** button for Select All; do not assume the browser's `Ctrl+A` is a GlyphPoint selection shortcut. The editor does not provide letter-key shortcuts for individual drawing tools.

| Mouse action | Effect |
| --- | --- |
| Left-click palette tile outside edit mode | Set primary glyph. |
| Right-click palette tile outside edit mode | Set secondary glyph. |
| Left/right Pencil, Flood fill, or Glyph-mode shape outline | Use primary/secondary glyph. |
| Left/right Glyph picker | Set primary/secondary from the clicked cell. |
| Click/drag Eraser | Write blank cells using the brush footprint. |
| Drag with a shape selected | Commit the chosen shape on release. |
| Drag outside an existing selection | Create a new selection. |
| Drag inside an existing selection | Move selected content. |
| Right-click palette tile in Edit mode | Remove the entry. |

## Practical workflows

### Create an outlined object with a different fill glyph

Choose a primary outline glyph and right-click another tile for the secondary. Select Rectangle, Ellipse, or another closed shape. Set **Stroke → Glyph**, **Fill → Secondary**, and Width `1`, then drag. Change the two glyph colours afterward in the manager to recolour the whole object consistently.

### Stamp a motif over existing artwork

Select the motif and copy it. Enable **Ignore blanks**. Make a small selection at the destination and paste. The motif's ordinary spaces are skipped, leaving existing destination cells visible. Disable Ignore blanks when you want the motif's empty area to clear whatever was there.

### Add room without stretching the drawing

Open Properties and increase Width or Height. This adds blank cells to the right or bottom while preserving the existing cell positions. To move the artwork into a larger margin, select it afterward and drag it to the desired location. Use Resize only when you intend to resample its contents.

### Recolour a whole drawing

Save a project first. Open the Colour Manager and try a Colourway. Fine-tune the most-used glyphs using **Sort → Usage**. Add Represents labels to make the intended role of each glyph easier to remember. Export the palette if you want to reuse that vocabulary in another document.

### Make a reusable symbol sheet

Create a moderate-size field, draw several motifs with clear spaces between them, and save the project as a master. Copy/paste selected regions within a session. Keep the master project file: the internal clipboard disappears when the page is reloaded.

### Review a saved result

Save JSON and export HTML. Reopen the JSON in GlyphPoint to check editable state, then open the HTML in another tab to check the viewable result. Verify dimensions, row ends, repeated glyphs, whitespace, colours, and styled text. Keep the JSON even if you distribute only the HTML.

## Limits and compatibility

GlyphPoint is a desktop-oriented application. Its interface uses mouse buttons, hover tooltips, and dense controls; a phone or touch device may not provide equivalent access to every operation.

| Area | Practical boundary |
| --- | --- |
| Field dimensions | Whole values from `1` to `512` on each axis, with at most **65,536 cells** in total. Both constraints must hold. |
| Import file size | At most **16 MiB** per imported project, palette, text, or HTML file. |
| Palette | At most **4,096 entries including reserved space**, allowing at most **4,095 other glyph code points**. Space cannot be removed or renamed even when unused. |
| Colour model | One foreground colour per glyph and one shared field background. |
| Glyph model | One Unicode code point per cell; multi-code-point grapheme clusters are not one-cell objects. |
| Text scale | Only `1×`, `2×`, and `3×` cell repetition. |
| Brush size | Whole values `1`–`60`; ratio tips can be longer than 60 cells on their long axis. |
| Shape width | Values `1`–`8`. |
| Zoom | 25%–800%, quantised in 25-point increments. |
| Labels | Represents labels have an 80-character limit. |
| Undo/redo storage | At most 60 snapshots and a total retained-cell budget of 262,144; the number of available steps depends on field size. |
| Storage | Palette/UI preferences only; no autosaved canvas or persistent undo history. |
| Clipboard | External access depends on browser permissions; internal copy is session-local. |
| Fonts | Installed-font fallback can change appearance and character coverage. |
| Documents | Each field cell is represented in the page; larger fields require more rendering and history memory. |

Some characters, including wide CJK glyphs, combining marks, and emoji sequences, do not fit the single-cell model cleanly. Unsupported font glyphs may appear as boxes. Zooming does not add font coverage, and choosing Square pixels does not turn a multi-code-point sequence into one character.

For example, `256 × 256` and `512 × 128` fields each contain 65,536 cells and fit the area budget. A `512 × 512` field exceeds that budget even though each individual dimension is within the axis limit. Invalid dimensions, excess cell counts, malformed cell data, and oversized files are rejected rather than silently truncating the drawing. These limits bound memory use; they do not guarantee identical response times on every computer.

There is no promise that an imported foreign HTML file will preserve arbitrary CSS, mixed per-character colour instances, images, or script-generated content. For editing fidelity, use GlyphPoint JSON. Large resizes and broad fills affect many DOM cells and may take longer than small edits; save before a large operation and let it finish before initiating another.

## Troubleshooting

| Symptom | Likely cause and next step |
| --- | --- |
| The browser shows source code or a repository page | Open the downloaded `.html` application file, not GitHub's source viewer. |
| The palette opens an edit dialog instead of choosing a drawing glyph | Palette Edit mode is active. Choose **Done**. |
| Drawing uses an unexpected character | Check the primary/secondary slots and which mouse button you are using. Glyph-mode shape outlines also follow the mouse button; fill has its own Primary/Secondary choice. |
| A palette entry will not remove | Space is permanently reserved. For another glyph, replace or erase its field occurrences first; minimum-entry rules also apply. |
| Changing one glyph's colour recolours distant parts | This is the document-wide glyph-colour model. Use a different glyph when you need an independently coloured category. |
| Spaces erase content during paste | Enable **Ignore blanks**. It skips ordinary spaces in pasted content. |
| Pasted content appears at the upper left | There was no active destination selection, so the anchor was `(0, 0)`. |
| Pasted content is an older copied motif | GlyphPoint has an internal clipboard. It is preferred over external clipboard text while an internal copy exists. |
| External copy/paste fails | Check browser clipboard permissions or try the localhost launch method. Use JSON/text files for reliable interchange. |
| Moving or rotating loses an edge of a motif | The result crossed the field boundary and was clipped. Undo, enlarge the field or leave a margin, then repeat. |
| A reflected arrow still points the same way | Transforms move cells; they do not substitute `>` with `<` or rotate the glyph outlines. |
| A circle or square looks stretched | Normal character cells are not square. Try **Square pixels**. |
| Text at 2× looks repeated | Scale repeats each glyph into a 2×2 block. Use 1× for ordinary text. |
| Flood fill escapes a shape | The outline has a connected gap in the target glyph region. Undo and close the gap, or use a shape's Fill option. |
| Glyphs seem invisible | Check their foreground colour against the shared background; whitespace intentionally uses the background colour. |
| A character appears as a box or is clipped | The chosen font lacks it or the glyph does not fit the cell model. Try a suitable installed font or another glyph. |
| Plain-text export looks different elsewhere | Text has no colours/styles and the viewer may wrap lines or use a proportional font. Use a monospaced font, disable wrapping, or share HTML instead. |
| Opening text changes a final newline | One trailing line terminator is removed; additional blank rows are retained. Use JSON if another program trims whitespace or changes line endings. |
| A resize or import is rejected | Check the 512-cell axis limit, 65,536-cell area budget, 16 MiB file limit, and project structure. The current document should remain intact. |
| Saved files cannot be found | Inspect the browser's downloads. Repeated saves may use numbered names or a different download location. |
| A palette JSON file will not open as a project | It contains a palette without a canvas. Use the Colour Manager's **Import palette or project…** instead. |
| Preferences disappear in another browser or after storage is cleared | Preferences are local to that browser context. Import a palette or open a saved project. |
| Reload lost unsaved artwork | The page had no saved project to restore. Open the latest JSON download; palette preferences cannot reconstruct the field. |
| Printing hides colours/background | Enable background graphics in the browser's print settings and inspect its preview. |

### Reporting a problem

Include the maintained HTML filename, the repository commit if known, browser/version, operating system, interface mode, field dimensions, and steps from a fresh document. State what happened and what you expected. Attach a minimal project or text file only when it is safe to share its contents.

For a save/export problem, retain both the input project and the generated output. For a drawing problem, record the selected tool, glyphs, size/width, tip, stroke/fill options, selection type, and whether Ignore blanks or Square pixels was enabled. This gives a future fix a reproducible starting point.
