# Offline updater source

Run from the parent directory with an existing Node runtime:

```sh
node source/build.mjs 更新我的团队.html
```

No external package is needed. Keep the sibling `team-16` source directory in place: the source page and builder explicitly use `../../team-16/source/web/core.js`. The builder embeds that shared validator, scripts and styles with content hashes, and preserves a different existing output file. Role responsibilities and group purposes retain their exact text, including indentation, line endings and Unicode code points; names retain their existing normalization rules.

The local `core.js` is retained only as the unchanged historical 0.2.2b project-authored validator, SHA-256 `7c9d067165ad9fdc6f1e80d90a20fb6d68102d074f8fe6217fe48e2a74d2d58f`. It is not the current page's validator. Missing shared source stops the build; it does not silently fall back to this historical copy.

- `merge.js` uses stable IDs and field snapshots from normalized definitions. Local changes survive unless the owner explicitly selects another value for the same field or complete entity. Base membership and order are compared separately.
- `app.js` keeps the three input files and decisions in memory, renders user data as text or validated raster images, and downloads a newly normalized definition after reference and independent-review checks.
- `index.html` and `update.css` provide the bilingual local UI. The three fictional input examples and their sample output carry no account identities or native permissions.

Run `node --test source/tests/body-preservation.test.mjs` from the parent directory for the focused regression. It builds the actual HTML, executes its import/decision/download callbacks with a Node DOM substitute, and reads the resulting JSON. It covers text preservation, local/upstream/conflicting edits, role references and independent production/review; it is not browser or native-host acceptance.

The project-authored component uses [MIT](../../LICENSE), including commercial use, within the scope and exclusions in [NOTICE](../../NOTICE). Earlier original skills retain their own license and notices. This is a release candidate.
