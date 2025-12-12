import path from "node:path";
import { readFile } from "node:fs/promises";

import type { OutputFormat } from "../types";
import { resolveSkill } from "../core/skills";
import { formatError, formatSkillDetail } from "../output";

export type ShowOptions = {
	name?: string;
	format: OutputFormat;
};

export async function show(options: ShowOptions): Promise<void> {
	const { name, format } = options;

	if (!name) {
		process.stderr.write(`${formatError("Missing skill name.", format)}\n`);
		process.exit(1);
	}

	const resolved = resolveSkill(name);
	if (!resolved.ok) {
		process.stderr.write(`${formatError(resolved.error.message, format)}\n`);
		process.exit(1);
	}

	const skill = resolved.value;
	const skillFile = path.join(skill.path, "SKILL.md");

	let content: string;
	try {
		content = await readFile(skillFile, "utf8");
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown read error";
		process.stderr.write(
			`${formatError(`Failed to read SKILL.md: ${message}`, format)}\n`,
		);
		process.exit(1);
	}

	process.stdout.write(`${formatSkillDetail(skill, content, format)}\n`);
}
