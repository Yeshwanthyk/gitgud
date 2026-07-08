import { existsSync } from "node:fs";
import { cp, rename, rm } from "node:fs/promises";
import path from "node:path";

import type { Scope } from "../types";
import { type LockedSkill, type LockedSource, readLockfile } from "./lockfile";
import { ensureDir, getCacheDir, getSkillsDir } from "./paths";
import { readProfile } from "./profile";
import { findSkillManifestPath, listSkillDirNames } from "./skills";

type MaterializeAction =
	| { action: "installed"; skill: string; path: string }
	| { action: "removed"; skill: string; path: string }
	| { action: "noop"; skill: string; path: string };

type MaterializeResult = {
	skillsDir: string;
	actions: MaterializeAction[];
};

function requireSkillsDir(scope: Scope): string {
	const skillsDir = getSkillsDir(scope);
	if (!skillsDir) throw new Error("Local gitgud skills directory not found.");
	return skillsDir;
}

function requireCacheDir(scope: Scope): string {
	const cacheDir = getCacheDir(scope);
	if (!cacheDir) throw new Error("Local gitgud cache not found.");
	return cacheDir;
}

function sourceCacheDir(cacheRoot: string, source: LockedSource): string {
	const [owner, repo] = source.repo.split("/", 2) as [string | undefined, string | undefined];
	if (!owner || !repo) throw new Error(`Invalid GitHub repo in lockfile: ${source.repo}`);
	return path.join(cacheRoot, "github", owner, repo, source.resolvedCommit);
}

function skillSourceDir(cacheRoot: string, source: LockedSource, skill: LockedSkill): string {
	const base = sourceCacheDir(cacheRoot, source);
	return skill.subpath === "." ? base : path.join(base, skill.subpath);
}

function enabledPresentSkills(
	sources: Record<string, LockedSource>,
	selections: Record<string, string>
): Array<{ source: LockedSource; skill: LockedSkill }> {
	const out: Array<{ source: LockedSource; skill: LockedSkill }> = [];
	for (const source of Object.values(sources)) {
		for (const skill of Object.values(source.skills)) {
			if (skill.status !== "present") continue;
			if (selections[skill.id] !== "enabled") continue;
			out.push({ source, skill });
		}
	}
	out.sort((a, b) => a.skill.name.localeCompare(b.skill.name));
	return out;
}

function assertNoNameConflicts(skills: Array<{ skill: LockedSkill }>): void {
	const owners = new Map<string, string>();
	for (const { skill } of skills) {
		const existing = owners.get(skill.name);
		if (existing) {
			throw new Error(
				`Enabled skill name conflict: ${skill.name} from ${existing} and ${skill.id}`
			);
		}
		owners.set(skill.name, skill.id);
	}
}

async function canonicalizeSkillManifest(skillDir: string): Promise<void> {
	const manifestPath = findSkillManifestPath(skillDir);
	if (!manifestPath || path.basename(manifestPath) === "SKILL.md") return;

	const canonicalPath = path.join(skillDir, "SKILL.md");
	const tempPath = path.join(skillDir, `.gitgud-${Date.now()}-SKILL.md`);
	await rename(manifestPath, tempPath);
	await rename(tempPath, canonicalPath);
}

export async function materialize(scope: Scope): Promise<MaterializeResult> {
	const profile = await readProfile(scope);
	const lockfile = await readLockfile(scope);
	const skillsDir = requireSkillsDir(scope);
	const cacheRoot = requireCacheDir(scope);
	const desired = enabledPresentSkills(lockfile.sources, profile.selections);
	assertNoNameConflicts(desired);

	ensureDir(skillsDir);
	const desiredByName = new Map(desired.map((entry) => [entry.skill.name, entry]));
	const actions: MaterializeAction[] = [];

	for (const existing of listSkillDirNames(skillsDir)) {
		if (desiredByName.has(existing)) continue;
		const target = path.join(skillsDir, existing);
		await rm(target, { recursive: true, force: true });
		actions.push({ action: "removed", skill: existing, path: target });
	}

	for (const { source, skill } of desired) {
		const from = skillSourceDir(cacheRoot, source, skill);
		if (!existsSync(from)) {
			throw new Error(`Cached skill missing: ${skill.id}. Run gitgud update ${source.id}.`);
		}
		const dest = path.join(skillsDir, skill.name);
		await rm(dest, { recursive: true, force: true });
		await cp(from, dest, { recursive: true });
		await canonicalizeSkillManifest(dest);
		actions.push({ action: "installed", skill: skill.name, path: dest });
	}

	return { skillsDir, actions };
}
