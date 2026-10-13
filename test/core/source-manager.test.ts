import { describe, expect, test } from "bun:test";

import type { GitgudLockfile } from "../../src/core/lockfile";
import type { GitgudProfile } from "../../src/core/profile";
import { applyDiscoveryToLock, reconcileSelections } from "../../src/core/source-manager";

describe("source-manager lock merge", () => {
	test("classifies added, updated, removed, and unchanged skills; drops removed skills from the lock", () => {
		const source = {
			id: "github:owner/repo",
			type: "github" as const,
			repo: "owner/repo",
			url: "https://github.com/owner/repo",
			ref: "main",
		};
		const now = "2026-01-01T00:00:00.000Z";

		const result = applyDiscoveryToLock({
			source,
			commit: "new",
			now,
			lockfile: {
				version: 1,
				sources: {
					"github:owner/repo": {
						...source,
						resolvedCommit: "old",
						fetchedAt: now,
						skills: {
							unchanged: {
								id: "github:owner/repo::unchanged",
								sourceId: source.id,
								name: "unchanged",
								description: "unchanged",
								subpath: "unchanged",
								status: "present",
								contentHash: "sha256:same",
								commit: "old",
								lastSeenCommit: "old",
								lastSeenAt: now,
							},
							changed: {
								id: "github:owner/repo::changed",
								sourceId: source.id,
								name: "changed",
								description: "changed",
								subpath: "changed",
								status: "present",
								contentHash: "sha256:old",
								commit: "old",
								lastSeenCommit: "old",
								lastSeenAt: now,
							},
							missing: {
								id: "github:owner/repo::missing",
								sourceId: source.id,
								name: "missing",
								description: "missing",
								subpath: "missing",
								status: "present",
								contentHash: "sha256:missing",
								commit: "old",
								lastSeenCommit: "old",
								lastSeenAt: now,
							},
						},
					},
				},
			},
			discovered: [
				{
					id: "github:owner/repo::unchanged",
					sourceId: source.id,
					name: "unchanged",
					description: "unchanged",
					subpath: "unchanged",
					path: "/tmp/unchanged",
					contentHash: "sha256:same",
				},
				{
					id: "github:owner/repo::changed",
					sourceId: source.id,
					name: "changed",
					description: "changed",
					subpath: "changed",
					path: "/tmp/changed",
					contentHash: "sha256:new",
				},
				{
					id: "github:owner/repo::added",
					sourceId: source.id,
					name: "added",
					description: "added",
					subpath: "added",
					path: "/tmp/added",
					contentHash: "sha256:added",
				},
			],
		});

		expect(
			Object.fromEntries(result.entries.map((entry) => [entry.skill.subpath, entry.change]))
		).toEqual({
			added: "added",
			changed: "updated",
			missing: "removed",
			unchanged: "unchanged",
		});
		expect(Object.keys(result.lockSource.skills).sort()).toEqual(["added", "changed", "unchanged"]);
		expect(result.lockSource.skills["added"]?.status).toBe("present");
	});

	test("an enabled skill that turns invalid is kept, then updates when valid again", () => {
		const source = {
			id: "github:o/r",
			type: "github" as const,
			repo: "o/r",
			url: "https://github.com/o/r",
			ref: "main",
		};
		const discovered = (hash: string) => ({
			id: "github:o/r::recap",
			sourceId: source.id,
			name: "recap",
			description: "recap",
			subpath: "recap",
			path: "/tmp/recap",
			contentHash: hash,
		});
		const profile: GitgudProfile = {
			version: 1,
			sources: [source],
			selections: { "github:o/r::recap": "enabled" },
		};
		const empty: GitgudLockfile = { version: 1, sources: {} };

		const first = applyDiscoveryToLock({
			lockfile: empty,
			source,
			discovered: [discovered("sha256:v1")],
			commit: "c1",
			now: "t1",
		});
		const broken = applyDiscoveryToLock({
			lockfile: first.lockfile,
			source,
			discovered: [],
			invalid: new Set(["recap"]),
			commit: "c2",
			now: "t2",
		});
		expect(broken.entries.map((e) => e.change)).toEqual(["kept"]);
		expect(broken.lockSource.resolvedCommit).toBe("c2");
		expect(broken.lockSource.skills["recap"]?.commit).toBe("c1");
		expect(reconcileSelections(profile, broken.lockfile).selections).toEqual(profile.selections);

		const fixed = applyDiscoveryToLock({
			lockfile: broken.lockfile,
			source,
			discovered: [discovered("sha256:v2")],
			commit: "c3",
			now: "t3",
		});
		expect(fixed.entries.map((e) => e.change)).toEqual(["updated"]);
		expect(fixed.lockSource.skills["recap"]?.commit).toBe("c3");
		expect(reconcileSelections(profile, fixed.lockfile).selections).toEqual(profile.selections);
	});
});

describe("reconcileSelections", () => {
	const lockfile: GitgudLockfile = {
		version: 1,
		sources: {
			"github:o/r": {
				id: "github:o/r",
				type: "github",
				repo: "o/r",
				url: "https://github.com/o/r",
				ref: "main",
				resolvedCommit: "abc",
				fetchedAt: "t",
				skills: {
					fresh: {
						id: "github:o/r::fresh",
						sourceId: "github:o/r",
						name: "fresh",
						description: "fresh",
						subpath: "fresh",
						status: "present",
						contentHash: "sha256:x",
						commit: "abc",
						lastSeenCommit: "abc",
						lastSeenAt: "t",
					},
				},
			},
		},
	};

	test("adds new skills disabled, drops orphans in locked sources, keeps unfetched sources", () => {
		const profile: GitgudProfile = {
			version: 1,
			sources: [],
			selections: {
				"github:o/r::gone": "enabled",
				"github:o/unfetched::kept": "enabled",
			},
		};
		expect(reconcileSelections(profile, lockfile).selections).toEqual({
			"github:o/r::fresh": "disabled",
			"github:o/unfetched::kept": "enabled",
		});
	});
});
