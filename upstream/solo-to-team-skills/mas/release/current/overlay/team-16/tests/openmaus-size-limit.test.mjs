import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../source/web/core.js');
const adapters = require('../source/web/adapters.js');
const rooms = require('../source/web/rooms.js');
const roster = JSON.parse(await readFile(new URL('./fixtures/roster-lock.json', import.meta.url)));
const LIMIT = 4 * 1024 * 1024;

function fixture(mode, expanded = true, edge = 'oversized') {
  const team = {
    format: core.format, version: core.version,
    id: 'boundary-team', name: 'Package boundary fixture',
    roles: roster.roles.map(role => ({...role, responsibility: 'x', avatar: null})),
    groups: roster.groups.map(group => ({...group, members: [...group.members], purpose: 'x'})),
    workflow: {dispatch: 'seat-chief', produce: 'seat-production', review: 'seat-review', deliver: 'seat-chief'}
  };
  if (expanded) {
    for (let i = 16; i < 200; i++) {
      team.roles.push({id: 'boundary-role-' + i, name: 'Boundary Role ' + i, responsibility: 'x', avatar: null});
    }
    // Preserve the legacy oversized reproducer. Edge inputs are measured below so
    // explanatory copy can change without moving the externally required limit.
    const profiles = {
      direct: {oversized: [17764, 74], seed: [1, 0]},
      'six-rooms': {oversized: [17758, 35], seed: [1, 0]}
    };
    const [length, longerCount] = profiles[mode][edge];
    team.roles.forEach((role, i) => {role.responsibility = 'x'.repeat(length + (i < longerCount ? 1 : 0));});
  }
  assert.deepEqual(core.normalize(team), team);
  assert.ok(Buffer.byteLength(JSON.stringify(team)) < core.maxDocument);
  return team;
}

function exportTeam(team, mode) {
  return mode === 'direct'
    ? adapters.exportOpenMausBot(team)
    : rooms.build(team, team.groups.map(group => ({id: group.id, responder: {kind: 'mentions'}})));
}

const serialize = value => JSON.stringify(value, null, 2) + '\n';

function assertComplete(output, input, mode) {
  assert.deepEqual(output.package.agents.map(agent => agent.key), input.roles.map(role => role.id));
  output.package.agents.forEach((agent, i) => {
    const line = agent.soul.split('\n').find(value => value.startsWith('{"roleId":'));
    assert.ok(line, 'Each exported role must retain its role-data record.');
    const data = JSON.parse(line);
    assert.equal(data.roleId, input.roles[i].id);
    assert.equal(data.responsibility, input.roles[i].responsibility, 'Do not truncate responsibilities to fit.');
  });
  if (mode === 'six-rooms') {
    assert.deepEqual(output.package.rooms.map(room => ({id: room.key, members: room.members})),
      input.groups.map(group => ({id: group.id, members: group.members})));
  }
}

async function edgeFixture(mode, delta) {
  const input = fixture(mode, true, 'seed');
  const seedBlob = await exportTeam(input, mode);
  const seedText = await seedBlob.text();
  const expected = JSON.parse(seedText);
  // Require the file representation independently; do not find the boundary by
  // searching for what the exporter accepts, or import its size-limit constant.
  assert.equal(seedText, serialize(expected));
  const seedBytes = Buffer.byteLength(seedText);
  assert.equal(seedBlob.size, seedBytes);
  assertComplete(expected, input, mode);
  const targetBytes = LIMIT + delta;
  const total = targetBytes - seedBytes + input.roles.length;
  assert.ok(total >= input.roles.length);
  const length = Math.floor(total / input.roles.length);
  const remainder = total % input.roles.length;
  input.roles.forEach((role, i) => {
    role.responsibility = 'x'.repeat(length + (i < remainder ? 1 : 0));
    const marker = '"responsibility":"x"';
    const agent = expected.package.agents[i];
    assert.equal(agent.soul.split(marker).length, 2, 'The seed must contain exactly one responsibility value.');
    agent.soul = agent.soul.replace(marker, '"responsibility":' + JSON.stringify(role.responsibility));
  });
  assert.deepEqual(core.normalize(input), input);
  assert.ok(Buffer.byteLength(JSON.stringify(input)) < core.maxDocument);
  const expectedText = serialize(expected);
  assert.equal(Buffer.byteLength(expectedText), targetBytes);
  return {input, expectedText, seedBytes};
}

for (const mode of ['direct', 'six-rooms']) {
  for (const [edge, delta] of [['under', -1], ['exact', 0], ['over', 1]]) {
    test(`OpenMaus ${mode}: final file at 4 MiB ${delta < 0 ? '- 1' : delta > 0 ? '+ 1' : 'exactly'} byte`, async t => {
      const {input, expectedText, seedBytes} = await edgeFixture(mode, delta);
      if (mode === 'six-rooms') {
        const departmentOnly = adapters.exportOpenMausBot(input);
        assert.ok(departmentOnly.size < LIMIT, 'The six-room edge must exercise the room serializer, not fail in the department serializer.');
      }
      if (delta > 0) {
        await assert.rejects(async () => exportTeam(input, mode), /4\s*MiB/u);
      } else {
        const blob = await exportTeam(input, mode);
        assert.equal(blob.size, LIMIT + delta);
        const actualText = await blob.text();
        assert.equal(actualText, expectedText);
        assertComplete(JSON.parse(actualText), input, mode);
        t.diagnostic(JSON.stringify({mode,edge,seedBytes,blobBytes:blob.size}));
      }
    });
  }
  test(`OpenMaus ${mode}: every returned Blob must fit the actual 4 MiB file limit`, async t => {
    // Positive control: the same path must still export the complete 16-role roster.
    const small = await exportTeam(fixture(mode, false), mode);
    assert.ok(small.size < LIMIT);
    const smallDoc = JSON.parse(await small.text());
    assert.equal(smallDoc.package.agents.length, 16);
    if (mode === 'six-rooms') assert.equal(smallDoc.package.rooms.length, 6);

    const team = fixture(mode);
    let blob;
    try {
      blob = await exportTeam(team, mode);
    } catch (error) {
      // Rejecting the final oversized file is a valid fix. Other failures are not.
      assert.match(error.message, /4\s*MiB/u);
      return;
    }
    const output = JSON.parse(await blob.text());
    assert.equal(output.package.agents.length, 200, 'Do not silently drop roles to fit.');
    if (mode === 'six-rooms') {
      assert.equal(output.package.rooms.length, 6);
      assert.equal(output.package.rooms.reduce((n, room) => n + room.members.length, 0), 26);
      assert.ok(output.package.rooms.every(room => room.bulletin.length <= 12000));
    }
    const compactBytes = Buffer.byteLength(JSON.stringify(output));
    const briefBytes = Buffer.byteLength(output.package.team.brief);
    const maxSoulBytes = Math.max(...output.package.agents.map(agent => Buffer.byteLength(agent.soul)));
    assert.ok(briefBytes <= 24000);
    assert.ok(maxSoulBytes <= 24000);
    assert.ok(compactBytes <= LIMIT, 'This reproduces the final serialization gap, not the existing compact limit.');
    t.diagnostic(JSON.stringify({mode,roles:200,groups:6,memberships:26,compactBytes,blobBytes:blob.size,
      overLimit:blob.size-LIMIT,briefBytes,maxSoulBytes}));
    assert.ok(blob.size <= LIMIT, `Returned ${blob.size}-byte Blob exceeds ${LIMIT} by ${blob.size-LIMIT} bytes despite passing the compact-JSON check.`);
  });
}
