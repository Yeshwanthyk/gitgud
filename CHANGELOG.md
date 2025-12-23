# Changelog

All notable changes to gitgud will be documented in this file.

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
