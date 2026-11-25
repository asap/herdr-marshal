#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { call, type Pane, type Status, type Workspace } from '../lib/herdr.ts';
import { headings, line, plan } from '../lib/plan.ts';

const USAGE = 'usage: marshal.ts organize|refresh [--dry-run] [--config <file>] | reset';
const SOURCE = 'herdr-marshal';
const CLEAR = { project_head: null, project_row: null };

type Tokens = { project_head: string | null; project_row: string | null };
interface Draw {
  space(workspaceId: string): Tokens;
  agent(pane: Pane): Tokens;
}
// Something can close between the snapshot and the write; that must not stop the other rows.
function ignoreClosed(error: Error) {
  if (!/not found/i.test(error.message)) throw error;
}

// A null project clears a tag left over from an earlier run. `seq` is when the snapshot was taken, so
// a slower, older run cannot overwrite a newer one.
async function tag(seq: number, workspaces: Map<string, string | null>, panes: Pane[], draw?: Draw) {
  for (const [workspace_id, project] of workspaces) {
    const tokens = { project, ...(draw?.space(workspace_id) ?? CLEAR) };
    await call('workspace.report_metadata', { workspace_id, source: SOURCE, seq, tokens }).catch(ignoreClosed);
  }
  for (const pane of panes) {
    const tokens = { project: workspaces.get(pane.workspace_id) ?? null, ...(draw?.agent(pane) ?? CLEAR) };
    await call('pane.report_metadata', { pane_id: pane.pane_id, source: SOURCE, seq, tokens }).catch(ignoreClosed);
  }
}

// The Agents view stays in place until cleared, so this is the way out.
async function reset() {
  await call('agent.view.clear', { source: SOURCE });
  const { workspaces } = await call<{ workspaces: Workspace[] }>('workspace.list');
  const { panes } = await call<{ panes: Pane[] }>('pane.list');
  await tag(Date.now(), new Map(workspaces.map((w) => [w.workspace_id, null])), panes);
  console.log('agents panel released and tags cleared; workspace order kept');
  console.log('remove the marshal sidebar rows from config.toml, or names stay blank');
}

function configFile() {
  const herdr = process.env.HERDR_BIN_PATH ?? 'herdr';
  const dir =
    process.env.HERDR_PLUGIN_CONFIG_DIR ??
    execFileSync(herdr, ['plugin', 'config-dir', 'asap.herdr-marshal'], { encoding: 'utf8' }).trim();
  return path.join(dir, 'marshal.json');
}

async function main(args: string[]) {
  // Strict parsing: a mistyped --dry-run must not fall through to a real run.
  const [command, ...rest] = args;
  if (command === 'reset' && !rest.length) return reset();
  let dryRun = false;
  let file: string | undefined;
  while (rest.length) {
    const flag = rest.shift();
    if (flag === '--dry-run') dryRun = true;
    else if (flag === '--config' && rest.length) file = rest.shift();
    else throw new Error(USAGE);
  }
  if (command !== 'organize' && command !== 'refresh') throw new Error(USAGE);

  const seq = Date.now();
  const { workspaces } = await call<{ workspaces: Workspace[] }>('workspace.list');
  // Event hooks run `refresh`: it only redraws what `organize` has drawn and `reset` has not removed.
  if (command === 'refresh' && !workspaces.some((w) => w.tokens?.project_row)) return;
  file ??= configFile();
  const config: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { panes } = await call<{ panes: Pane[] }>('pane.list');
  const { rows, moved } = plan(config, workspaces, panes);

  for (const row of rows) console.log(`${(row.project ?? '-').padEnd(20)} ${row.id.padEnd(6)} ${row.label}`);
  console.log(moved ? 'order: changes' : 'order: unchanged');
  if (dryRun) return console.log('dry run: nothing changed');

  const heads = headings(rows, panes);
  const byId = new Map(workspaces.map((w) => [w.workspace_id, w]));
  const draw = (head: string | undefined, status: Status | undefined, id: string): Tokens => ({
    project_head: head ?? null,
    project_row: line(status, byId.get(id)?.label ?? id, head !== undefined),
  });
  await tag(seq, new Map(rows.map((row) => [row.id, row.project])), panes, {
    space: (id) => draw(heads.spaces.get(id), byId.get(id)?.agent_status, id),
    agent: (pane) => draw(heads.agents.get(pane.pane_id), pane.agent_status, pane.workspace_id),
  });
  if (moved) await call('workspace.move_block', { workspace_ids: rows.map((row) => row.id) });
  // The Agents panel then follows the project order of the workspaces.
  await call('agent.view.set', {
    source: SOURCE,
    label: 'projects',
    sort: ['workspace_order', 'tab_order', 'pane_order'].map((field) => ({ field })),
  });
  console.log('done');
}

main(process.argv.slice(2)).catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
