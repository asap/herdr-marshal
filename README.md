# herdr-marshal

Brings order to your herdr

A terminal plugin for [Herdr](https://herdr.dev) that organizes workspaces and panes by project.

Status: not built yet.

## Plan

1. `organize` (with `--dry-run`): match workspaces to projects, then reorder and tag them. Never closes or creates anything.
2. `up <project>`: create only the missing workspaces and panes.
3. A popup project picker, if still needed.

Projects are defined by `name`, `root` (longest match wins) and optional `labels` (which beat `root`).
