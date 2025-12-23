import { existsSync, mkdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Scope } from "../types";

export function getGlobalDir(): string {
	// biome-ignore lint/complexity/useLiteralKeys: TS requires bracket notation for index signatures
	const home = process.env["HOME"] || os.homedir();
	return path.join(home, ".gitgud");
}

export function getClaudeSkillsDir(): string {
	// biome-ignore lint/complexity/useLiteralKeys: TS requires bracket notation for index signatures
	const home = process.env["HOME"] || os.homedir();
	return path.join(home, ".claude", "skills");
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
