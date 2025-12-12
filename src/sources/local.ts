import { cpSync, existsSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ensureDir } from "../core/paths";
import { parseSkill } from "../core/skills";
import type { Result, SkillMeta } from "../types";

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T = never>(error: Error): Result<T> => ({
	ok: false,
	error,
});

export type InstallFromLocalOptions = {
	sourcePath: string;
	targetDir: string;
};

export function installFromLocal(options: InstallFromLocalOptions): Result<string> {
	const absoluteSource = path.resolve(options.sourcePath);

	let srcStats;
	try {
		srcStats = statSync(absoluteSource);
	} catch {
		return err(new Error(`Source does not exist: ${absoluteSource}`));
	}

	if (!srcStats.isDirectory()) {
		return err(new Error(`Source is not a directory: ${absoluteSource}`));
	}

	const parsed = parseSkill(absoluteSource, "local");
	if (!parsed.ok) return err(parsed.error);

	const skillName = parsed.value.name;
	const absoluteTargetDir = path.resolve(options.targetDir);
	ensureDir(absoluteTargetDir);

	const destDir = path.join(absoluteTargetDir, skillName);
	if (existsSync(destDir)) {
		return err(new Error(`Target skill already exists: ${destDir}`));
	}

	try {
		cpSync(absoluteSource, destDir, { recursive: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown copy error";
		return err(new Error(`Failed to copy skill from ${absoluteSource} to ${destDir}: ${message}`));
	}

	const meta: SkillMeta = {
		source: options.sourcePath,
		installedAt: new Date().toISOString(),
	};
	try {
		writeFileSync(
			path.join(destDir, ".gitgud-meta.json"),
			`${JSON.stringify(meta, null, 2)}\n`,
			"utf8",
		);
	} catch (error) {
		rmSync(destDir, { recursive: true, force: true });
		const message = error instanceof Error ? error.message : "Unknown write error";
		return err(new Error(`Failed to write .gitgud-meta.json: ${message}`));
	}

	return ok(skillName);
}
