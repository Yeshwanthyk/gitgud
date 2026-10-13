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
	type SkillDiagnostic,
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
	dropSelection,
	ensureSelection,
	type GitgudProfile,
	type GithubTrackedSource,
	readProfile,
	upsertSource,
	writeProfile,
} from "./profile";

// "kept": the skill is invalid upstream now, so its last valid version stays installed.
type SourceRefreshChange = "added" | "updated" | "removed" | "unchanged" | "kept";

type SourceRefreshEntry = {
	skill: LockedSkill;
	change: SourceRefreshChange;
};

type SourceRefreshResult = {
	source: GithubTrackedSource;
	lockSource: LockedSource;
	entries: SourceRefreshEntry[];
	diagnostics: SkillDiagnostic[];
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

export function applyDiscoveryToLock(params: {
	lockfile: GitgudLockfile;
	source: GithubTrackedSource;
	discovered: DiscoveredGithubSkill[];
	/** Subpaths with a manifest that failed to parse this refresh. */
	invalid?: ReadonlySet<string>;
	commit: string;
	now: string;
}): { lockfile: GitgudLockfile; lockSource: LockedSource; entries: SourceRefreshEntry[] } {
	const { lockfile, source, discovered, invalid = new Set<string>(), commit, now } = params;
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
			change = previous.contentHash !== next.contentHash ? "updated" : "unchanged";
		}
		entries.push({ skill: next, change });
	}

	// A skill gone upstream leaves the lock. One that is still there but invalid keeps
	// its previous entry, whose commit points materialize at the last valid content.
	for (const [subpath, previous] of Object.entries(previousSkills)) {
		if (seen.has(subpath)) continue;
		if (invalid.has(subpath)) {
			nextSkills[subpath] = previous;
			entries.push({ skill: previous, change: "kept" });
			continue;
		}
		entries.push({ skill: previous, change: "removed" });
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

/**
 * Keep one selection per locked skill: new skills start disabled, and selections
 * for skills no longer in their source's lock entry are dropped. Derived from the lock, not from
 * change events, so a failed or partial refresh cannot leave orphans behind.
 */
export function reconcileSelections(
	profile: GitgudProfile,
	lockfile: GitgudLockfile
): GitgudProfile {
	const locked = new Set<string>();
	let next = profile;
	for (const source of Object.values(lockfile.sources)) {
		for (const skill of Object.values(source.skills)) {
			locked.add(skill.id);
			next = ensureSelection(next, skill.id, "disabled");
		}
	}
	// Only prune within sources already in the lock: an imported profile carries
	// selections for sources that have not been fetched yet.
	for (const id of Object.keys(next.selections)) {
		const sourceId = id.slice(0, id.lastIndexOf("::"));
		if (!locked.has(id) && sourceId in lockfile.sources) next = dropSelection(next, id);
	}
	return next;
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
		const { skills, diagnostics } = discovered.value;

		const cacheDir = await cacheGithubSnapshot(snapshot, requireCacheDir(scope));
		const lockfile = await readLockfile(scope);
		const now = new Date().toISOString();
		const updated = applyDiscoveryToLock({
			lockfile,
			source,
			discovered: skills,
			invalid: new Set(diagnostics.filter((d) => d.level === "skipped").map((d) => d.subpath)),
			commit: snapshot.resolvedCommit,
			now,
		});
		await writeLockfile(scope, updated.lockfile);

		return {
			source,
			lockSource: updated.lockSource,
			entries: updated.entries,
			diagnostics,
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

	profile = reconcileSelections(profile, await readLockfile(scope));

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
	try {
		for (const source of selected) results.push(await refreshGithubSource(scope, source));
	} finally {
		// Runs even when a later source fails, so sources already refreshed stay consistent.
		await writeProfile(scope, reconcileSelections(profile, await readLockfile(scope)));
	}
	return results;
}
