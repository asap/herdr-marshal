# herdr-marshal

Brings order to your herdr

A terminal plugin for [Herdr](https://herdr.dev) that organizes workspaces and panes by project.

Status: early. `organize`, project headings and automatic redraw work; see [issue #1](https://github.com/asap/herdr-marshal/issues/1) for known gaps.

## Plan

1. `organize` (with `--dry-run`): match workspaces to projects, then reorder, tag and draw them. Never closes or creates anything.
2. `up <project>`: create only the missing workspaces and panes.
3. A popup project picker, if still needed.

Projects are defined by `name`, `root` (longest match wins) and optional `labels` (which beat `root`).

## Use

Needs Herdr 0.9.3+ and Node 22.6+ (it runs the TypeScript directly, with no build step).

```sh
herdr plugin link .
cp examples/marshal.json "$(herdr plugin config-dir asap.herdr-marshal)/marshal.json"   # then edit it
node --experimental-strip-types bin/marshal.ts organize --dry-run
node --experimental-strip-types bin/marshal.ts organize
```

The same two commands are the `preview` and `organize` plugin actions. Marshal reads `marshal.json` from the plugin config directory, or from `--config <file>`.

- Projects are listed in config order; unmatched workspaces go last.
- A label match beats a folder match. `*` is the only wildcard.
- A worktree workspace is matched by its repository's folder, others by the active tab's first pane.
- `organize` never creates or closes anything.
- `organize` also sorts the Agents panel by that order. This replaces Herdr's own Agents sort until you run `reset`.

Headings need these rows in Herdr's `config.toml`, followed by `herdr server reload-config`:

```toml
[ui.sidebar.spaces]
rows = [[{ token = "$project_head", bold = true }], [{ token = "$project_row", rules = [{ contains = "●\u200C", fg = "#f9e2af" }, { contains = "●\u200D", fg = "#f38ba8" }, { contains = "●\u2063", fg = "#94e2d5" }] }], ["branch", "git_status"]]

[ui.sidebar.agents]
rows = [[{ token = "$project_head", bold = true }], [{ token = "$project_row", rules = [{ contains = "●\u200C", fg = "#f9e2af" }, { contains = "●\u200D", fg = "#f38ba8" }, { contains = "●\u2063", fg = "#94e2d5" }] }, "tab"], ["agent"]]
```

Marshal draws each name line itself (`$project_row`: indent, status mark and name), which avoids Herdr's `·` separator. The marks follow Herdr's `dots` indicators (the `status_indicators` setting is ignored). Herdr colors a token as a whole, so a blocked, working or done line is colored, name included; the colors are Catppuccin's.

With the plugin linked, a startup hook runs `organize` and events redraw the lines as agents and workspaces change. Without the plugin, the marks go stale until you rerun `organize`.

**These rows show no names unless marshal has drawn them.** To stop using marshal, remove the rows from `config.toml`, run `herdr server reload-config`, then `reset` and unlink or disable the plugin.

Develop: `npm install`, then `npm test` and `npm run typecheck`.
