'use strict';
// A literal-name advisory only: no semantic dependency, authority or permission inference.
const RoleMentions = (() => {
  const text = value => typeof value === 'string' ? value : '';
  const key = value => text(value).normalize('NFC').trim().toLowerCase();

  function createCatalog(templates) {
    const roles = new Map();
    for (const team of templates) for (const role of team.roles) {
      if (!roles.has(role.id)) roles.set(role.id, {id: role.id, names: []});
      const entry = roles.get(role.id);
      if (key(role.name) && !entry.names.some(name => key(name) === key(role.name))) entry.names.push(role.name);
    }
    return [...roles.values()];
  }

  function find(team, catalog) {
    const presentIDs = new Set(team.roles.map(role => role.id));
    const presentNames = new Set(team.roles.map(role => key(role.name)));
    const absent = catalog.filter(role => !presentIDs.has(role.id) && !role.names.some(name => presentNames.has(key(name))));
    const sources = [
      ...team.roles.map(role => ({kind: 'role', id: role.id, name: role.name, content: role.responsibility})),
      ...team.groups.map(group => ({kind: 'group', id: group.id, name: group.name, content: group.purpose}))
    ];
    return sources.flatMap(source => {
      const content = key(source.content);
      const mentions = absent.flatMap(role => {
        const names = role.names.filter(name => content.includes(key(name)));
        return names.length ? [{roleId: role.id, names: [...names]}] : [];
      });
      return mentions.length ? [{kind: source.kind, id: source.id, name: source.name, mentions}] : [];
    });
  }
  return Object.freeze({createCatalog, find});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RoleMentions;

