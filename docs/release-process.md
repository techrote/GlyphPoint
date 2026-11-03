# Release process

GlyphPoint now has a reproducible release-candidate package, source hashes, release notes, and a guarded draft-release workflow. The current candidate is **2.0.0-rc.1**. Packaging does not itself publish a GitHub Release or select the project's license.

## Build and inspect a candidate

Use Node 22 or newer from a checkout of the intended commit:

```sh
npm run build
npm run check
npm test
npm run release:package
```

`scripts/release.cjs` creates three files in `dist/`:

| Artifact | Contents |
| --- | --- |
| `GlyphPoint-2.0.0-rc.1.zip` | Repository source, the maintained standalone application, documentation, tests, and font notices. Open `GlyphPoint-v1a-layout-fixed.html` after extraction. Historical HTML snapshots retain their existing filenames. |
| `GlyphPoint-2.0.0-rc.1.zip.sha256` | SHA-256 checksum of the ZIP. |
| `release-manifest.json` | Package version, source commit, whether the working tree contained changes, license status, application entry point, and the SHA-256/size of each packaged file. |

The ZIP also contains `RELEASE-MANIFEST.json`. File ordering and ZIP timestamps are deterministic. The same files, commit, and clean/dirty status produce the same archive bytes. Node's built-in compression, filesystem, crypto, and process libraries perform packaging; end users need none of them.

The script excludes ignored files, including `node_modules/`, `dist/`, and browser reports. It packages regular tracked files only and rejects symlinks and the reserved root `RELEASE-MANIFEST.json` path. Stage newly added source files before a local candidate build; untracked files are excluded. Check the manifest before sharing a package built from a working tree. Use a clean exact commit for an official release. The font asset provenance and separate license are in [third-party notices](../THIRD_PARTY_NOTICES.md).

## Automated candidate artifacts

The source/checks job in [Quality](../.github/workflows/quality.yml) packages its exact checkout after static and Node tests pass, then attaches the candidate as a GitHub Actions artifact with a 14-day retention period. Its artifact name contains the checkout SHA. A PR artifact can identify GitHub's generated merge commit; consult both the manifest and the run's PR head before treating it as accepted `main`.

That artifact is useful for reviewing the candidate before integration. Browser jobs must also pass on the intended head. A passing packaging job alone does not qualify browser behavior.

## Prepare a GitHub draft release

The [Prepare draft release workflow](../.github/workflows/release.yml) is deliberately manual. It operates on `main`, requires a nonempty root `LICENSE`, and requires a successful **Quality push run on the exact same commit**. It then checks source/docs, runs Node regressions, packages the candidate, and creates a draft prerelease with the ZIP, checksum, manifest, and [candidate notes](../releases/v2.0.0-rc.1.md).

The remaining owner decision is recorded in [License decision](license-decision.md). Once the selected license and notices have been reviewed and committed:

1. Wait for the new `main` commit's complete Quality run to pass.
2. Open **Actions → Prepare draft release → Run workflow**, using `main`.
3. Inspect the draft's target tag, manifest source commit, assets, checksums, notes, and qualification links.
4. Publish the draft when the owner is ready to distribute that candidate. Keep the prerelease flag until the release's stated acceptance criteria are satisfied.

The workflow cannot run on an arbitrary branch, replace an existing release, or silently turn a prerelease into a final release. If a tag already exists at another commit, stop and choose a new version; do not move a published tag.

## Versioning and acceptance

The repository package version names the application candidate; the historical HTML filename remains the stable entry point. `glyphpoint-v3` independently names the project data format. Do not infer one from the other.

For each future candidate, update `package.json`, its root `package-lock.json` version, `CHANGELOG.md`, and a matching `releases/vVERSION.md`. Keep instructions, RAG contracts, and project migrations current. Qualify the exact commit with the bounded CI profiles in [Platform qualification](platform-qualification.md).

Automation provides evidence for the tested engines and hosted operating systems. The physical-device and assistive-technology records remain separate acceptance evidence. A draft does not imply those checks have been performed.

GitHub documents the distinction between [draft releases and publication](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) and its [release assets](https://docs.github.com/en/rest/releases/assets).
