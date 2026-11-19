// Local simulation only: no model, network, clock-based work, or hidden progress.
export const SCHEMA = 'personal-office.demo';
export const VERSION = 1;
export const MAX_PROJECTS = 30;
export const STAGES = Object.freeze([
  { id: 'research', name: '研究整理' },
  { id: 'write', name: '内容撰写' },
  { id: 'design', name: '视觉设计' },
  { id: 'review', name: '审核校对' },
]);
const fail = message => { throw new Error(message); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function string(v, name, max, empty = false) {
  if (typeof v !== 'string' || v.length > max || (!empty && !v.trim())) fail(`${name}格式不正确`);
  return v;
}
function keys(v, expected, name) {
  if (!object(v) || Object.keys(v).sort().join(',') !== [...expected].sort().join(',')) fail(`${name}结构不受支持`);
}
function copy(state) { validateState(state); return JSON.parse(JSON.stringify(state)); }
function normalizeTeam(team) {
  if (!object(team) || !Array.isArray(team.roles) || team.roles.length < 1 || team.roles.length > 200) fail('团队需要1至200个角色');
  const result = {
    id: string(team.id, '团队标识', 200), name: string(team.name, '团队名称', 200),
    roles: team.roles.map(role => {
      if (!object(role)) fail('角色结构不正确');
      return { id: string(role.id, '角色标识', 200), name: string(role.name, '角色名称', 200),
        duty: string(role.duty ?? role.responsibility ?? '', '角色职责', 32000, true) };
    }),
  };
  if (new Set(result.roles.map(r => r.id)).size !== result.roles.length) fail('角色标识不能重复');
  return result;
}

export function createState(team = { id: 'demo-team', name: '示例协作团队', roles: [
  { id: 'coordinator', name: '协调员' }, { id: 'researcher', name: '研究员' },
  { id: 'writer', name: '撰写员' }, { id: 'designer', name: '设计师' }, { id: 'reviewer', name: '审核员' },
] }) {
  const normalized = normalizeTeam(team);
  return { schema: SCHEMA, version: VERSION, team: normalized, projects: [],
    selectedProject: null, selectedRole: normalized.roles[0].id, draft: '' };
}

export function validateState(state) {
  keys(state, ['schema', 'version', 'team', 'projects', 'selectedProject', 'selectedRole', 'draft'], '保存文件');
  if (state.schema !== SCHEMA || state.version !== VERSION) fail('不支持的保存文件版本');
  keys(state.team, ['id', 'name', 'roles'], '团队');
  normalizeTeam(state.team);
  for (const role of state.team.roles) keys(role, ['id', 'name', 'duty'], '角色');
  string(state.draft, '任务输入', 2000, true);
  if (!state.team.roles.some(r => r.id === state.selectedRole)) fail('选中的角色不存在');
  if (!Array.isArray(state.projects) || state.projects.length > MAX_PROJECTS) fail('最多保存30个演示项目');
  const ids = new Set();
  for (const project of state.projects) {
    keys(project, ['id', 'title', 'progress', 'status'], '项目');
    string(project.id, '项目标识', 200); string(project.title, '任务描述', 2000);
    if (ids.has(project.id)) fail('项目标识不能重复');
    ids.add(project.id);
    if (!Number.isInteger(project.progress) || project.progress < 0 || project.progress > 100) fail('项目进度不正确');
    if (!['running', 'paused', 'completed'].includes(project.status)) fail('未知项目状态');
    if ((project.progress === 100) !== (project.status === 'completed')) fail('完成状态与进度不一致');
    if (project.status === 'running' && project.id !== state.selectedProject) fail('非当前项目不能继续演示');
  }
  if ((state.projects.length === 0 && state.selectedProject !== null) ||
      (state.projects.length > 0 && !ids.has(state.selectedProject))) fail('选中的项目不存在');
  return state;
}

export function createProject(state, title) {
  const next = copy(state);
  string(title, '任务描述', 2000);
  if (next.projects.length >= MAX_PROJECTS) fail('已保存30个演示项目，请先导出备份');
  for (const project of next.projects) if (project.status === 'running') project.status = 'paused';
  const id = globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (next.projects.some(p => p.id === id)) fail('项目标识冲突，请重试');
  next.projects.unshift({ id, title: title.trim(), progress: 0, status: 'running' });
  next.selectedProject = id;
  next.draft = '';
  return next;
}

export function activeProject(state) {
  return state.projects.find(p => p.id === state.selectedProject) ?? null;
}

export function tick(state, step = 2) {
  if (!Number.isInteger(step) || step < 1 || step > 100) fail('演示步长不正确');
  const next = copy(state), project = activeProject(next);
  if (project?.status === 'running') {
    project.progress = Math.min(100, project.progress + step);
    if (project.progress === 100) project.status = 'completed';
  }
  return next;
}

export function togglePause(state) {
  const next = copy(state), project = activeProject(next);
  if (project && project.status !== 'completed') project.status = project.status === 'running' ? 'paused' : 'running';
  return next;
}

export function selectProject(state, id) {
  const next = copy(state);
  if (!next.projects.some(p => p.id === id)) fail('项目不存在');
  if (id !== next.selectedProject) {
    for (const project of next.projects) if (project.status === 'running') project.status = 'paused';
    next.selectedProject = id;
  }
  return next;
}

export function selectRole(state, id) {
  const next = copy(state);
  if (!next.team.roles.some(role => role.id === id)) fail('角色不存在');
  next.selectedRole = id;
  return next;
}

export function setDraft(state, text) {
  string(text, '任务输入', 2000, true);
  const next = copy(state); next.draft = text; return next;
}

export function stageProgress(project) {
  const progress = project?.progress ?? 0;
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) fail('项目进度不正确');
  return STAGES.map((stage, index) => {
    const value = Math.max(0, Math.min(100, (progress - index * 25) * 4));
    return { ...stage, progress: value, status: value === 100 ? 'completed' :
      progress >= index * 25 && project ? (project.status === 'paused' ? 'paused' : 'running') : 'queued' };
  });
}

export function serialize(state) { validateState(state); return JSON.stringify(state); }
export function restore(json) {
  if (typeof json !== 'string' || json.length > 8 * 1024 * 1024) fail('保存文件超过大小限制');
  let state;
  try { state = JSON.parse(json); } catch { fail('保存文件不是有效JSON，请保留原文件并检查备份'); }
  validateState(state);
  for (const project of state.projects) if (project.status === 'running') project.status = 'paused';
  return state;
}
