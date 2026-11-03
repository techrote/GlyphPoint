# GlyphPoint

**A standalone, offline glyph-grid editor for coloured ASCII and Unicode artwork.** Draw with characters, compose text, arrange selections, and save editable projects from a desktop browser. Switch between a compact ribbon and a classic sidebar without changing the document.

## Start here

1. Download this repository using **Code → Download ZIP**, then extract it.
2. Open **[GlyphPoint-v1a-layout-fixed.html](GlyphPoint-v1a-layout-fixed.html)** in your browser. This is the maintained application. GitHub's source viewer does not run the editor.
3. Choose a glyph, select Pencil, and draw. Left click uses the primary glyph; right click uses the secondary.
4. Use **File → Save project** to download an editable JSON file. Keep that file: the canvas is not autosaved.

The application needs no installation, build step, account, server, or runtime dependency. For an optional local HTTP launch, run `python -m http.server 8000 --bind 127.0.0.1` from the repository and open [the editor on localhost](http://127.0.0.1:8000/GlyphPoint-v1a-layout-fixed.html). On Windows, `py -m http.server 8000 --bind 127.0.0.1` is an alternative.

## Documentation

| Document | Purpose |
| --- | --- |
| [New-user guide](docs/new-user-guide.md) | First launch, a first drawing, saving, reopening, and common surprises. |
| [Comprehensive instruction manual](docs/manual.md) | Every tool, palette control, selection operation, file format, shortcut, and limit. |
| [Agent/RAG reference](RAG.md) | Searchable, source-grounded architecture, invariants, schemas, and task-to-code routing. |
| [Agent working instructions](AGENTS.md) | How to make and verify changes in this repository. |
| [Contributor/developer guide](CONTRIBUTING.md) | Local setup, test commands, implementation conventions, and review expectations. |
| [Project format reference](docs/project-format.md) | JSON fields, normalization, compatibility, and HTML round trips. |
| [Quality audit](docs/quality-audit-2026-11-03.md) | Verified defects, repairs, evidence, and remaining limitations. |
| [Security and data handling](SECURITY.md) | Import/export trust boundaries, storage, and reporting guidance. |
| [Change log](CHANGELOG.md) | User-visible changes from the original uploaded versions. |

## Capabilities

- Pencil, flood fill, text placement, eraser, glyph picker, and magnifier.
- Circular, square, and rectangular brush tips; twelve line/shape choices with stroke and fill controls.
- Rectangular and free-form selections; move, copy, cut, paste, clear, crop, rotate, and mirror.
- Resize by cell count or percentage, skew, or extend/crop the field through Properties.
- A colour per glyph across the document, a shared field background, custom glyph labels, and reusable palettes/colourways.
- Editable JSON projects, plain-text interchange, and standalone HTML exports containing validated editable project data.
- Gridlines, rulers, 25–800% zoom, square cells, full screen, and browser printing.

## Files and compatibility

| File | Status |
| --- | --- |
| `GlyphPoint-v1a-layout-fixed.html` | Maintained application, including the November 2026 quality repairs. |
| `GlyphPoint-v1a.html` | Historical snapshot; not covered by the current fixes. |
| `GlyphPoint-v04a.html` | Earlier historical snapshot; not covered by the current fixes. |

The historical filenames stay in place for comparison and existing links. Use the maintained file for new work and imports. The application title no longer ambiguously says “v10”; filenames are not a stable project-schema version.

A field can be **1–512 cells per axis**, with **at most 65,536 cells overall**. Imports are limited to **16 MiB** and palettes to **4,096 entries including a reserved space**. These bound allocations; they are not a guarantee of smooth maximum-size editing on every device. One cell holds one Unicode code point, not a complete multi-code-point emoji or grapheme. See the manual for font and colour-model limitations.

Palette choices and interface mode can persist in local browser storage. Artwork remains in memory until you download a project. Saving requests a browser download and does not overwrite the opened file in place. Exporting text or HTML does not mark an unsaved project as saved.

## Development checks

Node.js 22 or newer is used for development only. Node 24 is used in CI.

```sh
npm run check
npm test
npm ci
npx playwright install chromium firefox
npm run test:browser
```

The first two commands use only Node's standard library. Browser tests use the pinned Playwright development dependency and run the actual standalone HTML in Chromium and Firefox. On a minimal Linux machine, use `npx playwright install --with-deps chromium firefox` to install browser system dependencies as well.

The [Quality workflow](.github/workflows/quality.yml) has two bounded jobs: static/documentation plus editor regressions, and both browser suites. Superseded runs on the same PR/ref are cancelled. There is no application bundler or package-publication step.

## License status

No project license was present in the audited repository, and this pass does not choose one on the owner's behalf. Dependency licenses do not establish a license for GlyphPoint itself.
