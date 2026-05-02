import { existsSync, mkdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Scope } from "../types";

function homeDir(): string {
	const home = process.env["HOME"];
	return home && home.length > 0 ? home : os.homedir();
}

export function getGlobalDir(): string {
	return path.join(homeDir(), ".gitgud");
}

/** Global skill dirs for known agent CLIs, in fallback order. */
export function getAgentSkillsDirs(): { name: string; dir: string }[] {
	const home = homeDir();
	return [
		{ name: "claude", dir: path.join(home, ".claude", "skills") },
		{ name: "codex", dir: path.join(home, ".codex", "skills") },
		{ name: "pi", dir: path.join(home, ".pi", "agent", "skills") },
	];
}

export function getGlobalSkillsDir(): string {
	return path.join(getGlobalDir(), "skills");
}

export function getLocalClaudeSkillsDir(startDir: string = process.cwd()): string | null {
	let current = path.resolve(startDir);

	while (true) {
		const candidate = path.join(current, ".claude");
		try {
			if (existsSync(candidate) && statSync(candidate).isDirectory()) {
				return path.join(candidate, "skills");
			}
		} catch {
			// Ignore permission or stat errors and continue upward.
		}

		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

export function getLocalDir(startDir: string = process.cwd()): string | null {
	let current = path.resolve(startDir);

	while (true) {
		const candidate = path.join(current, ".gitgud");
		try {
			if (existsSync(candidate) && statSync(candidate).isDirectory()) {
				return candidate;
			}
		} catch {
			// Ignore permission or stat errors and continue upward.
		}

		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

export function getLocalSkillsDir(startDir: string = process.cwd()): string | null {
	const localDir = getLocalDir(startDir);
	return localDir ? path.join(localDir, "skills") : null;
}

export function getSkillsDir(scope: Scope, startDir: string = process.cwd()): string | null {
	if (scope === "global") return getGlobalSkillsDir();
	return getLocalSkillsDir(startDir);
}

export function ensureDir(dir: string): void {
	mkdirSync(dir, { recursive: true });
}
