# Change log

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
