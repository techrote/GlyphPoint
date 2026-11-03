# Third-party notices

## Embedded DejaVu Sans Mono 2.37

The maintained application embeds the regular, bold, oblique, and bold-oblique faces of **DejaVu Sans Mono 2.37**. The source TTF files came from the environment's Debian `fonts-dejavu-core` package. Their font-table copyright and license notices identify Bitstream Vera terms and public-domain DejaVu changes.

FontTools converted the TTF containers to WOFF compression without changing outlines or font names. The WOFF bytes are stored as data URLs in [assets/fonts/fonts.css](assets/fonts/fonts.css). [manifest.json](assets/fonts/manifest.json) records the source TTF and resulting WOFF SHA-256 values for each face. Conversion is a one-time asset preparation step; builds require only Node and use the checked-in bytes.

The complete accompanying notice is [LICENSE-DejaVu.txt](assets/fonts/LICENSE-DejaVu.txt). The build includes that notice in the standalone application, and native HTML exports include it along with the embedded font. Keep the notice when redistributing these fonts. Upstream references: [DejaVu project](https://dejavu-fonts.github.io/) and [font license](https://dejavu-fonts.github.io/License.html).

The embedded faces improve portability for their character coverage. They are not an all-Unicode font collection. Other selected fonts and unsupported characters can use device fallback; PNG export preserves the pixels rendered for sharing.

## Development tools

Playwright is a development-only dependency recorded in `package-lock.json`; it is not included as executable runtime code in the standalone editor or artwork exports. Node, Python used for manual validation, and FontTools are development/environment tools. Their licenses do not determine the license of GlyphPoint's application source.

## Project license

The application's project-license selection is recorded separately in [docs/license-decision.md](docs/license-decision.md). This notice does not supply project licensing by implication.
