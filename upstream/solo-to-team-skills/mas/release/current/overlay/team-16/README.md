# 16-role / 6-group builder — integrated release candidate

The preset contains the reviewed Chinese role cards, their English counterparts, 16 neutral icons and the six groups' executable summaries. Role and group IDs, order and 26 suggested memberships follow the independent public roster lock. Full bilingual group rules accompany the template. This is an integrated release candidate; native-host acceptance is documented separately.

用户上手：[中文安装指引](SETUP.zh.md) · [English setup](SETUP.en.md)。先保存自己的团队配置，再按所选宿主安装。公开展示的人物头像不在这份模板中。

## Single source and interfaces

- `source/presets/team.zh.json` and `team.en.json` own all preset text. Both use the unchanged `solo-to-team.definition` 1.0.0 schema.
- `source/build.mjs` exports `async presetScript(): Promise<string>`. Importing the module does not build or write files. The generated script declares `TeamPreset` and also sets `window.TeamPreset` when a window exists.
- `TeamPreset.initial(lang = 'zh')` returns a fresh, deeply independent neutral definition. `en` selects English; omitted or other values select Chinese. The call does not read or mutate any UI state.
- The build rejects invalid neutral definitions, counts other than 16 roles / 6 groups / 26 memberships, and different IDs, order, membership or workflow across locales.
- `modulesInOrder()` and `build()` remain available for embedding and deterministic builds; `sha256(bytes)` is a convenience helper. `team-preset.js` is generated in memory, as is the inherited WorkBuddy asset module.

The app initializes from `TeamPreset.initial(currentLanguage)` once and selects `workflow.dispatch`. Later interface language changes rerender labels and preserve the current team, imported content and edits. There is no positional three-entry translation array.

## Build and focused checks

From this component directory:

```sh
node source/build.mjs
node source/build.mjs --check
node --test tests/*.test.mjs
```

Default build output is `index.html` beside this README. Existing different output is never silently overwritten: build to a new path and reconcile it explicitly after review. `--check` compares the committed component to a fresh in-memory rebuild; it does not redefine any RC5/rc.3 fingerprint.

The tests use the independent roster copied to `tests/fixtures/roster-lock.json`; that snapshot contains only public names, IDs and membership. Expected workflow IDs are explicit in the test. The other fixture locks inherited module/asset hashes. The checks cover both locale presets, deep-copy behavior, actual app initialization and language events with a minimal Node DOM harness, four adapter structures including the two ZIP formats, CSP embedding and inherited bytes. The harness does not claim a real browser or host UI run.

## Integration handoff

The intake page can import `presetScript` from this component's `source/build.mjs` and `await presetScript()` when assembling its scripts. Both entry pages must embed that same generated text rather than copy role content into another source file.

The two preset JSON files are the editable source of the current role cards, icons and group summaries. Full rules are in `source/presets/groups.zh.md` and `groups.en.md`, mirrored under `rules/` for direct reading. Any reviewed text revision must update these sources together, preserve the summary-to-full-rule correspondence, rebuild both entry pages, and rerun affected structural and byte-budget checks. Do not truncate group purposes mechanically. The full-rule download and supported platform archives contain the references; their presence does not mean a host loaded them.

The neutral schema is unchanged. Ten inherited module and asset files retain their recorded bytes. Seven source files have documented candidate revisions; `tests/fixtures/known-patches.json` records their original and current hashes and patch history, including the body-preserving core validator. Historical executable source and its hashes are unchanged; the current product updates only its legacy rights/source-scope documents and dependent checksum file for the approved MIT scope. See [NOTICE](../NOTICE). These changes do not grant account permissions or alter host settings. Native observations and their limits are recorded in [the verification notes](VERIFICATION.en.md).


## Candidate adapter semantics

OpenMaus preserves the commissioning sources, registered handoffs and direct-user exits described by specialist cards. The default four-stage production workflow applies only when chosen for the task; it does not replace every specialist task. Returns for revision go to the actual executor. Role/group data grants no new tool, data or external-action authority. An exported approval field is only file data, not proof that the host applied it.

WorkBuddy retains lead-only tool transport. A relayed task must preserve its real commissioning officer or user, verifiable original request, authorized scope and original return recipient. The lead is not allowed to impersonate a specialist officer or absorb private results. Registered handoffs are honestly labeled as relays. Where private consultation or required direct reporting cannot be supported, disclose the capability gap without the protected content; do not invent an independent channel or claim complete host equivalence.

Grok role files retain the legacy groups ID list and add group_context with each applicable executable group summary, members and full-rule paths/anchors. Each card is the same object represented in grok-plan.json. GrokPlan.rosterPlan(team, batch, {ruleFiles}) accepts an optional list of paths actually added by the archive builder; omitted paths are marked as not attached. rule_loading.automatic remains false.

When TeamPreset.ruleReferences() exists, DSH, WorkBuddy and Grok ZIPs actually include each returned {path, content} entry. The expected complete rule files are references/template-rules/groups.zh.md and groups.en.md, plus their README. DSH's SKILL.md and start guide, every WorkBuddy role card and its README, and Grok's role cards and start guide explain where to obtain/check the applicable rules. Without the optional API they explicitly state that full rules are not included. These are default-template references: they do not overwrite current edited definitions and are not automatically loaded or new authority. OpenMaus JSON retains summaries; its separate companion download is handled by the builder UI.

Focused regression tests: tests/adapter-semantics.test.mjs. The existing full-preset test now covers both languages, 16 supplied avatars and all three archives' actual rule bytes. Its Image replacement reads image metadata only, allowing PNG/JPEG passthrough tests; it is not a browser decoder, visual review or host acceptance. No final component bundle is generated by this semantic patch task.

The typography-only `input-typography.patch` retains the original CSS hash alongside its candidate hash; the original CSS is unchanged in the historical source. The configuration ID input has a 16px minimum, and the root font follows browser preferences. This is a static/source change, not a mobile browser acceptance result.
