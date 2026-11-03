# GlyphPoint: new-user guide

GlyphPoint makes pictures from a grid of characters. Paint with letters and symbols, colour individual cells, add text and shapes, and keep an editable project. It runs from one offline HTML file with an included font, automatic local recovery, keyboard editing, and mouse/touch controls. No account, build tools, or server are required to start.

This guide uses **`GlyphPoint-v1a-layout-fixed.html`**, the maintained editor. Other versioned HTML files are historical snapshots. Use the [instruction manual](manual.md) for the complete reference and the [repository overview](../readme.md) for development documentation, including [agent working instructions](../AGENTS.md).

## Contents

- [Get the editor](#get-the-editor) — Download and open the maintained HTML file.
- [Understand the workspace](#understand-the-workspace) — Learn cells, palette defaults, individual colours, and layouts.
- [Make your first drawing](#make-your-first-drawing) — Draw a frame, colour a detail, and add a caption.
- [Use keyboard or touch](#use-keyboard-or-touch) — Edit and navigate without relying on a right mouse button.
- [Save and reopen your work](#save-and-reopen-your-work) — Choose a project destination or download a portable copy.
- [Recover after a reload](#recover-after-a-reload) — Restore a local automatic checkpoint.
- [Share the result](#share-the-result) — Choose editable JSON, viewable HTML, fixed PNG, or text.
- [Choose what to learn next](#choose-what-to-learn-next) — Continue with selections, transforms, and palette management.
- [If something goes wrong](#if-something-goes-wrong) — Resolve common first-run, save, and recovery problems.

## Get the editor

1. Open the [GlyphPoint repository](https://github.com/techrote/GlyphPoint).
2. Choose **Code → Download ZIP**, then extract the ZIP. Alternatively, open `GlyphPoint-v1a-layout-fixed.html` in GitHub and choose **Download raw file**.
3. Open the downloaded HTML file in a current browser. Double-clicking usually opens the associated browser; its **Open File** command is another option.
4. Check that you see **GlyphPoint**, tools, and a blank grid. A GitHub source viewer or a page of HTML text is not the running editor.

Keep the `.html` extension. Some operating systems hide extensions, so check that the file has not become `.html.txt`.

The file contains its interface, JavaScript, styles, and the regular/bold/italic faces of **DejaVu Sans Mono**. You can use it offline after downloading. Glyphs outside that font's coverage and other font choices can use the browser's installed-font fallback.

### Optional: use a local web server

A consistent localhost address can help with browser storage and clipboard permissions. It is optional for drawing and downloads. If Python is installed, open a terminal **in the repository folder** and run:

Windows:

```powershell
py -m http.server 8000 --bind 127.0.0.1
```

Linux or macOS:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open [http://127.0.0.1:8000/GlyphPoint-v1a-layout-fixed.html](http://127.0.0.1:8000/GlyphPoint-v1a-layout-fixed.html). Leave the terminal running while using that address; press `Ctrl+C` there to stop it. The server serves the editor file and does not receive your artwork.

Use the same browser, profile, address, and port when you want the same recovery archive. A local `file:` copy, localhost copy, different browser, or private window can have separate storage. Use a JSON project to move artwork between them.

## Understand the workspace

A new document is **80 × 80 cells**. Each cell contains one Unicode grapheme: a character or a joined sequence such as `é` or `👨‍👩‍👧‍👦`. The editor keeps that sequence together in one cell. It is still a character grid: drawing with `#` places literal `#` characters.

| Area | What it does |
| --- | --- |
| **File** | New/open/save, recovery, exports, properties, print, and help. |
| Tool buttons | Pencil, Flood fill, Text, Eraser, Glyph picker, and Magnifier. |
| Glyph palette | Chooses primary/secondary glyphs and their default colours. |
| Shapes | Draws lines, rectangles, ellipses, triangles, diamonds, and arrows. |
| Selection controls | Selects, copies, cuts, pastes, moves, crops, and transforms. |
| **Cell colours** | Sets custom foreground/background colours for individual cells or upcoming strokes. |
| **Focus field**, **Use secondary glyph**, **Pan field** | Provides keyboard focus, secondary drawing, and drag-to-scroll navigation. |
| Status bar | Shows dimensions, messages, zoom, and recovery status. |

**Classic** switches from the top ribbon to a left sidebar; **Ribbon** switches back. The button names the destination layout. Both use the same document and tools. Scroll the ribbon or sidebar when controls extend beyond the available space.

The slots marked **1** and **2** show the primary and secondary glyphs. Outside palette Edit mode:

- Click a tile to select primary, or right-click to select secondary. With **Use secondary glyph** switched on, an ordinary tap selects secondary instead. Keyboard users can focus a tile, move between adjacent palette tiles with Left/Right Arrow, and press Enter or Shift+Enter. On macOS, whether Tab visits buttons is controlled by the system/browser keyboard-navigation setting.
- Pencil and Flood fill use the primary glyph with the normal mouse button; the other mouse button or **Use secondary glyph** selects the secondary drawing choice.
- **Colours…** changes palette defaults. All `#` cells that inherit their foreground change together when you change `#`'s palette colour.
- **Cell colours** creates exceptions: one `#` can be red while another is blue. A custom background can colour even a space cell.
- **Background** changes the field's default; cells with custom backgrounds keep their own colours.

**Edges → Expand to fit** starts selected. Pasting, moving a selection, placing text, and rotating a selection can grow the field to keep the result. Choose Reject or Clip only when you intend those behaviours. Brushes and shape footprints remain bounded by the existing field.

## Make your first drawing

### Start with a smaller field

1. Choose **File → Properties**.
2. Set **Width (cells)** to `40` and **Height (cells)** to `20`.
3. Keep the background black and choose **OK**.

Properties adds or removes field boundaries while keeping existing cells at the top left. **Resize** scales the artwork itself; you do not need it for this exercise. If shrinking would discard existing artwork, Properties asks before proceeding.

### Draw a frame

1. Select `#` in the palette.
2. Choose the **Rectangle** shape. Hover over an icon, or focus it, to identify the named control.
3. Set **Stroke → Glyph**, **Fill → None**, and **Width → 1**.
4. Drag from near the upper-left to near the lower-right of the field, leaving a small margin.
5. Release to commit the rectangle.

Use **Undo**, `Ctrl+Z`, or `Command+Z` if you want to try again. Watch the recovery status change from pending to saved after an edit.

### Paint and recolour

1. Choose **Pencil** and leave **Size** at `1`.
2. Select `+` and draw a few marks inside the frame.
3. Open **Colours…**, find the row for `+`, and choose a colour or enter a six-digit hex value such as `#ffcc00`.
4. Close the manager. The inherited `+` marks change together.
5. Click a `+` cell to focus it, or select a group of cells. Choose **Cell colours**.
6. Set **Foreground → Custom cell colour**, choose another colour, and choose **Apply to cells**. The selected cells keep the new colour independently of the palette.

Applying cell colours also updates the colours for upcoming strokes. To resume palette-based drawing, open **Cell colours**, choose **Inherit glyph palette** and **Inherit field background**, then choose **Use for next strokes**. To remove existing overrides, select those cells and choose **Apply to cells** instead.

**Eraser** writes ordinary spaces and clears colour/style overrides. **Flood fill** replaces a four-way connected region with matching glyph and foreground/background settings. It shows progress and offers **Cancel operation**; cancelling leaves the document unchanged.

### Add a caption

1. Choose **Text** and click its starting cell. Keyboard users can focus the desired cell and press Enter.
2. Type `HELLO` in the dialog.
3. Leave **Font → DejaVu Sans Mono (embedded)** and **Scale → 1×**.
4. Choose **Place text**.

At 1×, each grapheme occupies one cell. Scale 2× or 3× repeats it into a block of cells; it does not enlarge the outline of a letter. The font and bold/italic/underline controls affect the placed cells.

Text follows the brush colours. With foreground inheritance, each letter uses its own palette entry; a custom brush foreground can give the whole caption one colour. Transparent text skips spaces, while Opaque places spaces and records the chosen background. Expand-to-fit keeps a caption that crosses an edge, provided the enlarged field stays within the document limits.

## Use keyboard or touch

Choose **Focus field** to begin keyboard editing. Arrow keys move one cell; Shift+Arrow extends a rectangular selection. Press Space to paint, Shift+Space to use secondary, Enter for text, and Delete to clear the selection or focused cell. Home/End move within the row; Ctrl/Command+Home/End reach document corners. Ctrl/Command+A selects all. Tab leaves the field.

The focused cell exposes its row, column, glyph, colours, and optional palette label to assistive technology. **File → Readable text / copy all…** opens the complete field in a selectable text area, with copy and text-export controls. It includes offscreen rows, while colours and styles remain in the project and HTML exports.

On touch, tap the named controls and drag to draw. Switch **Use secondary glyph** on, tap a palette tile to choose secondary, and draw with that choice. Switch it off to return to primary. Turn **Pan field** on to drag-scroll the artwork without painting, then turn it off to draw again. Tool layouts adapt to smaller viewports, and you can zoom the artwork separately from browser page zoom.

These are implemented input paths. Automated browser/touch-emulation checks are distinct from physical device and screen-reader qualification; use the [manual's compatibility guidance](manual.md#limits-and-compatibility) for the evidence boundaries and reporting details.

## Save and reopen your work

Automatic recovery is useful for accidents; a **JSON project file** is the copy you can name, move, back up, and reopen anywhere.

1. Choose **File → Save project**, `Ctrl+S`, or `Command+S` outside a text field.
2. If the browser offers a native file picker, choose a location and a name such as `first-drawing.glyphpoint.json`. After a successful write, later Saves write to that chosen destination for the current document. **Save project as…** chooses another.
3. If the browser uses a download instead, confirm the JSON in its download list or selected folder. The browser may number repeated copies.
4. **Download project JSON…** is always available when you deliberately want a downloaded copy. Save As is disabled when the native picker is unavailable.
5. Choose **Open GlyphPoint project…**, select the intended JSON, and check the dimensions, caption, colours, and cell backgrounds.

The title's asterisk clears only after a confirmed direct write of the current revision. A requested download leaves it visible because the editor cannot know whether you kept the file. Recovery checkpoints also leave it visible. A failed or cancelled Save never claims success.

Opening a project does not grant permission to overwrite that file. Your first direct Save asks you to choose a destination; the chosen handle resets after New, another open, or reload. Save named versions before major crops, resizes, or palette changes.

A project contains cells, graphemes, per-cell styles/colours, palette, field background, selected glyphs, and square-cell setting. Selection, clipboard, view zoom, and Undo history are session state. Current projects use v3; older v1/v2 projects open through a migration that preserves their appearance.

## Recover after a reload

After an edit, GlyphPoint normally stores a local checkpoint about **750 ms after editing pauses**, or schedules one within **five seconds** during continuous editing. Check for **Recovery saved** in the status bar. Storage failures appear explicitly.

1. Reopen the editor at the same address in the same browser/profile.
2. Choose **Recovery** or **File → Recovery checkpoints…**.
3. Find the intended name, size, and timestamp, then choose **Recover**.
4. Confirm replacement if needed, check the restored drawing, and save a project file.

Recovery does not silently replace the startup canvas. It keeps the latest checkpoint for each tab/document session, with at most **12 entries**, **32 MiB total project payload**, and **16 MiB per entry**. Older entries can be evicted. **Delete checkpoint** removes the archive entry after confirmation and does not delete a project file.

Browser data clearing, private windows, quota limits, and separate origins can affect availability. A process that stops before a write completes can lose its newest changes. Keep file copies for important work and transfers; recovery does not include Undo history or synchronize across devices.

## Share the result

| Goal | Choose | What the recipient needs |
| --- | --- | --- |
| Continue editing | **Save project** / **Download project JSON…** | GlyphPoint and the project JSON. |
| Show coloured artwork with a bundled font | **Export standalone HTML…** | A browser; native exports also retain embedded project data for reimport. |
| Preserve this rendered appearance | **Export PNG image…** | Any image viewer. All rows are included, even when scrolled offscreen. |
| Exchange characters alone | **Export plain text…** or **Readable text / copy all…** | A text editor or another text workflow. |
| Paper or PDF copy | **Print…** | The browser's print dialog and chosen printer/PDF destination. |

PNG and Print render the whole field without gridlines, selection outlines, or the active cursor. PNG captures font fallback as pixels, so the receiving device does not need the same fonts. HTML includes the embedded default font, but other font choices or uncovered emoji may still vary by device. Plain text has no colours or styles and may wrap differently elsewhere. Keep the JSON editing original alongside any shared result.

## Choose what to learn next

- [Selections and the clipboard](manual.md#selections-and-the-clipboard): copy motifs, choose edge policies, and understand Ignore blanks with painted backgrounds.
- [Cell and brush colours](manual.md#cell-and-brush-colours): mix palette inheritance and individual colouring.
- [Shapes](manual.md#shapes): combine primary/secondary fills, line glyphs, and stroke widths.
- [The glyph palette](manual.md#the-glyph-palette) and [Glyph Colour Manager](manual.md#glyph-colour-manager): create a vocabulary of symbols, labels, and default colours.
- [Resize, skew, and properties](manual.md#resize-skew-and-properties): distinguish field boundaries from resampling and choose expansion deliberately.
- [File formats and exports](manual.md#file-formats-and-exports): learn what JSON, external HTML, text, and images preserve.

The field supports **1–512 cells per axis** and **65,536 cells total**. A palette holds **4,096 graphemes including reserved space**, and each grapheme is limited to **32 code points**. Imported files are limited to **16 MiB**. Operations that exceed the limits are rejected before replacing the drawing.

## If something goes wrong

| Symptom | What to try |
| --- | --- |
| GitHub shows source | Download the raw HTML or ZIP, then open the local editor file. |
| Tools do not fit | Scroll the ribbon, switch to Classic, or resize the window. Use Pan field for touch navigation. |
| A glyph looks like a box | Try the embedded font or an installed font that covers it; export PNG to preserve the appearance you can see. |
| Palette colours do not change a cell | It has a custom foreground. Restore inheritance through Cell colours. |
| Copy/paste to another app fails | Check clipboard permissions or try localhost. Readable text offers manual selection/copy, and internal copying retains styled cells. |
| Save leaves an asterisk | A download cannot confirm completion, or newer edits happened during direct Save. Verify the JSON copy or save the newest revision. |
| Save As is unavailable | Use Download project JSON; this context does not expose the native picker. |
| Reload shows a blank field | Open Recovery and select the intended checkpoint, or reopen your latest saved project. |
| Recovery reports unavailable/full | Save a project file, inspect the status detail, and check storage settings or old checkpoints. |
| A placement is rejected | Check Expand/Reject/Clip and the field limits. Expand cannot create a field above the size budget. |
| Touch dragging no longer draws | Turn off Pan field. |
| You cannot find the saved copy | Check the native picker's chosen folder or the browser's download list and numbered filenames. |

Use the [troubleshooting reference](manual.md#troubleshooting) for more detail. A helpful problem report includes the editor filename/version, browser and operating system/device, input method, exact steps, and a small project you can safely share.
