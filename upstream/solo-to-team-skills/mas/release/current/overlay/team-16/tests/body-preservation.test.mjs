'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const Core = createRequire(import.meta.url)('../source/web/core.js');

test('role duties retain indentation, line endings and Unicode code points', () => {
  const team = Core.initial();
  const body = '\n    if ready:\r\n\tprint("Cafe\u0301")  \n';
  team.roles[0].responsibility = body;
  const original = JSON.stringify(team);
  assert.equal(Core.importDefinition(JSON.parse(original)).team.roles[0].responsibility, body);
  assert.equal(JSON.stringify(team), original);
});

test('group purposes retain exact leading and trailing whitespace', () => {
  const team = Core.initial();
  const body = '    Preserve this code block\n\tCafe\u0301\r\n\n';
  team.groups[0].purpose = body;
  assert.equal(Core.normalize(team).groups[0].purpose, body);
});

test('names continue to trim and normalize Unicode', () => {
  const team = Core.initial();
  team.name = '  Cafe\u0301  ';
  team.roles[0].name = '  Le\u0301ad  ';
  team.groups[0].name = '  Cafe\u0301 group  ';
  const got = Core.normalize(team);
  assert.equal(got.name, 'Caf\u00e9');
  assert.equal(got.roles[0].name, 'L\u00e9ad');
  assert.equal(got.groups[0].name, 'Caf\u00e9 group');
});

test('missing or whitespace-only bodies remain invalid in both languages', () => {
  for (const lang of ['zh', 'en']) {
    for (const value of ['', ' \n\r\t ', null, 0, {}, []]) {
      const role = Core.initial(); role.roles[0].responsibility = value;
      const group = Core.initial(); group.groups[0].purpose = value;
      assert.throws(() => Core.normalize(role, lang));
      assert.throws(() => Core.normalize(group, lang));
    }
  }
});
