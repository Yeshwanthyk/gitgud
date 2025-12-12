import path from "node:path";

import { ensureDir, getGlobalSkillsDir } from "../core/paths";
import type { Scope } from "../types";

export type InitOptions = {
	scope: Scope;
};

const AGENTS_SNIPPET = `## Skills

This project uses gitgud for AI agent skills. Skills provide specialized instructions for complex tasks.

### How to Use Skills

1. **Discover available skills**: Run \`gitgud list\` to see installed skills with descriptions
2. **Search for skills**: Run \`gitgud search <term>\` to find skills by keyword
3. **Load a skill**: Run \`gitgud show <name>\` to load detailed instructions

When a user request matches a skill's description, load it with \`gitgud show <name>\` and follow the instructions. The output includes the skill's base directory for resolving bundled resources (scripts/, references/, assets/).

### Installed Skills

Run \`gitgud list\` to see current skills.
`;

export async function initCommand(_args: string[], options: InitOptions): Promise<void> {
	const scope = options.scope;

	const skillsDir =
		scope === "local" ? path.join(process.cwd(), ".gitgud", "skills") : getGlobalSkillsDir();

	ensureDir(skillsDir);

	const targetLabel = scope === "local" ? skillsDir : `global skills dir: ${skillsDir}`;

	process.stdout.write(
		`Initialized gitgud ${targetLabel}\n\nAdd this snippet to your AGENTS.md if you want gitgud skills support:\n\n${AGENTS_SNIPPET}\n`,
	);
}
