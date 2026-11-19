# Rebuild the offline page

From the parent directory:

```sh
node source/build.mjs 带底稿开工.html
```

Node's standard library embeds the HTML, CSS and scripts into one file, with SHA-256 Content Security Policy entries. No install or network is required. If a different file already exists at the destination, supply a new filename.

Build from the complete overlay tree: this page imports the shared 16-role preset generator from `../../team-16/source/build.mjs`. `index.html` is a build template; the `team-preset.js` script is generated in memory and embedded by the build. Open the built page, not this template.

The default configuration contains 16 roles, six groups and 26 suggested memberships. These are portable configuration entries, not a claim that a host has already created or activated all roles and groups. An explicitly imported team replaces the preset for that project.

- The historical `vendor/core.js`, `vendor/adapters.js` and `vendor/zip-store.js` retain their original bytes. Only the ZIP module is loaded from that directory. The build uses `../../team-16/source/web/core.js` and `../../team-16/source/web/adapters.js`, sharing exact duty/group-description preservation, specialist routing and full-rule attachments with the team editor.
- `project.js` uses the native DSH adapter to create the original project in memory, keeps its role/roster/workflow structure, appends fixed intake guidance, and packages the selected binary sources via the existing stored ZIP writer. It does not extract or execute user archives. For standard Office formats it reads the ZIP directory to check the container shape.
- `page.js` owns transient form state, scope selection, cancellation and download. The user's task fields are JSON data. Numbered paths protect duplicate, non-ASCII and reserved names across common filesystems.

The project-authored component uses [MIT](../../LICENSE), including commercial use, within the scope and exclusions in [NOTICE](../../NOTICE). Earlier original skills retain their own license and notices. This is a release candidate.
