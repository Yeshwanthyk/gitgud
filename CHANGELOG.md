# Changelog

All notable changes to gitgud will be documented in this file.

## [0.0.12] - 2026-05-02

### Changed

- **`gitgud list` output**: replaced the wrapping `name (scope) - description` line with a compact two-column layout. Adds a header summary (`N skills · local X · global Y`), color-codes names by scope (blue local, pink global), aligns names to the longest entry (capped at 30 chars), and truncates descriptions to fit the terminal width. Colors auto-disable when piped or when `NO_COLOR` is set. `json` and `robot` formats are unchanged.

## [0.0.11] - 2026-05-02

### Changed

- **`gitgud sync` output**: actions are grouped by agent (claude, codex, pi) with bold headers, color-coded action labels (green linked, yellow skipped, cyan relinked, magenta replaced, red pruned, gray noop), aligned columns, and `~/`-shortened paths in skip reasons. Untouched skills collapse into a single `· N already in sync` line per agent. Colors auto-disable when piped or when `NO_COLOR` is set.

## [0.0.10] - 2026-05-02

### Fixed

- **`gitgud update`** no longer false-positives "Cannot self-update when running via bun/node" on the standalone compiled binary. Inside a `bun build --compile` binary, `process.argv[0]` is the literal string `"bun"`, not a path — the check now uses `process.execPath` to resolve the actual on-disk binary path.

## [0.0.9] - 2026-05-02

### Added

- **`gitgud sync`**: symlinks every skill in `~/.gitgud/skills/` into the agent skill dirs (`~/.claude/skills/`, `~/.codex/skills/`, `~/.pi/agent/skills/`) using per-skill symlinks. Run `gitgud sync` for all agents, or `gitgud sync claude` to target one. Supports `--dry-run`, `--force` (replace non-managed entries), `--no-prune` (keep dangling managed links), and `--json` output.
  - Only syncs to agents whose parent dir already exists, so uninstalled tools aren't polluted.
  - Existing user-owned skills with the same name are left alone unless `--force`.
  - Stale managed symlinks (target removed from `~/.gitgud/skills/`) are pruned automatically.
- **Auto-sync hooks**: `install`, `uninstall`, and `update --skills` now run sync silently after success so agent dirs stay consistent without an extra step.
- **`gitgud init`** prints a hint to run `gitgud sync`.

## [0.0.8] - 2026-05-02

### Added

- **`gitgud --version`, `-v`, and `gitgud version`** all print the installed version.
- **`install.sh`**: tightened `tag_name` parsing so long release notes can't break the download URL.

## [0.0.7] - 2026-05-02

### Changed

- **Toolchain**: Replaced biome with oxlint + oxfmt + eslint + knip. Pre-commit now runs lint, format check, typecheck, knip, and tests in parallel.
- **Refactor**: Centralized `Result` helpers in `src/types.ts`, deduplicated remote-install output in `installCommand`, simplified CLI dispatch with a shared format resolver, consolidated agent skill-dir helpers in `src/core/paths.ts`.
- **tsconfig**: Dropped deprecated `baseUrl`, switched `types` to `@types/bun`.

### Fixed

- **`installFromRegistry` return type**: Was typed `Result<string>` but actually returned `Result<GithubInstallResult>`. The mismatch was hidden under biome (no typecheck). The registry install branch now produces the same multi-skill text/JSON output as the GitHub branch.

## [0.0.6] - 2026-05-02

### Added

- **Multi-agent skill discovery**: `gitgud list`, `show`, and `search` now scan `~/.codex/skills/` and `~/.pi/agent/skills/` in addition to `~/.claude/skills/`. One install, all three CLIs see the skill.
- **Multi-skill repo installs**: `gitgud install <repo-url>` now discovers every `SKILL.md` in a repo (including those under hidden agent dirs `.agents/`, `.claude/`, `.codex/`, `.pi/`) and installs them all. Each skill records its repo subpath in `.gitgud-meta.json`.
- **`gitgud update <name>`**: Re-pull a single installed skill from its origin URL.
- **`gitgud update --skills`**: Re-pull every github-sourced skill in one shot.
- **`disable-model-invocation` frontmatter field** (Anthropic Skills spec) is now recognized and validated as a boolean.

### Changed

- **Forward-compatible frontmatter parser**: Unknown frontmatter fields are tolerated instead of hard-rejected. Recognized fields are still validated. This unblocks installs of spec-compliant skills that use newer Anthropic fields.
- **README**: New "For AI agents" section with an end-to-end install/update playbook agents can follow on the user's behalf.

### Fixed

- `gitgud install https://github.com/backnotprop/plannotator` (and similar multi-skill repos that ship under `.agents/skills/`) no longer fails with `Unknown frontmatter field` or `Multiple skills found`.

## [0.0.5] - 2025-12-19

### Added

- **Agent Skills spec validation**: Enforces the official Claude Agent Skills rules for `SKILL.md` frontmatter (lowercase slugs, ≤1024 character descriptions, no reserved words or HTML, unknown keys blocked).
- **Allowed tools & metadata parsing**: Supports the optional `allowed-tools` (string or array) and `metadata` mappings so skills can declare required tools and custom attributes.
- **Docs & init snippet refresh**: README and `gitgud init` now explain how to keep AGENTS.md short, load skills via `gitgud show`, and treat SKILL.md content as untrusted instructions per the standard.

## [0.0.4] - 2025-12-12

### Added

- **Auto-discovery of nested skills**: When installing from GitHub, gitgud now automatically finds SKILL.md files in subdirectories
  - No need to specify full path for repos with skills in nested folders (e.g., `skills/dev-browser/`)
  - Single skill found → installs automatically
  - Multiple skills found → helpful error listing available paths

### Improved

- **Better registry 404 errors**: When a skill isn't in the claude-plugins registry, now shows:
  - Clear "not found" message
  - Ready-to-use GitHub install command as alternative
  - Link to browse available skills

## [0.0.3] - 2025-12-12

### Added

- **`gitgud update` command**: Self-update to the latest version
  - Checks GitHub releases for newer versions
  - Downloads and replaces the binary automatically
  - Shows helpful message when running via bun/node

## [0.0.2] - 2025-12-12

### Changed

- **Precedence order updated**: gitgud skills now take priority over Claude skills
  - local .gitgud (highest) → global .gitgud → local .claude → global .claude (lowest)
  - Allows users to override any Claude skill with custom versions

## [0.0.1] - 2025-12-11

First release.

### New Features

- **Multi-Source Installation**: Install skills from anywhere
  - Claude-plugins registry: `gitgud install @anthropics/claude-code/frontend-design`
  - GitHub repos: `gitgud install gh:owner/repo/path/to/skill`
  - Local directories: `gitgud install ./my-skill`

- **Skill Discovery**: Find and explore your installed skills
  - `gitgud list` - View all skills with descriptions
  - `gitgud search <term>` - Search by keyword
  - `gitgud show <name>` - Load full skill content with base directory
  - `gitgud path <name>` - Get filesystem path

- **Claude Code Compatible**: Works with existing Claude skills

- **Agent-Friendly Output**: Designed for AI agents

- **Standalone Binaries**: No runtime dependencies
