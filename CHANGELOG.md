# Changelog

All notable changes to gitgud will be documented in this file.

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
