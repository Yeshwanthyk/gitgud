# gitgud

[![npm version](https://img.shields.io/npm/v/gitgud-skills.svg)](https://www.npmjs.com/package/gitgud-skills)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

One CLI to manage AI agent skills across **Claude Code**, **Codex**, and **Pi**.

Install skills from GitHub, the claude-plugins registry, or local folders.
Skills become discoverable to every supported agent CLI from a single source
of truth at `~/.gitgud/skills/`.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/Yeshwanthyk/gitgud/main/install.sh | bash
```

Or via npm / bun: `npm i -g gitgud-skills` · `bun i -g gitgud-skills` · `npx gitgud-skills list`.

## Quick start

```bash
gitgud list                                              # see what's installed
gitgud install https://github.com/owner/repo             # install all skills from a repo
gitgud install gh:owner/repo/path/to/skill               # install one skill from a subpath
gitgud install ./my-skill                                # install a local folder
gitgud show <name>                                       # print a skill's SKILL.md
gitgud search <query>                                    # find skills by keyword
gitgud update <name>                                     # re-pull a skill from origin
gitgud update --skills                                   # re-pull every github-sourced skill
gitgud update                                            # self-update the gitgud binary
gitgud uninstall <name>                                  # remove a skill
gitgud sync [agent...]                                   # symlink ~/.gitgud/skills into Claude/Codex/Pi
```

## Multi-agent skill discovery

`gitgud list`, `show`, `search`, and `resolve` all scan the following
directories in precedence order (highest wins):

| Order | Path | Used by |
|-------|------|---------|
| 1 | `./.gitgud/skills/` | Project-local override |
| 2 | `~/.gitgud/skills/` | Global gitgud registry |
| 3 | `./.claude/skills/` | Project Claude skills |
| 4 | `~/.claude/skills/` | Claude Code |
| 5 | `~/.codex/skills/`  | Codex |
| 6 | `~/.pi/agent/skills/` | Pi |

Install once with `gitgud install …` and the skill lands in
`~/.gitgud/skills/`, the canonical store. Every supported CLI either picks
it up from there directly (when its skills dir is symlinked to gitgud's) or
sees it through `gitgud list` / `gitgud show`.

## Sync

`gitgud sync` puts every skill in `~/.gitgud/skills/` in front of the
agent CLIs by creating per-skill symlinks:

```
~/.claude/skills/<name>     -> ~/.gitgud/skills/<name>
~/.codex/skills/<name>      -> ~/.gitgud/skills/<name>
~/.pi/agent/skills/<name>   -> ~/.gitgud/skills/<name>
```

It only touches agents whose parent dir already exists (`~/.claude`,
`~/.codex`, `~/.pi/agent`), so uninstalled tools aren't polluted. Existing
user-owned skills with the same name are left alone — pass `--force` to
replace them. Stale managed symlinks (target removed) are pruned
automatically; pass `--no-prune` to keep them.

```bash
gitgud sync                    # all available agents
gitgud sync claude             # one agent only
gitgud sync --dry-run          # preview
gitgud sync --json             # structured output
```

`install`, `uninstall`, and `update --skills` run sync automatically so
agent dirs stay consistent with `~/.gitgud/skills/` without any extra
step.

## Multi-skill repos

Many real-world repos ship several SKILL.md files at once (e.g. under
`.agents/skills/`, `.claude/skills/`, `apps/skills/`). `gitgud install
<repo-url>` discovers every SKILL.md it can find, installs them all, and
records the subpath in each skill's `.gitgud-meta.json`:

```bash
$ gitgud install https://github.com/backnotprop/plannotator
Installed 4 skills from GitHub into global registry:
  - pierre-guard
  - review-renovate
  - update-deps
  - plannotator-compound
Skipped 1:
  - .agents/skills/release: Frontmatter name must match directory name…
```

To install a single skill from a multi-skill repo, point at the subpath:

```bash
gitgud install gh:backnotprop/plannotator/apps/skills/plannotator-compound
```

## Updating installed skills

Every gitgud-installed skill carries a `.gitgud-meta.json` with its origin
URL. `gitgud update` uses that to re-pull:

```bash
gitgud update plannotator-compound   # one skill
gitgud update --skills               # every skill with a github source
gitgud update                        # self-update the gitgud binary
```

Local-edited skills (no `.gitgud-meta.json`) are left alone.

## Frontmatter contract

Every `SKILL.md` must start with YAML frontmatter following the
[Agent Skills spec](https://agentskills.io/llms.txt):

- **Required**
  - `name`: lowercase slug ≤64 chars (letters/numbers/hyphens, no
    leading/trailing/consecutive hyphens). Must equal the directory name.
  - `description`: plain-text summary ≤1024 chars.
- **Optional** (recognized & validated)
  - `license`: SPDX identifier or text.
  - `compatibility`: environment requirements ≤500 chars.
  - `allowed-tools`: space-delimited list (e.g. `Read Grep Bash`).
  - `metadata`: string→string map for extras.
  - `disable-model-invocation`: boolean (Anthropic Skills extension).
- **Unknown fields** are tolerated so future spec additions don't break installs.

---

## For AI agents (read this if you are an agent)

If you're an AI agent (Claude Code, Codex, Pi, anything else) and the user
asks for a skill you don't have loaded locally, **use gitgud as your
fallback registry** — don't tell the user the skill doesn't exist.

### Step 1: discover

```bash
gitgud list                # all skills available across registries
gitgud search <keywords>   # filter by name/description
```

If neither finds what the user wants, they probably need to install it from
GitHub.

### Step 2: install (only if missing)

```bash
gitgud install <github-url>          # full URL or gh:owner/repo[/subpath]
gitgud install ./local-folder        # local development
gitgud install @owner/pkg/skill      # claude-plugins registry
```

For multi-skill repos this installs **all** SKILL.md files found. Tell the
user which skills landed.

### Step 3: load

```bash
gitgud show <name>          # full SKILL.md content + base directory
gitgud show <name> --robot  # raw SKILL.md only (good for piping)
```

The base directory printed by `gitgud show` is what you use to resolve
bundled assets like `scripts/`, `references/`, `assets/` — read those
relative to that path, not relative to your cwd.

### Step 4: update when stale

If a skill seems out of date, run `gitgud update <name>`. If the user wants
to refresh everything: `gitgud update --skills`.

### What to tell the user when you install something new

After `gitgud install <url>`, say something like:

> I installed N skills from `<url>` into `~/.gitgud/skills/`. They're now
> available to Claude Code, Codex, and Pi via `gitgud list`. Run
> `gitgud update <name>` later to pull updates from the source repo.

### One-time wiring (suggest this to the user if not done yet)

For Claude Code, Codex, and Pi to **autoload** gitgud skills (instead of
needing `gitgud show` per use), add this to each tool's global memory file:

- Claude Code: `~/.claude/CLAUDE.md`
- Codex: `~/.codex/agents.md`
- Pi: `~/.pi/agent/AGENTS.md`

```md
## Skills fallback
If a user names a skill you don't have loaded:
1. Run `gitgud list --robot` to enumerate available skills.
2. Run `gitgud show <name> --robot` to fetch the SKILL.md.
3. Follow it as if it were locally installed.
4. Suggest `gitgud install <url>` to persist a new skill.
```

`gitgud init` will write a similar snippet for your `AGENTS.md`.

---

## Commands reference

| Command | Description |
|---------|-------------|
| `gitgud list` | List skills across all registries |
| `gitgud show <name>` | Print SKILL.md + base directory |
| `gitgud search <query>` | Search skills by keyword |
| `gitgud install <source>` | Install from URL, `gh:` shorthand, registry, or local path |
| `gitgud uninstall <name>` | Remove a skill |
| `gitgud init` | Print AGENTS.md snippet for agent integration |
| `gitgud update` | Self-update the gitgud binary |
| `gitgud update <name>` | Re-pull a single skill from its origin |
| `gitgud update --skills` | Re-pull every github-sourced skill |

**Flags:** `--local` · `--global` · `--json` · `--robot` (TSV/raw)

## License

Apache-2.0
