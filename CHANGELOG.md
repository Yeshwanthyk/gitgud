# Changelog

All notable changes to gitgud will be documented in this file.

## [0.1.0] - 2025-12-11

### ✨ New Features

- **Skill Discovery**: Find and explore AI agent skills
  - `gitgud list` - View all installed skills
  - `gitgud show <skill>` - Display full skill content  
  - `gitgud search <term>` - Search skills by keyword
  - `gitgud path <skill>` - Get filesystem path

- **Multi-Source Installation**: Install skills from anywhere
  - Registry: `gitgud install @anthropics/claude-code/frontend-design`
  - GitHub: `gitgud install gh:user/repo/path/to/skill`
  - Local: `gitgud install ./my-skill`

- **Flexible Scoping**: Global and project-local management
  - Global: `~/.gitgud/skills/`
  - Local: `.gitgud/skills/` with `--local` flag

- **Claude Code Compatibility**: Works with existing Claude skills
  - Discovers `~/.claude/skills/` and `.claude/skills/`
  - Priority: local .claude → local .gitgud → global .claude → global .gitgud

### 🔧 Technical

- Bun + TypeScript with strict mode
- 40 tests, Biome linting
- giget for GitHub cloning
