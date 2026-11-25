import assert from 'node:assert';
import test from 'node:test';

import type { Pane, Workspace } from '../lib/herdr.ts';
import { headings, line, plan } from '../lib/plan.ts';

const config = {
  projects: [
    { name: 'alpha', root: '/dev/alpha' },
    { name: 'beta', root: '/dev/beta', labels: ['Beta*'] },
    { name: 'home', root: '/dev' },
  ],
};
const workspace = (id: string, label: string, extra?: Partial<Workspace>): Workspace => ({ workspace_id: id, label, active_tab_id: `${id}:t1`, ...extra });
const pane = (id: string, cwd: string, tab = 't1'): Pane => ({ pane_id: `${id}:p1`, workspace_id: id, tab_id: `${id}:${tab}`, cwd });

test('matches by label, then longest root, and orders by config', () => {
  const workspaces = [
    workspace('a', 'Home'),
    workspace('b', 'elsewhere'),
    workspace('c', 'Beta - Web'),
    workspace('d', 'una'),
    workspace('e', 'lookalike'),
    workspace('f', 'tree', { worktree: { repo_root: '/dev/alpha' } }),
    workspace('g', 'two tabs'),
  ];
  const panes = [
    pane('a', '/dev'),
    pane('b', '/tmp'),
    pane('c', '/dev/alpha'),
    pane('d', '/dev/alpha/.worktrees/x'),
    pane('e', '/dev/alpha-old'),
    pane('f', '/tmp/tree'),
    pane('g', '/tmp', 't2'),
    pane('g', '/dev/beta'),
  ];
  const result = plan(config, workspaces, panes);
  assert.deepStrictEqual(
    result.rows.map((r) => [r.id, r.project]),
    [['d', 'alpha'], ['f', 'alpha'], ['c', 'beta'], ['g', 'beta'], ['a', 'home'], ['e', 'home'], ['b', null]],
  );
  assert.strictEqual(result.moved, true);
});

test('an already ordered list does not move', () => {
  assert.strictEqual(plan(config, [workspace('a', 'Beta')], []).moved, false);
});

test('rejects bad config', () => {
  for (const bad of [{}, { projects: [{ name: 'x' }] }, { projects: [{ name: 'x', root: 'relative' }] }, { projects: [{ name: 'x', labels: 'y' }] }])
    assert.throws(() => plan(bad, [], []));
});

test('headings sit on the first space and first agent of each group', () => {
  const rows = plan(config, [workspace('a', 'Beta 1'), workspace('b', 'Beta 2'), workspace('c', 'stray')], []).rows;
  const agent = (id: string) => ({ ...pane(id, '/tmp'), agent: 'claude' });
  const result = headings(rows, [pane('a', '/tmp'), agent('b'), agent('c')]);
  assert.deepStrictEqual([...result.spaces], [['a', 'beta'], ['c', 'other']]);
  assert.deepStrictEqual([...result.agents], [['b:p1', 'beta'], ['c:p1', 'other']]);
});

test('a line carries its own indent only when no heading sits above it', () => {
  assert.strictEqual(line('working', 'x', true), '●\u200c x');
  assert.strictEqual(new Set((['working', 'blocked', 'done'] as const).map((s) => line(s, 'x', true))).size, 3);
  assert.strictEqual(line(undefined, 'x', false), '\u200b  · x');
});
