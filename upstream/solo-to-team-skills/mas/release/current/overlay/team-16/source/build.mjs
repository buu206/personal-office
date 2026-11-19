import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const TeamDefinition = createRequire(import.meta.url)('./web/core.js');

const source = new URL('./', import.meta.url);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function text(relative) {
  return (await readFile(new URL(relative, source), 'utf8')).replaceAll('\r\n', '\n');
}

// Both entry pages embed this script. Only the JSON files own preset text.
export async function presetScript() {
  const presets = {};
  for (const lang of ['zh', 'en']) {
    const team = TeamDefinition.normalize(JSON.parse(await text('presets/team.' + lang + '.json')), lang);
    if (team.roles.length !== 16 || team.groups.length !== 6 ||
        team.groups.reduce((n, group) => n + group.members.length, 0) !== 26) {
      throw Error('Public preset must retain 16 roles, 6 groups and 26 memberships: ' + lang);
    }
    presets[lang] = team;
  }
  const topology = team => ({
    id: team.id, roles: team.roles.map(role => role.id),
    groups: team.groups.map(({id, members}) => ({id, members})), workflow: team.workflow
  });
  if (JSON.stringify(topology(presets.zh)) !== JSON.stringify(topology(presets.en))) {
    throw Error('Preset locales must share IDs, order, group membership and workflow.');
  }
  const data = JSON.stringify(presets).replace(/[<\u2028\u2029]/gu,
    ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
  const references = [{path:'references/template-rules/README.md',content:
    '# 默认模板规则参考 / Default-template rule reference\n\n'+
    '本目录附完整的中英六群规则，供选用默认模板时阅读。你本次导出的岗位和群记录保留当前编辑；这些参考文字不得覆盖你的明确修改。按任务向相应助手提供适用小节，并核对它实际读到的内容。群名册不授予权限，文件存在不等于规则已启用。\n\n'+
    'These are the complete Chinese and English rules for the default template. The role and group records in your current export retain your edits; this reference must not override them. Provide the relevant sections to each assistant and verify what it received. Hosts do not automatically load these files. A group roster grants no permissions, and a saved file does not activate a rule.\n'}];
  for (const lang of ['zh','en']) references.push({
    path:'references/template-rules/groups.'+lang+'.md',
    content:await text('presets/groups.'+lang+'.md')
  });
  const referenceData = JSON.stringify(references).replace(/[<\u2028\u2029]/gu,
    ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
  return `'use strict';
const TeamPreset=(()=>{
  const presets=${data};
  const references=${referenceData};
  return Object.freeze({
    initial(lang='zh'){return JSON.parse(JSON.stringify(presets[lang==='en'?'en':'zh']));},
    ruleReferences(){return references.map(item=>({...item}));}
  });
})();
if(typeof window!=='undefined')window.TeamPreset=TeamPreset;
`;
}

async function templateScript() {
  const template = JSON.parse(await text('assets/workbuddy.json'));
  const avatars = {};
  for (const name of ['team', 'team-lead', 'production', 'review']) {
    const bytes = await readFile(new URL('assets/icons/' + name + '.png', source));
    avatars[name] = bytes.toString('base64');
  }
  const shell = await text('web/template.js.in');
  return shell.replace('__WORKBUDDY_TEMPLATE__', () => JSON.stringify({ ...template, avatars }));
}

export async function modulesInOrder() {
  const html = await text('web/index.html');
  const pattern = /<script src="([a-z][a-z0-9-]*\.js)" defer><\/script>/g;
  const names = [...html.matchAll(pattern)].map(match => match[1]);
  if (new Set(names).size !== names.length || !names.includes('template.js') || !names.includes('team-preset.js') || names.at(-1) !== 'app.js') {
    throw Error('Expected unique local scripts, a WorkBuddy template, and the UI entry last.');
  }
  const scripts = [];
  for (const name of names) {
    const code = name === 'template.js' ? await templateScript() : name === 'team-preset.js' ? await presetScript() : await text('web/' + name);
    if (/<\/script/i.test(code)) throw Error('Unsafe closing script tag in ' + name);
    scripts.push({ name, code });
  }
  return { html, pattern, scripts };
}

export async function build() {
  const { html, pattern, scripts } = await modulesInOrder();
  const css = await text('web/builder.css');
  const cspHash = code => "'sha256-" + createHash('sha256').update(code).digest('base64') + "'";
  const embedded = scripts.map(({ code }) => '<script>' + code + '</script>').join('');
  return html
    .replace('<link rel="stylesheet" href="builder.css">', () => '<style>' + css + '</style>')
    .replace(pattern, '')
    .replace('</body>', () => embedded + '</body>')
    .replace("style-src 'self'", () => 'style-src ' + cspHash(css))
    .replace("script-src 'self'", () => 'script-src ' + scripts.map(({ code }) => cspHash(code)).join(' '));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [arg, ...extra] = process.argv.slice(2);
  if (extra.length) throw Error('Usage: node build.mjs [new-output.html | --check]');
  const bytes = Buffer.from(await build());
  const actual = sha256(bytes);
  if (arg === '--check') {
    const output = new URL('../index.html', source);
    if (!(await readFile(output)).equals(bytes)) throw Error('Generated team-16/index.html differs from source.');
    console.log(actual + '  exact team-16 component');
  } else {
    const output = arg || new URL('../index.html', source);
    try {
      await writeFile(output, bytes, { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!(await readFile(output)).equals(bytes)) {
        throw Error('A different file exists. Choose a new output name: ' + output);
      }
    }
    console.log(actual + '  ' + output);
  }
}
