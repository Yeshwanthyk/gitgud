import { describe, expect, test } from "bun:test";

import { applyDiscoveryToLock } from "../../src/core/source-manager";

describe("source-manager lock merge", () => {
	test("classifies added, updated, removed, and unchanged skills", () => {
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
		expect(result.lockSource.skills["missing"]?.status).toBe("removed-upstream");
		expect(result.lockSource.skills["added"]?.status).toBe("present");
	});
});
