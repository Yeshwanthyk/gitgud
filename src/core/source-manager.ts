import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";

import type { Scope } from "../types";
import {
	cacheGithubSnapshot,
	type DiscoveredGithubSkill,
	downloadGithubSnapshot,
	type GithubSource,
	parseGithubSource,
	discoverGithubSkills,
} from "../sources/github";
import {
	type GitgudLockfile,
	type LockedSkill,
	type LockedSource,
	readLockfile,
	writeLockfile,
} from "./lockfile";
import { getCacheDir } from "./paths";
import {
	ensureSelection,
	type GitgudProfile,
	type GithubTrackedSource,
	readProfile,
	upsertSource,
	writeProfile,
} from "./profile";

type SourceRefreshChange = "added" | "updated" | "removed" | "unchanged";

type SourceRefreshEntry = {
	skill: LockedSkill;
	change: SourceRefreshChange;
};

type SourceRefreshResult = {
	source: GithubTrackedSource;
	lockSource: LockedSource;
	entries: SourceRefreshEntry[];
	cacheDir: string;
};

function requireCacheDir(scope: Scope): string {
	const cacheDir = getCacheDir(scope);
	if (!cacheDir) throw new Error("Local gitgud cache not found.");
	return cacheDir;
}

function toTrackedSource(source: GithubSource): GithubTrackedSource {
	return {
		id: source.id,
		type: "github",
		repo: source.repo,
		url: source.url,
		ref: source.ref,
		...(source.subdir ? { subdir: source.subdir } : {}),
	};
}

function presentLockedSkill(params: {
	discovered: DiscoveredGithubSkill;
	commit: string;
	now: string;
}): LockedSkill {
	const { discovered, commit, now } = params;
	return {
		id: discovered.id,
		sourceId: discovered.sourceId,
		name: discovered.name,
		description: discovered.description,
		subpath: discovered.subpath,
		status: "present",
		contentHash: discovered.contentHash,
		commit,
		lastSeenCommit: commit,
		lastSeenAt: now,
	};
}

function removedLockedSkill(skill: LockedSkill, commit: string, now: string): LockedSkill {
	return {
		...skill,
		status: "removed-upstream",
		commit,
		removedAt: skill.removedAt ?? now,
	};
}

export function applyDiscoveryToLock(params: {
	lockfile: GitgudLockfile;
	source: GithubTrackedSource;
	discovered: DiscoveredGithubSkill[];
	commit: string;
	now: string;
}): { lockfile: GitgudLockfile; lockSource: LockedSource; entries: SourceRefreshEntry[] } {
	const { lockfile, source, discovered, commit, now } = params;
	const previousSource = lockfile.sources[source.id];
	const previousSkills = previousSource?.skills ?? {};
	const nextSkills: Record<string, LockedSkill> = {};
	const entries: SourceRefreshEntry[] = [];
	const seen = new Set<string>();

	for (const skill of discovered) {
		seen.add(skill.subpath);
		const previous = previousSkills[skill.subpath];
		const next = presentLockedSkill({ discovered: skill, commit, now });
		nextSkills[skill.subpath] = next;

		let change: SourceRefreshChange = "added";
		if (previous) {
			change =
				previous.status === "removed-upstream" || previous.contentHash !== next.contentHash
					? "updated"
					: "unchanged";
		}
		entries.push({ skill: next, change });
	}

	for (const [subpath, previous] of Object.entries(previousSkills)) {
		if (seen.has(subpath)) continue;
		const removed = removedLockedSkill(previous, commit, now);
		nextSkills[subpath] = removed;
		entries.push({ skill: removed, change: "removed" });
	}

	const lockSource: LockedSource = {
		id: source.id,
		type: "github",
		repo: source.repo,
		url: source.url,
		ref: source.ref,
		...(source.subdir ? { subdir: source.subdir } : {}),
		resolvedCommit: commit,
		fetchedAt: now,
		skills: Object.fromEntries(Object.entries(nextSkills).sort(([a], [b]) => a.localeCompare(b))),
	};

	return {
		lockfile: {
			version: 1,
			sources: {
				...lockfile.sources,
				[source.id]: lockSource,
			},
		},
		lockSource,
		entries: entries.sort((a, b) => a.skill.subpath.localeCompare(b.skill.subpath)),
	};
}

async function refreshGithubSource(
	scope: Scope,
	source: GithubTrackedSource
): Promise<SourceRefreshResult> {
	const githubSource = parseGithubSource(
		`github:${source.repo}${source.subdir ? `/${source.subdir}` : ""}#${source.ref}`
	);
	if (!githubSource.ok) throw githubSource.error;

	const tempDir = await mkdtemp(`${os.tmpdir()}/gitgud-source-`);
	try {
		const snapshot = await downloadGithubSnapshot(githubSource.value, tempDir);
		const discovered = await discoverGithubSkills(githubSource.value, snapshot.rootDir);
		if (!discovered.ok) throw discovered.error;

		const cacheDir = await cacheGithubSnapshot(snapshot, requireCacheDir(scope));
		const lockfile = await readLockfile(scope);
		const now = new Date().toISOString();
		const updated = applyDiscoveryToLock({
			lockfile,
			source,
			discovered: discovered.value,
			commit: snapshot.resolvedCommit,
			now,
		});
		await writeLockfile(scope, updated.lockfile);

		return {
			source,
			lockSource: updated.lockSource,
			entries: updated.entries,
			cacheDir,
		};
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

export async function addGithubSourceToProfile(
	scope: Scope,
	inputUrl: string
): Promise<{ profile: GitgudProfile; source: GithubTrackedSource; refresh: SourceRefreshResult }> {
	const parsed = parseGithubSource(inputUrl);
	if (!parsed.ok) throw parsed.error;

	const source = toTrackedSource(parsed.value);
	let profile = upsertSource(await readProfile(scope), source);
	const refresh = await refreshGithubSource(scope, source);

	for (const entry of refresh.entries) {
		if (entry.skill.status !== "present") continue;
		profile = ensureSelection(profile, entry.skill.id, "disabled");
	}

	await writeProfile(scope, profile);
	return { profile, source, refresh };
}

export async function refreshProfileSources(
	scope: Scope,
	sourceIds: string[] = []
): Promise<SourceRefreshResult[]> {
	const profile = await readProfile(scope);
	const selected =
		sourceIds.length === 0
			? profile.sources
			: profile.sources.filter(
					(source) => sourceIds.includes(source.id) || sourceIds.includes(source.repo)
				);
	if (selected.length === 0) {
		throw new Error(sourceIds.length === 0 ? "No tracked sources." : "No matching tracked source.");
	}

	const results: SourceRefreshResult[] = [];
	let nextProfile = profile;
	for (const source of selected) {
		const refresh = await refreshGithubSource(scope, source);
		for (const entry of refresh.entries) {
			if (entry.skill.status !== "present") continue;
			nextProfile = ensureSelection(nextProfile, entry.skill.id, "disabled");
		}
		results.push(refresh);
	}
	await writeProfile(scope, nextProfile);
	return results;
}
