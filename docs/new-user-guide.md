# GlyphPoint: new-user guide

GlyphPoint is a desktop-browser editor for pictures made from characters. You paint on a grid, choose a colour for each glyph, add text and shapes, and save the result as a project, plain text, or a viewable HTML page. It runs from one HTML file; the editor does not require an account or a server.

This guide uses **`GlyphPoint-v1a-layout-fixed.html`**, the maintained editor. The other versioned HTML files in the repository are historical snapshots. For a complete description of the controls, see the [instruction manual](manual.md). The [repository overview](../readme.md) links the remaining documentation, including [agent working instructions](../AGENTS.md) for development.

## Contents

- [Get the editor](#get-the-editor) — Download the maintained HTML file and open it locally.
- [Understand the workspace](#understand-the-workspace) — Learn the grid, glyph palette, and two interface layouts.
- [Make your first drawing](#make-your-first-drawing) — Create a small frame, paint inside it, and add a caption.
- [Save and reopen your work](#save-and-reopen-your-work) — Keep an editable project and check the saved file.
- [Share the result](#share-the-result) — Choose HTML for a viewable picture or text for characters alone.
- [Choose what to learn next](#choose-what-to-learn-next) — Continue with selection, transforms, and palette management.
- [If something goes wrong](#if-something-goes-wrong) — Resolve common first-run and download problems.

## Get the editor

1. Open the [GlyphPoint repository](https://github.com/techrote/GlyphPoint).
2. Choose **Code → Download ZIP**, then extract the ZIP. Alternatively, open `GlyphPoint-v1a-layout-fixed.html` in GitHub and use **Download raw file**.
3. Open the downloaded `GlyphPoint-v1a-layout-fixed.html` with your desktop browser. Double-clicking it usually opens the browser associated with HTML files. You can also use your browser's **Open File** command.
4. Check that you see **GlyphPoint**, a tool area, and a blank grid. If you see HTML source or the GitHub file viewer, you have not opened the downloaded editor yet.

Keep the original filename when downloading: some operating systems hide extensions, so check that the file has not become `.html.txt`.

The file contains its own interface, scripts, and styles. After downloading it, you can use the editor without a network connection. Fonts come from the fonts installed on your computer; no particular optional font is required to start.

### Optional: use a local web server

A local server is useful when your browser restricts clipboard access from a `file:` page. It is not needed for ordinary drawing or project downloads. If Python is already installed, open a terminal **in the extracted repository folder** and run one of these commands:

Windows:

```powershell
py -m http.server 8000 --bind 127.0.0.1
```

Linux or macOS:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open [http://127.0.0.1:8000/GlyphPoint-v1a-layout-fixed.html](http://127.0.0.1:8000/GlyphPoint-v1a-layout-fixed.html). Leave the terminal running while you use that address; press `Ctrl+C` in the terminal to stop the server.

The `file:` copy and the local-server copy can have separate browser preferences. Switching between them does not move unsaved artwork; use a project file to transfer it.

## Understand the workspace

You start with an **80 × 80 cell** document. Each cell contains one character and its text styling. This is a character grid, so drawing with `#` places literal `#` characters rather than painting bitmap pixels.

The main controls are:

| Area | What you use it for |
| --- | --- |
| **File** at the top left | New documents, open/save, exports, properties, print, and help. |
| Tool buttons | Pencil, Flood fill, Text, Eraser, Glyph picker, and Magnifier. Hover over an icon for its name. |
| Glyph palette | Choose the character you draw with and manage its colour. |
| Shapes | Drag lines, rectangles, ellipses, triangles, diamonds, and arrows. |
| Selection controls | Select, copy, cut, paste, move, crop, and resize. |
| View controls and status bar | Zoom, gridlines, rulers, square cells, and document dimensions. |

The mode button at the top right offers **Classic** when you are in the ribbon layout, and **Ribbon** when you are in the classic sidebar layout. It names the layout you will switch **to**. Both layouts operate on the same artwork.

The glyph slots marked **1** and **2** are your primary and secondary glyphs. Outside palette-edit mode:

- **Left-click a palette tile** to choose the primary glyph; draw with the left mouse button.
- **Right-click a palette tile** to choose the secondary glyph; Pencil, Flood fill, and Glyph-mode shape outlines can use it with the right mouse button.
- Choose **Colours…** to change glyph colours. A glyph has one colour throughout the document: changing the colour of `#` changes every `#` already drawn.
- **Background** changes the whole field background. A blank cell shows that background.

The palette holds up to **4,096 entries including one reserved space**, leaving room for at most **4,095 other glyphs**. Space cannot be removed or renamed, even when the current drawing contains no blank cells. Palette Reset keeps glyphs used in your drawing, restores their default colours, and adds the built-in defaults where capacity remains; the usual `#` / `+` slot choices can fall back to an available entry in a full palette.

## Make your first drawing

### Start with a smaller field

1. Choose **File → Properties**.
2. Set **Width (cells)** to `40` and **Height (cells)** to `20`.
3. Keep the background black and choose **OK**.

Properties changes the size of the field while keeping existing cells at the top left. **Resize** is a different command that scales existing artwork; you do not need it for this first exercise.

### Draw a frame

1. Left-click `#` in the palette.
2. Choose the **Rectangle** shape. Hover over the shape icons to find its name.
3. Set **Stroke** to **Glyph**, **Fill** to **None**, and **Width** to `1`.
4. Drag from near the upper-left corner of the field to near the lower-right corner, leaving a small margin.
5. Release the mouse button to commit the rectangle.

The preview shows the shape's bounds. If the result is not where you wanted it, choose **Undo** in the title bar or press `Ctrl+Z`, then draw it again.

### Paint and recolour

1. Choose **Pencil** and leave **Size** at `1`.
2. Choose a different glyph, such as `+`, and draw a few marks inside the frame.
3. Open **Colours…**. Find the row for `+`, then choose a colour with its colour swatch or enter a six-digit hex value such as `#ffcc00`.
4. Choose **Close** when you are done. The marks change together because colour belongs to the glyph.

Use **Eraser** to replace cells with spaces. If you choose **Flood fill**, click an area containing the same character to replace the connected region. Flood fill matches characters, so filling the blank interior of your frame is different from filling the `#` outline.

### Add a caption

1. Choose **Text**, then click the cell where the caption should begin.
2. Type `HELLO` in the dialog.
3. Leave **Scale** at **1×** for ordinary one-character-per-cell text.
4. Choose **Place text**.

Typed characters use their own entries in the glyph palette. Characters newly introduced to the document start with a default colour; you can adjust them through **Colours…**. The Text font and style controls apply to the text you are placing.

## Save and reopen your work

**Save a project before closing or reloading the editor. The drawing is not automatically saved to browser storage.**

1. Choose **File → Save project**, or use `Ctrl+S` when you are working on the canvas.
2. The browser downloads **`glyphpoint-project.json`**. Check your Downloads folder or the location selected in the browser's save dialog.
3. Rename that file to something meaningful, such as `first-drawing.glyphpoint.json`.
4. To verify the saved copy, choose **File → Open GlyphPoint project…** and select that JSON file.
5. Check the dimensions, text, colours, and cell appearance. Save another version when you make further changes you want to keep.

Saving downloads a file; it does not silently overwrite the file you opened. Your browser may append `(1)`, `(2)`, and so on to repeated download names. Open and retain the intended version.

The project contains the field, cell contents and styles, palette, background, selected glyphs, and square-cell setting. Undo history is session-only. Palette preferences and the interface layout are stored separately in this browser when browser storage is available; those preferences are **not a backup of the drawing**.

The editor warns before replacing unsaved work with a new document or imported file, and asks the browser to warn before leaving a dirty page. Those warnings are a final reminder, not an autosave facility. Keep a saved JSON copy.

## Share the result

| Goal | Choose | What the recipient needs |
| --- | --- | --- |
| Keep editing later | **File → Save project** | GlyphPoint and the JSON project file. |
| Show the coloured artwork | **File → Export standalone HTML…** | A browser to open the downloaded HTML page. |
| Copy characters into another text workflow | **File → Export plain text…** | A text editor or another program that accepts text. |
| Produce a paper or PDF copy | **File → Print…** | The browser's print dialog and an available print/PDF destination. |

Plain text contains characters and line breaks only. It cannot store the glyph palette, colours, fonts, or styles. Keep the JSON project as your editable original even if you also export HTML or text.

## Choose what to learn next

- [Selections and the clipboard](manual.md#selections-and-the-clipboard): move a motif, make copies, and understand **Ignore blanks**.
- [Shapes](manual.md#shapes): combine primary/secondary fills, line glyphs, and different stroke widths.
- [The glyph palette](manual.md#the-glyph-palette) and [Glyph Colour Manager](manual.md#glyph-colour-manager): create a reusable vocabulary of glyphs and colours.
- [Resize, skew, and properties](manual.md#resize-skew-and-properties): change the field dimensions or scale the artwork deliberately.
- [File formats and exports](manual.md#file-formats-and-exports): understand what is preserved by each format.

## If something goes wrong

| Symptom | What to try |
| --- | --- |
| GitHub shows source code | Download the raw HTML or the repository ZIP, then open the local HTML file. |
| Tools do not fit | Scroll the ribbon horizontally, or switch to Classic and scroll its sidebar. You can also zoom the artwork separately from the browser page. |
| A character looks like a box | Try an installed font that includes that character. Fonts differ between computers. |
| Copy/paste to another app fails | Allow clipboard access if the browser asks, or try the optional localhost server. GlyphPoint's internal copy buffer remains useful within the editor. |
| New or opened artwork looks blank | Check the field background and the glyph colour: identical colours can make a glyph invisible. Also check that you opened a project, not a palette-only JSON file. |
| Reload lost the drawing | Reopen your last saved project. Browser palette preferences do not contain the canvas. |
| You cannot find the save | Check the browser's download list and Downloads folder; repeated saves may have numbered filenames. |

For more detail, use the [troubleshooting reference](manual.md#troubleshooting). If you report a problem, include the editor filename, browser version, exact steps, and a small project that demonstrates it when you can share one.
