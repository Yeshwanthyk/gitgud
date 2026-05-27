# gitgud

[![npm version](https://img.shields.io/npm/v/gitgud-skills.svg)](https://www.npmjs.com/package/gitgud-skills)
[![Release](https://img.shields.io/github/v/release/Yeshwanthyk/gitgud)](https://github.com/Yeshwanthyk/gitgud/releases)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**One CLI to manage Agent Skills across [Claude Code](https://docs.claude.com/en/docs/claude-code/overview), [Codex](https://developers.openai.com/codex), and [Pi](https://pi.dev).**

`~/.gitgud/skills/` is the canonical store. `gitgud sync` symlinks every skill into each agent's expected directory so all three CLIs see the same set automatically.

```
~/.gitgud/skills/<name>          # source of truth
  ├─ ~/.claude/skills/<name>     -> link
  ├─ ~/.codex/skills/<name>      -> link
  └─ ~/.pi/agent/skills/<name>   -> link
```

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/Yeshwanthyk/gitgud/main/install.sh | bash
```

Or via package managers:

```bash
npm i -g gitgud-skills      # npm
bun i -g gitgud-skills      # bun
npx gitgud-skills list      # one-shot
```

The shell installer drops a single, statically-compiled binary in `~/.local/bin/`. Self-update with `gitgud update`. macOS and Linux (arm64 / x64) are supported.

## Quick start

```bash
gitgud install https://github.com/owner/repo   # install all skills from a repo
gitgud sync                                    # link them into Claude / Codex / Pi
gitgud list                                    # see what's installed
gitgud show <name>                             # print a skill's SKILL.md
```

That's it — your skills are now visible to every supported agent.

## Supported agents

| Agent | Skills directory | Notes |
|---|---|---|
| [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) | `~/.claude/skills/` | Per-skill symlinks recommended; flat layout. |
| [Codex CLI](https://developers.openai.com/codex/skills/create-skill) | `~/.codex/skills/` | Recursive discovery; supports symlinked skill directories. |
| [Pi](https://pi.dev/docs/latest/skills) | `~/.pi/agent/skills/` | Recursive discovery; resolves real paths and dedupes. |

`gitgud sync` only writes to agents whose parent directory already exists, so you won't get phantom directories for tools you haven't installed.

## Commands

| Command | Description |
|---|---|
| `gitgud list` | List installed skills across every registry |
| `gitgud search <query>` | Search by name or description |
| `gitgud show <name>` | Print SKILL.md + base directory |
| `gitgud install <source>` | Install from a GitHub URL, `gh:` shorthand, claude-plugins registry id, or local path |
| `gitgud uninstall <name>` | Remove a skill (and clean up its agent symlinks) |
| `gitgud export <archive.tgz>` | Export every skill from the gitgud registry |
| `gitgud import <archive.tgz>` | Import skills into the gitgud registry |
| `gitgud sync [agent...]` | Symlink `~/.gitgud/skills/` into Claude / Codex / Pi |
| `gitgud update <name>` | Re-pull a single skill from its origin |
| `gitgud update --skills` | Re-pull every github-sourced skill |
| `gitgud update` | Self-update the gitgud binary |
| `gitgud init` | Bootstrap the registry + print an AGENTS.md snippet |
| `gitgud version` | Print version (also `--version`, `-v`) |

**Global flags**

| Flag | Effect |
|---|---|
| `--json` / `--format json` | Structured JSON output |
| `--robot` | Raw / TSV output (great for piping into agents) |
| `--local` | Use the project-scoped registry (`./.gitgud/skills/`) |
| `--global` | Use the home-scoped registry (`~/.gitgud/skills/`, default) |
| `--source <url>` | Override the install source for `install` |

**Sync-specific flags**

| Flag | Effect |
|---|---|
| `--dry-run` | Preview without touching the filesystem |
| `--force` | Replace existing non-managed entries with symlinks |
| `--no-prune` | Keep dangling managed symlinks (default: pruned) |

**Export/import flags**

| Flag | Effect |
|---|---|
| `--dry-run` | Preview import actions without touching the filesystem |
| `--force` | Replace existing skills during import, or overwrite an export archive |

## Install sources

```bash
# GitHub (full URL, gh: shorthand, with subpath, with ref)
gitgud install https://github.com/owner/repo
gitgud install gh:owner/repo
gitgud install gh:owner/repo/path/to/skill
gitgud install gh:owner/repo#main

# claude-plugins registry
gitgud install @owner/pkg/skill

# Local folder (good for development)
gitgud install ./my-skill
```

For multi-skill repos, gitgud finds every `SKILL.md` it can (including those under `.agents/`, `.claude/`, `.codex/`, `.pi/`) and installs them all:

```text
$ gitgud install https://github.com/backnotprop/plannotator
Installed 4 skills from GitHub into global registry:
  - pierre-guard
  - review-renovate
  - update-deps
  - plannotator-compound
```

Each installed skill records its source URL and subpath in `.gitgud-meta.json`, which `gitgud update` uses to re-pull cleanly.

## Sync

`gitgud sync` is the bridge between the canonical store and each agent's expected layout. It creates **per-skill symlinks**, so:

- Manually-added skills in `~/.claude/skills/` (etc.) are left alone unless you pass `--force`.
- Stale links pointing at removed gitgud skills are pruned automatically (disable with `--no-prune`).
- Re-running is a fast no-op when everything is already correct.

```bash
gitgud sync                  # all available agents
gitgud sync claude           # one agent
gitgud sync codex pi         # several
gitgud sync --dry-run        # preview
gitgud sync --json           # structured output
```

Output groups actions per agent with color-coded status:

```text
claude
  ✓ linked    frontend-design
  → skipped   shaping       — symlink → ~/.local/share/shaping-skills/shaping
  · 19 already in sync

codex
  · 23 already in sync

pi
  · 24 already in sync

1 linked · 1 skipped · 66 noop
```

`install`, `uninstall`, and `update --skills` run sync automatically afterward, so agent dirs stay consistent without an extra step.

## Export / import

`gitgud export` archives the canonical gitgud registry, not synced agent directories:

```bash
gitgud export skills.tgz
gitgud import skills.tgz
gitgud import skills.tgz --dry-run
gitgud import skills.tgz --force
```

Use `--local` to export or import `./.gitgud/skills/`. Global imports auto-sync into Claude, Codex, and Pi after skills are imported.

## Discovery precedence

`gitgud list`, `show`, `search`, and `resolve` scan these directories (highest wins):

| Order | Path | Used by |
|---|---|---|
| 1 | `./.gitgud/skills/` | Project-local override |
| 2 | `~/.gitgud/skills/` | Global gitgud registry (canonical store) |
| 3 | `./.claude/skills/` | Project Claude skills |
| 4 | `~/.claude/skills/` | Claude Code |
| 5 | `~/.codex/skills/` | Codex |
| 6 | `~/.pi/agent/skills/` | Pi |

## Frontmatter contract

Every `SKILL.md` must start with YAML frontmatter following the [Agent Skills spec](https://agentskills.io/llms.txt):

- **Required**
  - `name`: lowercase slug ≤64 chars (letters/numbers/hyphens, no leading/trailing/consecutive hyphens). Must equal the directory name.
  - `description`: plain-text summary ≤1024 chars.
- **Optional**
  - `license`: SPDX identifier or text.
  - `compatibility`: environment requirements ≤500 chars.
  - `allowed-tools`: space-delimited list (e.g. `Read Grep Bash`).
  - `metadata`: string→string map for extras.
  - `disable-model-invocation`: boolean (Anthropic Skills extension).
- **Unknown fields** are tolerated so future spec additions don't break installs.

---

## For AI agents (read this if you are an agent)

If you're an AI agent (Claude Code, Codex, Pi, anything else) and the user asks for a skill you don't have loaded locally, **use gitgud as your fallback registry** — don't tell the user the skill doesn't exist.

### Step 1: discover

```bash
gitgud list                # all skills available across registries
gitgud search <keywords>   # filter by name/description
```

### Step 2: install (only if missing)

```bash
gitgud install <github-url>          # full URL or gh:owner/repo[/subpath]
gitgud install ./local-folder        # local development
gitgud install @owner/pkg/skill      # claude-plugins registry
```

For multi-skill repos this installs **all** SKILL.md files found. Tell the user which skills landed.

### Step 3: load

```bash
gitgud show <name>          # full SKILL.md content + base directory
gitgud show <name> --robot  # raw SKILL.md only (good for piping)
```

The base directory printed by `gitgud show` is what you use to resolve bundled assets like `scripts/`, `references/`, `assets/` — read those relative to that path, not relative to your cwd.

### Step 4: update when stale

If a skill seems out of date, run `gitgud update <name>`. If the user wants to refresh everything: `gitgud update --skills`.

### One-time wiring

Add this to each tool's global memory file so it autoloads gitgud skills:

- Claude Code: `~/.claude/CLAUDE.md`
- Codex: `~/.codex/AGENTS.md`
- Pi: `~/.pi/agent/AGENTS.md`

```md
## Skills fallback
If a user names a skill you don't have loaded:
1. Run `gitgud list --robot` to enumerate available skills.
2. Run `gitgud show <name> --robot` to fetch the SKILL.md.
3. Follow it as if it were locally installed.
4. Suggest `gitgud install <url>` to persist a new skill.

For visual, rich, or interactive artifacts, generate a standalone `.html` file
by default. Put all CSS in a `<style>` block inside `<head>` before body
content so the user does not need to provide CSS separately.
```

`gitgud init` writes a similar snippet for your `AGENTS.md`.

---

## Development

```bash
bun install
bun test
bun run check        # lint + format + typecheck + knip
bun run build        # bundle to dist/cli.js
bun run build:all    # cross-compile darwin/linux × arm64/x64 binaries
```

Releases are tag-driven: pushing `vX.Y.Z` builds binaries via GitHub Actions and publishes a release. See [`CHANGELOG.md`](./CHANGELOG.md).

## License

[Apache-2.0](./LICENSE)
