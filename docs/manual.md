# GlyphPoint instruction manual

This manual describes the maintained **`GlyphPoint-RC.html`** editor. It is a single-file application for editing coloured Unicode grids with a mouse, keyboard, or touch pointer. It includes automatic local recovery, individual cell colours, an embedded font, and editable/project and image exports. The earlier `GlyphPoint-v1a.html` and `GlyphPoint-v04a.html` files are historical versions and may behave differently.

Start with the [new-user guide](new-user-guide.md) if you want a short worked exercise. This manual is the reference for the available controls and their interactions. Implementation details live in the [maintained application source](../GlyphPoint-RC.html); UI labels in this manual correspond to that file. The [repository overview](../readme.md) provides the documentation index. For development, follow [AGENTS.md](../AGENTS.md), the [agent/RAG reference](../RAG.md), and the [project format reference](project-format.md).

## Contents

- [Opening the editor](#opening-the-editor) — Run the local HTML file, with an optional localhost server.
- [How a GlyphPoint document works](#how-a-glyphpoint-document-works) — Understand grapheme cells, inherited and individual colours, fonts, coordinates, and persistence.
- [Cell and brush colours](#cell-and-brush-colours) — Override a cell's colours, colour a selection, and set the next strokes.
- [Finding the controls](#finding-the-controls) — Navigate the ribbon, classic sidebar, File menu, and dialogs.
- [Drawing tools](#drawing-tools) — Use Pencil, Flood fill, Eraser, Glyph picker, and Magnifier.
- [Brush size and tips](#brush-size-and-tips) — Choose a square, circular, or ratio-based footprint.
- [Shapes](#shapes) — Draw outlines, filled shapes, lines, and arrows.
- [Placing text](#placing-text) — Enter multiline text with font, style, and repetition controls.
- [Selections and the clipboard](#selections-and-the-clipboard) — Select, move, copy, cut, paste, clear, crop, and choose what happens at field edges.
- [Rotation and reflection](#rotation-and-reflection) — Transform the whole field or a selection.
- [Resize, skew, and properties](#resize-skew-and-properties) — Distinguish scaling from changing the field boundary.
- [The glyph palette](#the-glyph-palette) — Choose primary/secondary glyphs and maintain palette entries.
- [Glyph Colour Manager](#glyph-colour-manager) — Manage colours, labels, replacements, colourways, and palette files.
- [Saving, opening, and history](#saving-opening-and-history) — Save to a chosen file, recover automatic checkpoints, download portable copies, and use undo.
- [File formats and exports](#file-formats-and-exports) — Compare JSON projects, palette JSON, text, and standalone HTML.
- [View, navigation, and printing](#view-navigation-and-printing) — Adjust zoom, cell proportions, rulers, and print output.
- [Keyboard and mouse reference](#keyboard-and-mouse-reference) — Edit cells without a mouse, use pointer controls, and navigate with touch.
- [Practical workflows](#practical-workflows) — Apply the controls to common drawing and editing tasks.
- [Limits and compatibility](#limits-and-compatibility) — Understand Unicode, fonts, browser capabilities, and performance boundaries.
- [Troubleshooting](#troubleshooting) — Diagnose common symptoms and collect useful bug reports.

## Opening the editor

Download the repository ZIP and extract it, or download the raw `GlyphPoint-RC.html` file from GitHub. Open that file in a desktop browser. A GitHub source-code page is a file viewer, not the running editor.

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

Open `http://127.0.0.1:8000/GlyphPoint-RC.html`. A local server provides a consistent origin for browser storage and can help with clipboard permissions. Recovery data stays in the browser; the Python server does not receive or save your artwork. Stop it with `Ctrl+C` in the terminal.

Use the maintained filename and launch address consistently. Recovery and preferences belong to the browser's storage context: a downloaded `file:` copy, a different localhost port, another browser/profile, and a private-browsing window may not share them. The recovery status reports when storage is unavailable. Use saved JSON files to transfer projects between contexts.

## How a GlyphPoint document works

### Cells and coordinates

The default field is **80 columns × 80 rows**. Coordinates start at **0, 0** in the top-left cell. The horizontal coordinate increases to the right, and the vertical coordinate increases downward. The status bar shows pointer coordinates and the total field dimensions. Keyboard and assistive descriptions announce row and column numbers starting at **1**, so the top-left cell is announced as row 1, column 1.

A cell contains:

| Component | User-facing meaning |
| --- | --- |
| Glyph | One printable Unicode grapheme: a letter, symbol, combining sequence such as `é`, or supported emoji sequence such as `👨‍👩‍👧‍👦`. A space is an empty-looking cell. |
| Font | The preferred font family for that cell. |
| Bold, italic, underline | Text-style flags, primarily set with the Text tool. |
| Foreground | An individual colour, or inheritance from the glyph's palette entry. |
| Background | An individual colour, or inheritance from the document's field background. |

Palette colours are defaults. If `#` is green and its cells inherit their foreground, changing that palette entry recolours those cells together. A `#` with a custom red foreground remains red. Individual overrides let identical glyphs have different colours without adding duplicate palette entries. Labels in the Colour Manager describe glyphs and do not change their identity.

The **field background** is the default behind cells. A custom cell background overrides it, including on a space cell. New project files preserve both foreground and background overrides. Older v1/v2 projects are migrated to their original palette-based appearance; old ignored colour metadata does not suddenly recolour them.

### Characters are not bitmap pixels

Normal cells use a font-character width and a font-line height. **Square pixels** changes their display proportions to square cells; it does not convert the document to a raster image. Font shapes remain characters.

Text size controls repeat characters into cells. Rotation and reflection move cells; they do not rotate the outline of each glyph. For example, moving a `>` through a horizontal reflection does not automatically turn it into `<`.

One extended grapheme occupies one cell, with a maximum of **32 Unicode code points** in that cluster. Text and palette inputs use the same segmentation. Combining marks and joined emoji remain together, and overlong or invalid clusters are rejected without truncation. GlyphPoint does not normalise canonically equivalent text: `é` and `e` followed by a combining accent can remain distinct palette entries.

New cells use **DejaVu Sans Mono**, whose regular, bold, oblique, and bold-oblique faces are included in the editor. The renderer fits a glyph's drawing inside its cell. The font cannot cover every writing system or emoji; missing characters use browser fallback and can still differ across devices. The other font choices use locally available fonts. **Cell colours → Use embedded font for selection / field** converts the selection, or the whole field when nothing is selected, to the bundled family. Export **PNG** when the recipient must see the same rendered pixels.

### What is saved where

| Item | Where it is kept |
| --- | --- |
| Current artwork | In the running page, with automatic recovery checkpoints when browser storage is available. |
| Recovery checkpoint | The latest snapshot for that tab/document in this browser's IndexedDB archive. It is local and separate from your project files. |
| Saved project | A JSON file written through a supported file picker, or requested as a browser download. |
| Undo/redo history | In the current page session; it is not written into project files. |
| Palette preferences and selected glyphs | Browser storage, when available, plus copies in saved projects/palettes. |
| Ribbon/classic layout preference | Browser storage, when available. |
| Text, HTML, or PNG export | A separate downloaded file. |

After reload, use **Recovery** to choose a checkpoint; the editor does not silently replace your new canvas. The archive is bounded and browsers can clear or deny it. Keep project files for portable, durable copies. Undo history, the internal clipboard, and brush preferences do not survive a reload as part of a project.

## Cell and brush colours

Choose **Cell colours** in the workflow controls or **File → Cell colours…**. The dialog has independent Foreground and Background modes:

| Mode | Result |
| --- | --- |
| **Inherit glyph palette** | The cell follows its glyph's palette colour. |
| **Custom cell colour** | The chosen foreground belongs to that cell. |
| **Inherit field background** | The cell follows the document background. |
| **Custom cell background** | The chosen background belongs to that cell, including when the glyph is a space. |

Choose **Apply to cells** to update the selected cells, or the focused cell if there is no selection. The dialog identifies its target. The same choices also become your next brush colours. Choose **Use for next strokes** to update the brush colours without changing existing cells. Pencil, shape strokes/fills, Flood fill, and placed text use these choices; Eraser clears them and writes ordinary blank cells.

To return coloured cells to a coordinated palette scheme, select them, choose both inheritance modes, and choose **Apply to cells**. Changing a palette colour or a Colourway then affects those cells again. Copy, move, rotation, resize, project saves, recovery, and native HTML round trips carry individual colours with the cells.

## Finding the controls

### Ribbon and classic sidebar

The title-bar mode button switches between a ribbon across the top and a classic sidebar on the left. Its label names the destination: **Classic** switches to the sidebar; **Ribbon** switches back.

Both layouts use the same document, tools, palette, and undo history. In a small window, scroll the ribbon horizontally to reach controls, or scroll the classic sidebar vertically. Use the canvas's own scroll area to navigate artwork larger than the visible workspace.

Most drawing controls are icon buttons with accessible names and hover titles. A highlighted tool button indicates the current tool. The title bar also contains **Undo**, **Redo**, and the document name. An asterisk indicates edits not confirmed written to a project file. Recovery checkpoints do not clear that marker, and a download request cannot confirm completion, so it also leaves the marker in place.

### File menu

| Command | Result |
| --- | --- |
| **New** | Creates a blank default-size document. Save the current project first if you need it. |
| **Open GlyphPoint project…** | Reads an editable GlyphPoint JSON project. |
| **Open plain text…** | Imports characters and line breaks as a field. |
| **Open coloured HTML…** | Imports artwork from a supported HTML `pre` element; see the format details below. |
| **Save project** | Uses the supported file picker once, then saves to that chosen file for the current document. Falls back to a browser download when direct saving is unavailable. |
| **Save project as…** | Chooses another destination through the native file picker; disabled when that API is unavailable. |
| **Download project JSON…** | Requests an explicit downloadable editing copy in every supported browser. |
| **Recovery checkpoints…** | Lists local automatic checkpoints with Recover and Delete controls. |
| **Export PNG image…** | Downloads a full-field raster image of the current rendered appearance. |
| **Readable text / copy all…** | Opens every row in a selectable text area, with copy and text-export controls. |
| **Cell colours…** | Sets individual foreground/background colours or inheritance. |
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

Pencil replaces the cells it touches using the current brush colours and embedded drawing font, and clears previous bold, italic, or underline styling. The path between successive pointer positions is filled, so a quick drag still draws connected cells. **Use secondary glyph** supplies the secondary drawing choice without requiring a right mouse button.

### Flood fill

Choose **Flood fill**, then click the target region. It replaces the connected region whose cells have the same glyph and stored foreground/background settings as the clicked cell. Adjacency is horizontal and vertical; diagonally touching cells alone do not connect a region. Colour overrides can form boundaries even when adjacent cells share a glyph.

Font, bold, italic, and underline do not define the matching region. An inherited colour and an explicit equal-looking colour remain different stored settings. Left-click fills with the primary glyph; right-click or the secondary toggle fills with the secondary. Brush size and tip do not limit flood fill. A continuous outline can contain a fill, but a gap allows matching regions on either side to connect.

Fill runs as a background job with progress and **Cancel operation**. A cancelled job leaves the document unchanged. Successful completion creates one undoable edit. On browsers that cannot run a worker, the calculation yields between batches to keep the controls responsive.

### Eraser

Choose **Eraser** and click or drag. Erasing writes normal spaces, removes colour/style overrides, and reveals the field background. It uses the current brush size and tip. There are no layers underneath the erased cells.

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

**Lines** means character-based line rendering, not vector paths. Box-drawing corners and junctions are characters and use the palette defaults or current brush-colour overrides. Their appearance depends on the font.

### Shift constraint

Hold **Shift** while dragging to constrain the shape's cell-space bounds to equal width and height. For a line, this produces a 1:1 diagonal constraint; it is not a horizontal/vertical snapping system. A 1:1 cell-space shape can still look stretched when the cells themselves are not square.

## Placing text

Choose **Text**, then click the starting cell, or focus the field and press **Enter**. Enter one or more lines in the dialog and choose **Place text**. The chosen cell is the top-left anchor. Newlines advance to another text row; long lines do not wrap automatically. **Edges → Expand to fit** is the default, so the field grows to preserve the complete placement within the document limits. Reject and Clip are explicit alternatives.

| Control | Meaning |
| --- | --- |
| Text area | The graphemes to insert. Newlines create additional rows; tabs use four-cell stops. |
| **Font** | Embedded DejaVu Sans Mono is the default; Cascadia Mono, Consolas, Courier New, and generic monospace use installed/browser fonts. |
| **Scale** | `1×`, `2×`, or `3×`; each grapheme is repeated into a square block of that many cells per side. |
| **Bold**, **Italic**, **Underline** | Style flags applied to the inserted cells. |
| **Background → Transparent** | Skips spaces in the text, preserving existing destination cells under those spaces. |
| **Background → Opaque** | Places spaces too and gives the inserted cells the chosen custom brush background, or the current field background as an explicit cell colour. |

Scale `2×` repeats `A` into four `A` cells. It does not draw a larger outline of the letter. Choose `1×` for ordinary readable captions.

With brush foreground set to inheritance, characters use their own palette colours. Choosing `#` as the primary glyph does not give every letter its colour. Set a custom brush foreground in **Cell colours** to make a whole caption one colour, or use the Colour Manager to change the default for each letter. Newly introduced graphemes are added to the palette when capacity permits.

Transparent skips ordinary spaces and applies the current brush background choice to non-space glyphs. Opaque writes spaces too and explicitly records the chosen background. Both modes replace non-space destination cells. Neither mode changes the document's field background. To make placed text follow later field-background changes, select it and restore background inheritance in **Cell colours**.

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

The internal clipboard carries each cell's grapheme, foreground/background overrides, font, and style. Inherited colours continue to follow the destination document's palette/background. The external clipboard representation is plain text, so colour, font, and text-style information cannot travel through that representation.

The editor prefers its internal copied selection when one exists. If there is no internal copy, it tries to read text from the system clipboard. Browser permission or origin restrictions can prevent external clipboard access; a failed external copy does not necessarily prevent copying within GlyphPoint.

To paste at a specific location, make a small selection whose top-left corner is at that location, then paste. Keyboard users can move to the desired cell and use Shift+Arrow to establish that anchor. Pasting is immediate; it does not first create a floating preview. The Edges setting determines whether the field expands, the edit is rejected, or overflow is deliberately clipped.

### Choose field-edge behaviour

The workflow **Edges** selector applies to paste, selection moves, placed text, and selected transforms. It starts at **Expand to fit** for a new editor session.

| Setting | Result when the edit crosses an edge |
| --- | --- |
| **Expand to fit** | Grows the field to fit the placement, keeping existing cells. Expansion toward the left/top shifts existing coordinates to make room. If the enlarged field would exceed an axis or area limit, the edit is rejected intact. |
| **Reject overflow** | Leaves the document unchanged and explains why the proposed placement does not fit. |
| **Clip overflow** | Commits only the portion inside the field and reports discarded overflow. Undo restores the previous document. |

Ordinary brush and shape footprints remain clipped to the current drawing field; this prevents a wide brush at an edge from unexpectedly changing document dimensions. Resize/Skew has its own **Skew edges** control. Properties shrinking asks before discarding non-empty or styled cells.

### Ignore blanks

**Ignore blanks** controls whether ordinary space cells without a custom background are skipped when pasting or moving content onto another area:

- Checked: a space with inherited background does not overwrite a destination cell; a space with an explicit background is retained as painted content.
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

With no selection, a transform affects the entire field. A whole-field 90° rotation swaps its width and height. With a selection, the transform is applied at its top-left position. A non-square selection changes its bounding-box dimensions under a 90° rotation; the Edges setting controls any required field expansion.

A free-form transform uses its selected mask. Unselected cells inside the mask's bounding rectangle are not treated as source content. Destination cells reached by the transformed mask can be overwritten, while cells outside the operation remain unchanged.

Transforms preserve each cell's grapheme, individual colours, and text styling. They move characters without substituting directional glyphs: `┌`, `/`, `>`, and similar characters do not automatically change orientation. If your artwork depends on those character shapes, check and replace them afterward.

Use **Expand to fit** to keep the transformed selection, **Reject overflow** to require a fit without resizing, or **Clip overflow** when trimming is intended. **Ignore blanks** belongs to move/paste; it is not a general promise of transparent transforms.

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
| **Skew edges** | Expands to the transformed bounds, rejects overflow, or explicitly clips to the resized field. This is separate from the main Edges selector. |

Resize uses nearest-cell sampling. Increasing the size repeats source cells; decreasing it can omit fine details. It does not perform smooth image interpolation or reconstruct glyph outlines.

Skew is applied after resizing, first horizontally and then vertically. Each angle accepts finite values between **−89° and +89°**. The operation fills each destination cell by sampling backward into the source, which avoids the holes and competing writes caused by pushing source cells forward. Sampling still discretises a geometric shape: enlarging can repeat cells and reducing can lose detail.

**Expand to fit** preserves the transformed bounding rectangle and adds blanks around its slanted edges. The final dimensions can be larger than the resize values you entered. **Reject overflow** leaves the document unchanged when the shear would extend outside those values. **Clip to resized field** explicitly trims the result and reports it. Large angles can require a field beyond the 4,096-cell axis/1,048,576-cell area limits; those results are rejected before replacing the document.

Resize/Skew shows progress while its worker calculates. **Cancel operation** discards the candidate result. The editor disables drawing while the job runs and commits a completed result as one undoable edit. Worker-restricted browsers use the same calculation in yielding batches. Rendering and this computation no longer require a DOM element for every cell.

### Properties dialog

**Width** and **Height** change the field boundary while preserving cells at their original top-left coordinates. Shrinking asks for confirmation if it would remove non-empty or styled cells. **Field background** changes the document's default background. **Glyphs only** is the same preference as **Ignore blanks** in the Selection controls.

Changing the field background affects cells whose background is inherited. Explicit cell backgrounds remain unchanged. It does not change glyph-palette entries.

## The glyph palette

### Choose glyphs

Outside edit mode, left-click a glyph tile to make it primary and right-click to make it secondary. When **Use secondary glyph** is active, an ordinary click/tap chooses secondary instead; turn it off to choose primary again. Keyboard tiles accept Enter/Space for primary and Shift+Enter/Shift+Space for secondary. The small **1** and **2** slots show the current choices. A space is represented by `␣` in the palette so you can distinguish its tile from an empty-looking button; drawing it places a real space, not that visible symbol.

The primary glyph supplies left-button Pencil/Flood fill and Glyph-mode shape outlines. The secondary supplies those operations with the right button. Shape fill is independently controlled by **Fill → Primary/Secondary**. The two slots can contain the same glyph.

### Edit, add, remove, and reset

1. Choose **Edit**. The button changes to **Done** and palette clicks become edit operations.
2. Click an entry to change its glyph or colour in the palette dialog. Use one printable grapheme, up to 32 code points. Renaming a glyph replaces its occurrences in the current field as well as its palette entry; individual cell colours remain with their cells.
3. Choose the **+** tile to add an entry. Duplicate glyph entries are not allowed.
4. Use **Remove** in the dialog or right-click an entry in edit mode to remove that palette entry.
5. Choose **Done** to restore normal primary/secondary selection.

Only an unused, non-space glyph can be removed. If the glyph occurs on the field, the editor asks you to replace or erase it first. Removal does not act as an erase-all command. **The ordinary space glyph is always reserved and cannot be removed or renamed**, even when the current field contains no spaces; the editor needs it for erasing, padding, and blank cells. Custom colours do not remove this palette-membership requirement.

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

A replacement glyph must be one non-whitespace grapheme and must not already be another palette entry. Press Enter or leave the field to commit a valid edit. Invalid glyphs/hex values remain marked for correction. Palette colours apply to occurrences that inherit their foreground; cells with custom foregrounds keep them.

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

Colourway assignment is based on order, not on Represents labels or inferred meaning. **Pastel** applies a sequence to the current palette; it is not the same operation as restoring every glyph's original default mapping. Colourways and resets change palette defaults and leave individual cell overrides intact.

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

Choose **File → Save project**, or press **Ctrl+S** / **Command+S** outside a text field. The command checks browser capabilities and follows one of two paths:

| Available capability | First Save | Later Saves of the current document | Unsaved marker |
| --- | --- | --- | --- |
| Native file picker and writable file handle | Choose a filename and location. | Writes to the same chosen file; use **Save project as…** to choose another. | Clears only after the write closes successfully and no newer edit has occurred. |
| Download fallback | The browser requests a JSON download. | Requests another download; the browser controls naming and location. | Remains, because the editor cannot verify download completion. |

**Download project JSON…** always requests a portable download, even when direct saving is available. Use it to keep an extra copy. **Save project as…** is disabled when the browser does not expose the native picker. Cancelled or failed writes keep the unsaved marker and report what happened; they do not claim a successful save or silently switch to another destination.

An opened project is not automatically granted permission to overwrite its source file. The first direct Save asks you to choose a destination. The chosen file handle stays in memory for that document: opening another project, starting New, or reloading resets it. When saving during ongoing editing, only the captured revision is written; newer edits remain unsaved. After a successful Save As, the displayed filename follows the chosen destination even if newer edits still need saving.

Use identifiable names and keep versions before major changes, for example `harbour-2026-11-03.glyphpoint.json`. For download saves, check the browser's download list and actual file. Repeated requests may receive numbered filenames. Open the intended JSON through **Open GlyphPoint project…** and check its dimensions, colours, and text.

### Automatic recovery

Edits schedule a checkpoint in this browser's IndexedDB storage. The usual delay is **750 milliseconds after the latest edit**, with a **five-second maximum scheduling interval** during continuous editing. The status bar distinguishes Recovery pending, Saving recovery, Recovery saved, and Recovery unavailable. A successful checkpoint does not clear the unsaved-project marker: recovery and file saving serve different purposes.

The archive keeps the latest checkpoint for each tab/document session, up to **12 documents** and **32 MiB of stored payloads**, with a **16 MiB per-checkpoint limit**. Documents larger than 65,536 cells use lossless run-length encoding in recovery; detailed high-entropy artwork may still exceed that limit and produce a visible recovery error. Older entries are evicted as needed when a new checkpoint is successfully stored. This is a bounded recovery archive, not a sequence of every edit or an indefinite version history. Multiple tabs use separate identifiers, even when their displayed filenames match.

To restore a checkpoint:

1. Open the same editor address in the same browser/profile. A blank canvas may appear; prior work is not loaded automatically.
2. Choose **Recovery** or **File → Recovery checkpoints…**.
3. Compare the document names, dimensions, and timestamps, then choose **Recover** for the intended entry.
4. Confirm replacement if the current canvas has unsaved changes.
5. Check the restored artwork, then save a project file to retain a portable copy.

**Delete checkpoint** removes only that archive entry after confirmation. It does not delete a downloaded or directly saved project file. Deleting the current entry does not immediately recreate the deleted revision. Edits made after requesting deletion, including while deletion is still pending, remain eligible for a new checkpoint.

The editor attempts a final flush when the page becomes hidden or closes, but an abrupt process/device failure can stop an unfinished write. Wait for **Recovery saved** when you need the latest checkpoint. Storage denial, quota exhaustion, blocked database access, damaged records, or unsupported contexts produce an explicit recovery error; there is no silent canvas fallback to localStorage. A failed archive write does not evict previous checkpoints. Keep file copies when recovery is unavailable, before clearing browser/site data, and when moving to another device. Private windows and `file:` origins may have limited or isolated storage.

### New, open, and imports

**New** creates a blank default-size field. The existing palette remains available for another drawing. Open/import commands replace the current field; the current document's pending checkpoint is captured before switching to a new document identity.

The editor asks before replacing dirty work and registers a browser-controlled warning for page exit. A warning does not guarantee that a pending save has finished. Invalid, oversized, or unsupported imported files are rejected before replacing the document or adding a partial edit to history.

If the document changes while an asynchronous file or palette read is pending, that import is discarded; choose the file again to apply it to the current document. A delayed import cannot overwrite edits or a document restored in the meantime.

Opening project JSON starts from its saved state without an unsaved marker. Text and HTML imports are marked unsaved, including native HTML round trips. Recovered checkpoints are also marked unsaved so that you can intentionally save the restored state. Opening a project retains its saved palette and cell colours; plain text starts with the current palette and field background.

### Undo and redo

Use the title-bar arrows or **Ctrl+Z** / **Ctrl+Y**; **Ctrl+Shift+Z** also redoes. Command works as the modifier on platforms that use it. Undo restores a previous document-edit snapshot; redo reapplies an undone edit until a new edit starts another history path. Completed fill/resize jobs, colour applications, compound drawing gestures, and transforms are undoable document edits.

History is bounded to **60 snapshots** and a combined undo/redo budget of **2,097,152 retained cells**; larger fields retain fewer steps. History exists only in the current page and is not stored in JSON, HTML, or recovery checkpoints. Recovery restores artwork and settings, not the sequence of undo steps. Keep named project versions for durable milestones.

## File formats and exports

### Format comparison

| Format/action | Characters and grid | Colour/styling | Best use |
| --- | --- | --- | --- |
| Project JSON | Full editable field, graphemes, and cell data | Palette defaults, individual colours, backgrounds, text styles, square-cell setting | Primary editable original. |
| Palette JSON | Palette entries only; no field | Glyph defaults, labels, selected glyphs, field background | Reusable colour/glyph vocabulary. |
| Plain text | Graphemes and line breaks | None | Text exchange and ASCII/Unicode workflows. |
| Standalone HTML | Browser-viewable artwork plus embedded editable project data | Individual colours, supported cell styles, and the bundled font | Sharing a viewable and reimportable result. |
| PNG | Pixels for the complete field | Captures the rendered appearance, including font fallback | Sharing a fixed visual result without relying on the recipient's fonts. |

### Project JSON

The current writer uses **`glyphpoint-v3`**. The reader also accepts legacy **`glyphpoint-v1`** and **`glyphpoint-v2`** projects, migrating their palette-based rendering without treating old ignored cell colours as new overrides. New grapheme and individual-colour features require v3; historical editor snapshots do not implement them.

A project stores dimensions, a flat row-major cell array, glyph palette/labels, primary/secondary glyphs, field background, and square-cell setting. Zoom, layout preference, selection, clipboard, brush choices, and undo history are not part of the saved artwork. A palette-only file is not a complete project even though it uses a compatible format identifier.

Use the editor to produce valid files. Hand editing requires consistent dimensions, exact cell counts, valid graphemes, six-digit hex colours, and the reserved space palette entry. See the [project format reference](project-format.md) for the schema, migration rules, and data budgets.

### Plain text

**Export plain text…** writes `glyphpoint.txt`. Every field row is included, including spaces, and the file ends with one newline. Colours, fonts, styles, cell proportions, and labels are absent. **Readable text / copy all…** exposes the same full field in a selectable text area and can copy it without requiring a canvas selection.

**Open plain text…** uses line breaks for rows and the longest row's **grapheme count** for the width. A joined emoji or combining sequence occupies one cell. Shorter rows are padded with spaces. CRLF and lone CR line endings become LF, and a leading Unicode byte-order mark is removed. Tabs expand to **four-column cell stops**.

The importer removes **one final newline** as the file terminator and preserves additional blank rows. Empty input or a single newline is rejected as empty text. A remaining blank row has a minimum width of one cell. Use JSON when exact dimensions of a completely blank field matter.

View text in a monospaced font and preserve whitespace. Wrapping in another application can make the drawing look broken without changing the file. Terminal character-width rules may differ from GlyphPoint's one-grapheme-per-cell convention.

### Standalone HTML

**Export standalone HTML…** writes `glyphpoint-export.html`. The recipient opens it as a normal local web page. It includes the complete field, individual colours, font/style choices, field background, square-cell proportions, and embedded DejaVu Sans Mono font faces. It is an artwork view without editor tools or undo history.

Native exports include inert embedded v3 project data. On reimport, that data is authoritative: changing only the visible `pre` artwork does not change the restored project. Keep the JSON project as the simplest editable original. The HTML export uses a restrictive resource policy and requires no network connection to display its bundled font.

Local font choices and glyphs outside the bundled font's coverage can still use recipient-specific fallback. For exact visible pixels, export PNG. HTML export rejects output beyond the import file-size budget rather than producing an oversized file that GlyphPoint cannot reopen.

### Opening HTML artwork

**Open coloured HTML…** first recognises native embedded project data. For other HTML, it finds the element with `id="art"`, or otherwise the first `pre`. It imports text and a safe, bounded styling subset into editable cells. It does not turn an arbitrary page or an image into glyph art.

| Foreign HTML feature | Supported interpretation |
| --- | --- |
| Graphemes | Segmented across adjacent text nodes, preserving combining and joined sequences in one cell. A cluster spanning conflicting styles uses the first code point's style and reports it. |
| Foreground | Inherited and per-cell named, hex, RGB/RGBA, and HSL/HSLA colours accepted by the browser's colour parser. Identical glyphs retain distinct colours. |
| Background | Supported colours on the artwork or ancestors establish the default; descendant colours become cell backgrounds. |
| Transparency | Background alpha is composited through ancestors; foreground alpha is composited onto each effective background. The resulting document colours are opaque six-digit hex. |
| Stylesheets | In-document `style` rules with tag, class, ID, compound, descendant, and direct-child selectors. Source order, specificity, `!important`, and inline styles determine the supported declarations. |
| Font | The supported font list is searched in the supplied fallback order; unavailable families use the editor default. No fonts are downloaded. |
| Text styles | Bold, italic/oblique, underline, and semantic `b`/`strong`, `i`/`em`, and `u` tags, with CSS overrides. |
| Line structure | Text newlines, tabs, `br`, and supported block boundaries. `display:none`/hidden subtrees are omitted; visibility-hidden text occupies blank cells. |
| Document ancestors | Basic `html`/`body` inline styles and selector ancestry are retained without attaching imported markup to the live page. |

Pseudo-classes/elements, attribute/sibling selectors, CSS variables, conditional at-rules, external stylesheets, images, gradients, downloaded fonts, arbitrary layout, font sizes, transforms, and other unsupported effects are ignored with applicable status warnings. Imported markup remains inert; scripts and resource nodes never enter the application DOM, and style/resource URLs are not fetched. Large node trees, deep nesting, or excessive CSS complexity are rejected even if the file is below 16 MiB.

External HTML starts with ordinary character-cell proportions. Native embedded project data preserves Square pixels, the full palette, labels, and editing metadata. After any foreign import, review its status message and the resulting field before saving it.

### PNG and printed output

**Export PNG image…** renders the **entire field**, including cells outside the scrolled viewport, at the document's base cell size. It waits for the used font faces and takes a coherent snapshot before asynchronous drawing. Zoom, selection outlines, grid guides, and cursor/preview overlays do not change the exported artwork. The image includes the document and individual backgrounds and has no editable grapheme metadata.

PNG preserves the glyphs as rendered on the exporting browser. This makes it the appropriate interchange format for a fixed appearance when fonts or emoji rendering differ on the receiving device. Keep JSON alongside it for further editing. Raster allocation is bounded; an image request beyond the supported pixel budget is rejected with an error.

**File → Print…** prepares the same full-field image before opening the browser print dialog. It does not print only the currently visible portion of the canvas. The browser controls paper size, margins, scaling, pagination, and PDF destinations; inspect the preview for your intended page layout.

### Downloads and portability

For downloads, the browser controls the destination and whether a save dialog appears. The editor uses recognizable names; rename files for your own organisation and verify requested downloads. A direct Save reports success only after the browser's writable stream closes.

Project, palette, text, HTML, and PNG files can be copied between computers. Recovery and preferences belong to their browser/origin and are not transferred or synchronised with those files. Open a project or import a palette explicitly in the destination browser.

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
| **Background** | Changes the default background; individually coloured cells retain their overrides. |
| **Pan field** | Lets a pointer/touch drag scroll the field without drawing. Turn it off to resume editing. |
| **Focus field** | Places keyboard focus on the editable grid and reveals its active cell. |

Zoom magnifies the field's presentation without adding cells or changing saved character data. Browser page zoom is separate and can also change the size of toolbars and dialogs. The square-cell setting changes the artwork's aspect ratio, so it is stored in projects.

Scroll the field inside its viewport to reach distant cells. The renderer draws the visible area in bounded animation-frame batches, so the document does not allocate one visual DOM element per cell. Keyboard movement automatically scrolls the active cell into view. If a small screen hides controls, scroll the appropriate ribbon/sidebar; **Pan field** is useful for touch navigation without drawing.

**File → Print…** first renders a complete image of the field, then uses a print layout that hides the controls. Grid, selection, and cursor overlays are excluded. Inspect the browser's preview for page size, scaling, margins, pagination, and colour settings. Use the File command or application `Ctrl+P`/`Command+P` so the current image is prepared before printing.

## Keyboard and mouse reference

Use application shortcuts while working on the canvas. When focus is in an input or text area, normal text-entry behavior takes precedence. On platforms that use Command, the application also recognises the Meta/Command modifier; browser-level shortcuts may still be reserved by the browser or operating system.

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` | New document. |
| `Ctrl+S` | Save project through the supported direct-save or download path. |
| `Ctrl+P` | Prepare the full field and open the browser print dialog. |
| `Ctrl+Z` | Undo. |
| `Ctrl+Y` or `Ctrl+Shift+Z` | Redo. |
| `Ctrl+C` | Copy selection. |
| `Ctrl+X` | Cut selection. |
| `Ctrl+V` | Paste. |
| `Delete` | Clear the current selection; with field focus and no selection, clear the focused cell. |
| `+` or `=` | Increase artwork zoom by 25 percentage points. |
| `-` | Decrease artwork zoom by 25 percentage points. |
| `Shift` during a shape drag | Constrain the shape/line to 1:1 cell-space bounds. |
| `Enter` in supported palette/manager fields | Commit that field's edit. |
| `Escape` outside a dialog | Cancel an active background operation; otherwise close menus/pickers, cancel previews, and clear the selection. |
| `Escape` in a native dialog | Close that dialog through the browser's dialog behavior. |

### Edit with field focus

Choose **Focus field**, click the field, or Tab to **GlyphPoint editable field**. It has one keyboard focus target and an active cell whose row, column, glyph, colours, optional Represents label, and selection state are exposed to assistive technology. The active cell remains visible as you navigate. Tab leaves the field normally.

| Key with field focus | Action |
| --- | --- |
| Arrow keys | Move one cell in the indicated direction. |
| Shift + movement key | Extend a rectangular selection from the starting active cell. |
| Home / End | Move to the first/last column of the current row. |
| Ctrl/Command + Home / End | Move to the first/last cell of the document. |
| Page Up / Page Down | Move ten rows upward/downward. |
| Ctrl/Command + A | Select the whole field. The **All** button remains available. |
| Space | Apply the current Pencil/Fill/Eraser/Picker action at the active cell; other tools use the current brush to paint. |
| Shift + Space | Use the secondary glyph, or pick into the secondary slot when Picker is active. |
| Enter | Open text entry anchored at the active cell. |
| Delete / Backspace | Clear the selection or, without a selection, the active cell. |
| Tab | Leave the field for the next focusable control. |

Palette tiles accept **Enter** or **Space** to choose the primary glyph, and **Shift+Enter** or **Shift+Space** to choose secondary. **Left/Right Arrow** moves focus between adjacent palette tiles without changing the active glyph; the first and last tiles are boundaries rather than a focus trap. In palette Edit mode, Enter or Space opens the entry dialog. Tab uses native browser/operating-system focus policy: Safari on macOS can skip buttons unless the user enables full keyboard navigation. The editor does not provide letter-key shortcuts for each drawing tool; use the named controls to choose tools.

For a complete selectable representation, choose **File → Readable text / copy all…**. The text area contains all rows, not only the visible viewport. **Copy all** uses the system clipboard when available and otherwise selects the text for your system Copy command. **Export text** creates a plain-text file. Individual colours and style information remain available in project JSON/HTML and the focused-cell description, rather than in this plain-text view.

| Mouse action | Effect |
| --- | --- |
| Left-click palette tile outside edit mode | Set primary, or secondary when **Use secondary glyph** is active. |
| Right-click palette tile outside edit mode | Set secondary glyph. |
| Left/right Pencil, Flood fill, or Glyph-mode shape outline | Use primary/secondary glyph. |
| Left/right Glyph picker | Set primary/secondary from the clicked cell. |
| Click/drag Eraser | Write blank cells using the brush footprint. |
| Drag with a shape selected | Commit the chosen shape on release. |
| Drag outside an existing selection | Create a new selection. |
| Drag inside an existing selection | Move selected content. |
| Right-click palette tile in Edit mode | Remove the entry. |

### Touch and smaller screens

On touch, tap tools and palette tiles, then drag the field to draw or select. Switch **Use secondary glyph** on, tap a palette tile to assign the secondary glyph, and draw with that choice; switch it off to return to primary. Switch **Pan field** on to drag-scroll the artwork; switch it off before the next stroke. The layouts adapt to narrower viewports and provide larger touch targets, while the field retains its own scroll area and zoom controls.

These controls make touch and keyboard operations available in the application. Browser automation and emulated touch viewports do not establish a physical iPhone/Android playtest, a Windows/macOS keyboard-layout certification, or screen-reader/WCAG conformance. File pickers, clipboard permissions, touch gestures, and assistive announcements should be checked on the actual browser/device you intend to use. Report the device, browser, input method, and reproduction steps when a workflow fails.

## Practical workflows

### Create an outlined object with a different fill glyph

Choose a primary outline glyph and select another as secondary using right-click or a palette tile's Shift+Enter. Select Rectangle, Ellipse, or another closed shape. Set **Stroke → Glyph**, **Fill → Secondary**, and Width `1`, then drag. With inherited brush colours, changing the two palette colours later recolours the object consistently. Use Cell colours for independently painted instances.

### Stamp a motif over existing artwork

Select the motif and copy it. Enable **Ignore blanks** and leave **Edges → Expand to fit** selected. Make a small selection at the destination and paste. Ordinary spaces with inherited backgrounds are skipped; spaces with painted backgrounds remain part of the motif. Disable Ignore blanks when you want the entire copied rectangle to replace its destination.

### Add room without stretching the drawing

Open Properties and increase Width or Height. This adds blank cells to the right or bottom while preserving the existing cell positions. To move the artwork into a larger margin, select it afterward and drag it to the desired location. Use Resize only when you intend to resample its contents.

### Recolour a whole drawing

Save a project first. To recolour everything through the palette, select the intended cells and restore **Inherit glyph palette** in Cell colours. Open the Colour Manager and try a Colourway. Fine-tune the most-used glyphs using **Sort → Usage**. Add Represents labels to record each glyph's role. Export the palette if you want to reuse that vocabulary in another document.

### Make a reusable symbol sheet

Create a moderate-size field, draw several motifs with clear spaces between them, and save the project as a master. Copy/paste selected regions within a session. Keep the master project file: the internal clipboard disappears when the page is reloaded.

### Review a saved result

Save JSON and export HTML or PNG. Reopen the JSON to check editable state, then inspect the viewable export in another tab/application. Verify dimensions, row ends, repeated glyphs with different colours, whitespace, backgrounds, and styled text. Keep the JSON even if you distribute only the visual export.

## Limits and compatibility

Use a current browser with Canvas 2D and Unicode grapheme segmentation. The runtime has no external JavaScript dependencies or required network access. It provides mouse, keyboard, and pointer/touch controls; feature availability still depends on the browser and origin.

| Area | Practical boundary |
| --- | --- |
| Field dimensions | Whole values from `1` to `4,096` on each axis, with at most **1,048,576 cells** overall. Both constraints must hold. |
| Import file size | At most **256 MiB** for JSON projects; **16 MiB** for palette, text and HTML files. HTML also has node, nesting, style, rule, and selector-work budgets. |
| Palette | At most **4,096 entries including reserved space**, leaving at most **4,095 other graphemes**. Space cannot be removed or renamed. |
| Colours | Palette/field defaults with individual opaque six-digit hex foreground and background overrides. Imported CSS alpha is flattened onto the effective background. |
| Glyphs | One printable extended grapheme per cell, up to **32 Unicode code points**; controls, lone surrogates, and overlong clusters are rejected. |
| Text scale | `1×`, `2×`, or `3×` cell repetition. |
| Brush size | Whole values `1`–`60`; ratio tips can be longer than 60 cells on their long axis. |
| Shape width | Values `1`–`8`. |
| Zoom | 25%–800%, in 25-percentage-point increments. |
| Labels | Represents labels have an 80-character storage limit. |
| Undo/redo | At most 60 snapshots and 2,097,152 retained cells across undo/redo; session only. |
| Recovery | Up to 12 latest document-session checkpoints, 32 MiB serialized payload total, 16 MiB per entry; browser-local and subject to storage availability. |
| File saving | Native writable-file saving when exposed by the browser; explicit download fallback otherwise. The API is detected rather than assumed from the operating system. |
| Clipboard | System access depends on browser permissions/context. Internal styled copying remains session-local; Readable text provides a manual-copy alternative. |
| Fonts | Four DejaVu Sans Mono faces are embedded. Other selected fonts and uncovered glyphs can use platform fallback. PNG fixes the exported pixel appearance. |
| Rendering | Viewport-based Canvas 2D with bounded frame work and separate overlays; model/history still retain the entire document. |
| Long calculations | Fill and Resize/Skew use a worker or cooperative fallback, with progress, cancellation, and one atomic completed edit. File parsing, JSON serialization, and some smaller edits still run on the main thread. |

For example, `1024 × 1024` and `4096 × 256` fields each contain 1,048,576 cells and fit the area budget; `2048 × 2048` and `4096 × 4096` exceed it. Memory use grows with every cell and each retained Undo snapshot, even though the Canvas viewport only paints visible cells. Expand-to-fit operations also obey both limits: they reject a candidate that cannot fit instead of silently clipping it.

Combining sequences and emoji can be stored as complete cells, but storage support does not guarantee a particular font has the glyph. Wide glyphs are fitted to the fixed cell box; they do not claim two terminal columns. Square pixels changes cell proportions, not Unicode segmentation. Use the embedded font for predictable covered characters and PNG for a fixed result across viewers.

Foreign HTML preserves a useful safe subset of colours and typography, including multiple colours for the same glyph. It cannot preserve arbitrary page layout, active content, downloaded resources, or unsupported CSS effects. Review import warnings and keep the source if those effects matter. The [format reference](project-format.md) describes the exact subset and budgets.

Automated checks provide evidence for the combinations actually exercised; the [quality audit](quality-audit-2026-11-03.md) records scope and results. Do not infer physical Windows/macOS/mobile or screen-reader qualification solely from headless browser results. The application exposes keyboard navigation, focus descriptions, readable text, explicit secondary and pan controls, and responsive layouts so those workflows can be exercised and reported directly.

## Troubleshooting

| Symptom | Likely cause and next step |
| --- | --- |
| The browser shows source code or a repository page | Open the downloaded `.html` application file, not GitHub's source viewer. |
| The palette opens an edit dialog instead of choosing a drawing glyph | Palette Edit mode is active. Choose **Done**. |
| Drawing uses an unexpected character | Check the primary/secondary slots and which mouse button you are using. Glyph-mode shape outlines also follow the mouse button; fill has its own Primary/Secondary choice. |
| A palette entry will not remove | Space is permanently reserved. For another glyph, replace or erase its field occurrences first; minimum-entry rules also apply. |
| Changing a palette colour recolours distant parts | Those cells inherit the glyph default. Use **Cell colours → Custom cell colour** for independently coloured occurrences. |
| A cell ignores a palette or background change | It has a custom override. Select it and restore the relevant inheritance mode in **Cell colours**. |
| Spaces erase content during paste | Enable **Ignore blanks**. It skips spaces with inherited backgrounds; deliberately painted background cells are retained. |
| Pasted content appears at the upper left | There was no active destination selection, so the anchor was `(0, 0)`. |
| Pasted content is an older copied motif | GlyphPoint has an internal clipboard. It is preferred over external clipboard text while an internal copy exists. |
| External copy/paste fails | Check browser clipboard permissions or try the localhost launch method. Use JSON/text files for reliable interchange. |
| Moving, pasting, text, or rotation loses an edge | Check whether **Clip overflow** was selected. Undo and use **Expand to fit** or **Reject overflow**. Brush/shape footprints remain bounded by the existing field. |
| Expand or Skew is rejected | The required bounds exceed an axis/area limit. Reduce the requested size/angle, or use Clip deliberately. Reject mode also refuses any overflow. |
| A reflected arrow still points the same way | Transforms move cells; they do not substitute `>` with `<` or rotate the glyph outlines. |
| A circle or square looks stretched | Normal character cells are not square. Try **Square pixels**. |
| Text at 2× looks repeated | Scale repeats each glyph into a 2×2 block. Use 1× for ordinary text. |
| Flood fill escapes a shape | The outline has a connected gap in the target glyph region. Undo and close the gap, or use a shape's Fill option. |
| Glyphs seem invisible | Compare the effective foreground and background, including custom cell overrides. Focus the cell to inspect its announced colours. |
| A glyph appears as a box or is unusually small | The selected/fallback font may lack it, or fitting a wide grapheme requires scaling. Try the embedded font or an installed font with appropriate coverage; use PNG to share the displayed result. |
| Plain-text export looks different elsewhere | Text has no colours/styles and the viewer may wrap lines or use a proportional font. Use a monospaced font, disable wrapping, or share HTML instead. |
| Opening text changes a final newline | One trailing line terminator is removed; additional blank rows are retained. Use JSON if another program trims whitespace or changes line endings. |
| A resize or import is rejected | Check the 4,096-cell axis limit, 1,048,576-cell area budget, 256 MiB project or 16 MiB text/HTML/palette input limit, and project structure. The current document should remain intact. |
| Saved files cannot be found | For direct Save, check the destination chosen in the picker. For downloads, inspect the browser download list and any numbered duplicate filenames. |
| Save leaves the asterisk visible | Download completion cannot be verified, or a newer edit occurred during a direct save. Confirm the JSON copy, or save the newest revision to the chosen file. |
| Save project as is disabled | This browser/context does not expose the native writable-file picker. Use **Download project JSON**. |
| A palette JSON file will not open as a project | It contains a palette without a canvas. Use the Colour Manager's **Import palette or project…** instead. |
| Preferences disappear in another browser or after storage is cleared | Preferences are local to that browser context. Import a palette or open a saved project. |
| Reload starts with a blank canvas | Choose **Recovery** and select the intended checkpoint. Use the same browser/profile/address. If no checkpoint was stored, reopen the latest project file. |
| Recovery reports unavailable or full | Save/download a project first. Inspect the status detail; free browser storage or delete old checkpoints if appropriate, then edit to retry. Clearing site data also removes recovery entries. |
| A recovered document lacks Undo steps | Checkpoints restore artwork/settings, not session undo history. Use named project versions for durable milestones. |
| Touch dragging scrolls instead of draws | Turn off **Pan field** before drawing. Turn it on when you want to navigate without painting. |
| Keyboard arrows scroll the page | Use **Focus field** so the editable grid owns focus. Normal input controls retain their own keyboard behaviour. |
| Printing is stale, cropped, or scaled unexpectedly | Use **File → Print** to prepare the current full-field image, then inspect the browser's page size, scaling, margins, and preview. |

### Reporting a problem

Include the maintained HTML filename, the repository commit if known, browser/version, operating system, interface mode, field dimensions, and steps from a fresh document. State what happened and what you expected. Attach a minimal project or text file only when it is safe to share its contents.

For a save/export problem, retain both the input project and the generated output. For a drawing problem, record the selected tool, glyphs, size/width, tip, stroke/fill options, selection type, and whether Ignore blanks or Square pixels was enabled. This gives a future fix a reproducible starting point.
