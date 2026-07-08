import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { err, ok, type Result, type Scope, type Skill } from "../types";
import { parseFrontmatter } from "./frontmatter";
import {
	getAgentSkillsDirs,
	getGlobalSkillsDir,
	getLocalClaudeSkillsDir,
	getLocalSkillsDir,
} from "./paths";

const SKILL_MANIFEST_FILENAMES = ["SKILL.md", "skill.md"] as const;

type ParseSkillOptions = {
	/**
	 * Enforce that the directory basename matches the frontmatter name.
	 * On for installed skills (default). Off for pre-install parsing where
	 * the source repo may name the dir differently — install will rename
	 * the destination to frontmatter.name anyway, so the rule holds post-install.
	 */
	enforceDirName?: boolean;
};

export function findSkillManifestPath(skillDir: string): string | undefined {
	for (const filename of SKILL_MANIFEST_FILENAMES) {
		const candidate = path.join(skillDir, filename);
		if (existsSync(candidate)) return candidate;
	}
	return undefined;
}

export function parseSkill(
	skillPath: string,
	scope: Scope,
	options: ParseSkillOptions = {}
): Result<Skill> {
	const { enforceDirName = true } = options;
	const absoluteSkillPath = path.resolve(skillPath);
	let stats;
	try {
		stats = statSync(absoluteSkillPath);
	} catch {
		return err(new Error(`Skill path does not exist: ${absoluteSkillPath}`));
	}

	if (!stats.isDirectory()) {
		return err(new Error(`Skill path is not a directory: ${absoluteSkillPath}`));
	}

	const skillFile = findSkillManifestPath(absoluteSkillPath);
	if (!skillFile) {
		return err(new Error(`Missing SKILL.md at ${path.join(absoluteSkillPath, "SKILL.md")}`));
	}

	let content: string;
	try {
		content = readFileSync(skillFile, "utf8");
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown read error";
		return err(new Error(`Failed to read SKILL.md: ${message}`));
	}

	const frontmatterResult = parseFrontmatter(content);
	if (!frontmatterResult.ok) {
		return err(frontmatterResult.error);
	}

	const frontmatter = frontmatterResult.value;
	const dirName = path.basename(absoluteSkillPath);
	if (enforceDirName && dirName !== frontmatter.name) {
		return err(
			new Error(
				`Frontmatter name must match directory name: dir=${dirName} name=${frontmatter.name}`
			)
		);
	}

	return ok({
		name: frontmatter.name,
		description: frontmatter.description,
		path: absoluteSkillPath,
		scope,
		frontmatter,
	});
}

/** Immediate skill subdirectory names (excludes dotfiles), sorted. */
export function listSkillDirNames(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
		.map((entry) => entry.name)
		.sort();
}

export function scanSkillsDir(dir: string, scope: Scope): Skill[] {
	const absoluteDir = path.resolve(dir);
	let dirStats;
	try {
		dirStats = statSync(absoluteDir);
	} catch {
		return [];
	}

	if (!dirStats.isDirectory()) return [];

	const entries = readdirSync(absoluteDir, {
		withFileTypes: true,
	});

	const skills: Skill[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name.startsWith(".")) continue;

		const skillDir = path.join(absoluteDir, entry.name);
		const parsed = parseSkill(skillDir, scope);
		if (parsed.ok) {
			skills.push(parsed.value);
		}
	}

	skills.sort((a, b) => a.name.localeCompare(b.name));
	return skills;
}

export function listSkillDirNames(dir: string): string[] {
	const absoluteDir = path.resolve(dir);
	let dirStats;
	try {
		dirStats = statSync(absoluteDir);
	} catch {
		return [];
	}

	if (!dirStats.isDirectory()) return [];

	return readdirSync(absoluteDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
		.map((entry) => entry.name);
}

export function getAllSkills(): Skill[] {
	const localClaudeDir = getLocalClaudeSkillsDir();
	const localGitgudDir = getLocalSkillsDir();
	const globalGitgudDir = getGlobalSkillsDir();
	const agentDirs = getAgentSkillsDirs();

	// Precedence order (last wins in loop, so list lowest-to-highest):
	//   global agent dirs - lowest
	//   local .claude - project Claude skills
	//   global .gitgud - user overrides
	//   local .gitgud - project overrides (highest)
	const dirs: Array<{ dir: string | null; scope: Scope }> = [
		...agentDirs.map(({ dir }) => ({ dir, scope: "global" as Scope })),
		{ dir: localClaudeDir, scope: "local" },
		{ dir: globalGitgudDir, scope: "global" },
		{ dir: localGitgudDir, scope: "local" },
	];

	const merged = new Map<string, Skill>();
	for (const { dir, scope } of dirs) {
		if (!dir) continue;
		const scanned = scanSkillsDir(dir, scope);
		for (const skill of scanned) {
			merged.set(skill.name, skill);
		}
	}

	const result = Array.from(merged.values());
	result.sort((a, b) => a.name.localeCompare(b.name));
	return result;
}

export function resolveSkill(name: string): Result<Skill> {
	const localClaudeDir = getLocalClaudeSkillsDir();
	const localGitgudDir = getLocalSkillsDir();
	const globalGitgudDir = getGlobalSkillsDir();
	const agentDirs = getAgentSkillsDirs();

	// Precedence order (first match wins, so list highest-to-lowest):
	//   local .gitgud - project overrides (highest)
	//   global .gitgud - user overrides
	//   local .claude - project Claude skills
	//   global agent dirs - tool defaults
	const dirs: Array<{ dir: string | null; scope: Scope }> = [
		{ dir: localGitgudDir, scope: "local" },
		{ dir: globalGitgudDir, scope: "global" },
		{ dir: localClaudeDir, scope: "local" },
		...agentDirs.map(({ dir }) => ({ dir, scope: "global" as Scope })),
	];

	for (const entry of dirs) {
		const { dir, scope } = entry;
		if (!dir) continue;
		const skillDir = path.join(dir, name);
		if (!existsSync(skillDir)) continue;
		const parsed = parseSkill(skillDir, scope);
		if (parsed.ok) return parsed;
		return err(parsed.error);
	}

	return err(new Error(`Skill not found: ${name}`));
}
