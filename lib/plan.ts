import os from 'node:os';
import path from 'node:path';

import type { Pane, Status, Workspace } from './herdr.ts';

// Herdr's "dots" indicators. Working, blocked and done differ only by color there, and a color rule can
// only match text, so each carries its own zero-width character for the README's rules to find.
const ICONS: Record<Status, string> = {
  idle: '○',
  working: '●\u200c',
  blocked: '●\u200d',
  done: '●\u2063',
  unknown: '·',
};

// One token for the whole line, so Herdr has no neighbours to put a "·" between. It indents the row
// under a heading by itself; other entries carry the indent here, behind a zero-width space that
// stops Herdr trimming it.
export function line(status: Status | undefined, name: string, underHeading: boolean) {
  return `${underHeading ? '' : '\u200b  '}${ICONS[status ?? 'unknown'] ?? ICONS.unknown} ${name}`;
}

export interface Project {
  name: string;
  root?: string;
  labels?: string[];
}

export interface Row {
  id: string;
  label: string;
  project: string | null;
  rank: number;
}

const expand = (p: string) => path.resolve(p.replace(/^~(?=$|\/)/, os.homedir()));
const strings = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === 'string' && s);

// The config is parsed JSON, so it stays unknown until checked here.
function validate(config: unknown): Project[] {
  const projects = (config as { projects?: unknown } | null)?.projects;
  if (!Array.isArray(projects)) throw new Error('config needs a "projects" array');
  for (const p of projects) {
    if (typeof p?.name !== 'string' || !p.name) throw new Error('every project needs a "name"');
    if (p.root !== undefined && (typeof p.root !== 'string' || !/^(\/|~(\/|$))/.test(p.root)))
      throw new Error(`${p.name}: "root" must start with / or ~`);
    if (p.labels !== undefined && !strings(p.labels)) throw new Error(`${p.name}: "labels" must be a list of strings`);
    if (!p.root && !p.labels?.length) throw new Error(`${p.name}: needs a "root" or "labels"`);
  }
  return projects;
}

// `*` is the only wildcard.
function labelMatches(pattern: string, label: string) {
  const source = pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${source}$`).test(label);
}

// A worktree belongs to its repo; otherwise use where the active tab's first pane started.
function directory(workspace: Workspace, panes: Pane[]) {
  if (workspace.worktree?.repo_root) return workspace.worktree.repo_root;
  const own = panes.filter((p) => p.workspace_id === workspace.workspace_id);
  return (own.find((p) => p.tab_id === workspace.active_tab_id) ?? own[0])?.cwd;
}

function match(projects: Project[], workspace: Workspace, panes: Pane[]) {
  const byLabel = projects.find((p) => p.labels?.some((l) => labelMatches(l, workspace.label)));
  if (byLabel) return byLabel;
  const dir = directory(workspace, panes);
  if (!dir) return null;
  let best: Project | null = null;
  let length = -1;
  for (const project of projects) {
    if (!project.root) continue;
    const root = expand(project.root);
    const inside = !path.relative(root, dir).split(path.sep).includes('..');
    if (inside && root.length > length) [best, length] = [project, root.length];
  }
  return best;
}

// Projects in config order, unmatched last; ties keep Herdr's current order.
export function plan(config: unknown, workspaces: Workspace[], panes: Pane[]) {
  const projects = validate(config);
  const rows = workspaces.map((workspace): Row => {
    const project = match(projects, workspace, panes);
    return {
      id: workspace.workspace_id,
      label: workspace.label,
      project: project?.name ?? null,
      rank: project ? projects.indexOf(project) : projects.length,
    };
  });
  const ordered = [...rows].sort((a, b) => a.rank - b.rank);
  return { rows: ordered, moved: ordered.some((row, i) => row !== rows[i]) };
}

// Herdr has no group object, so the first row of each project carries its heading.
// The Agents panel lists only panes running an agent, so its headings are placed separately.
export function headings(rows: Row[], panes: Pane[]) {
  const spaces = new Map<string, string>();
  const agents = new Map<string, string>();
  let lastSpace: string | undefined;
  let lastAgent: string | undefined;
  for (const row of rows) {
    const name = row.project ?? 'other';
    if (name !== lastSpace) spaces.set(row.id, (lastSpace = name));
    const first = panes.find((p) => p.workspace_id === row.id && p.agent);
    if (first && name !== lastAgent) agents.set(first.pane_id, (lastAgent = name));
  }
  return { spaces, agents };
}
