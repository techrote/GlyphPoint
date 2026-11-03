# Project license decision

**Status: the project owner has not yet selected a license for GlyphPoint.** No root `LICENSE` has been invented or inferred from dependencies. The versioned candidate and draft-release workflow are ready for the selected terms to be added.

## Decision to record

Choose the intended project license and the copyright-holder name to include. These are practical options, not an automatic selection:

| Option | Relevant distinction | Official reference |
| --- | --- | --- |
| MIT | Short permissive terms requiring preservation of the copyright and license notices. | [MIT license and application instructions](https://choosealicense.com/licenses/mit/) |
| Apache-2.0 | Permissive terms with an express contributor patent grant and additional notice/change requirements. | [Apache-2.0 overview](https://choosealicense.com/licenses/apache-2.0/) and [Apache text](https://www.apache.org/licenses/LICENSE-2.0) |
| Another owner-selected license | Use the terms that match the owner's intended distribution and contribution policy. | [Choose a License comparison](https://choosealicense.com/appendix/) |

The existing absence of a project license is not equivalent to an open-source grant. GitHub's [no-license explanation](https://choosealicense.com/no-permission/) describes that distinction.

## Concrete follow-through

After the owner identifies the terms and copyright name, add the selected exact text as the root `LICENSE`, set the matching SPDX expression in `package.json` where applicable, update the README and release notes, and retain the third-party notices. If the selected license requires an additional NOTICE file or change statements, include them as part of the same reviewed change.

Run the existing checks and exact-head CI, then use [the draft-release process](release-process.md). The manual workflow refuses to prepare a draft without the root license file; candidate ZIPs clearly report pending licensing in their manifest until that file exists.

## Bundled font has separate terms

The embedded DejaVu Sans Mono fonts already carry their own notice and redistribution terms, preserved in [LICENSE-DejaVu.txt](../assets/fonts/LICENSE-DejaVu.txt), the standalone HTML, and exported HTML. Their terms apply to the font software. They do not grant a license to GlyphPoint's application code. See [third-party notices](../THIRD_PARTY_NOTICES.md).
