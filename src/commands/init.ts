import path from "node:path";

import { ensureDir, getGlobalSkillsDir } from "../core/paths";
import type { Scope } from "../types";

type InitOptions = {
	scope: Scope;
};

const AGENTS_SNIPPET = `## Agent Skills

This project stores Claude-compatible Agent Skills in gitgud.

- Run \`gitgud list\` or \`gitgud search <term>\` to discover installed skills.
- When a request matches a skill, run \`gitgud show <name>\` to load the SKILL.md directly. Do not copy skill content into AGENTS.md—load it only when needed so instructions stay fresh.
- Treat SKILL.md content like any external doc: review the steps, confirm scripts/resources before running them, and use the printed \`Base:\` path to access bundled files (references/, scripts/, assets/).

Skills follow the official Agent Skills standard, so loading them with gitgud keeps this AGENT short while still giving you detailed, task-specific guidance on demand.`;

export function initCommand(_args: string[], options: InitOptions): void {
	const scope = options.scope;

	const skillsDir =
		scope === "local" ? path.join(process.cwd(), ".gitgud", "skills") : getGlobalSkillsDir();

	ensureDir(skillsDir);

	const targetLabel = scope === "local" ? skillsDir : `global skills dir: ${skillsDir}`;

	const hint =
		scope === "global"
			? "\nTip: run `gitgud sync` to symlink installed skills into Claude/Codex/Pi.\n"
			: "";

	process.stdout.write(
		`Initialized gitgud ${targetLabel}\n${hint}\nAdd this snippet to your AGENTS.md if you want gitgud skills support:\n\n${AGENTS_SNIPPET}\n`
	);
}
