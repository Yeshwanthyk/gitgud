import { describe, expect, test } from "bun:test";

import { emptyLockfile, parseLockfile } from "../../src/core/lockfile";
import { emptyProfile, parseProfile } from "../../src/core/profile";

describe("profile and lockfile schemas", () => {
	test("parses empty profile and lockfile", () => {
		expect(parseProfile(emptyProfile())).toEqual(emptyProfile());
		expect(parseLockfile(emptyLockfile())).toEqual(emptyLockfile());
	});

	test("rejects invalid selection state", () => {
		expect(() =>
			parseProfile({
				version: 1,
				sources: [],
				selections: { "github:o/r::skill": "removed-upstream" },
			})
		).toThrow("Invalid profile selection state");
	});

	test("rejects lockfile source and skill id mismatches", () => {
		expect(() =>
			parseLockfile({
				version: 1,
				sources: {
					"github:o/r": {
						id: "github:o/other",
						type: "github",
						repo: "o/r",
						url: "https://github.com/o/r",
						ref: "main",
						resolvedCommit: "abc",
						fetchedAt: "2026-01-01T00:00:00.000Z",
						skills: {},
					},
				},
			})
		).toThrow("Lockfile source id mismatch");

		expect(() =>
			parseLockfile({
				version: 1,
				sources: {
					"github:o/r": {
						id: "github:o/r",
						type: "github",
						repo: "o/r",
						url: "https://github.com/o/r",
						ref: "main",
						resolvedCommit: "abc",
						fetchedAt: "2026-01-01T00:00:00.000Z",
						skills: {
							a: {
								id: "github:o/r::b",
								sourceId: "github:o/r",
								name: "b",
								description: "b",
								subpath: "b",
								status: "present",
								contentHash: "sha256:x",
								commit: "abc",
								lastSeenCommit: "abc",
								lastSeenAt: "2026-01-01T00:00:00.000Z",
							},
						},
					},
				},
			})
		).toThrow("Lockfile subpath mismatch");
	});

	test("drops legacy removed-upstream entries on read", () => {
		const skill = (subpath: string, status: string) => ({
			id: `github:o/r::${subpath}`,
			sourceId: "github:o/r",
			name: subpath,
			description: subpath,
			subpath,
			status,
			contentHash: "sha256:x",
			commit: "abc",
			lastSeenCommit: "abc",
			lastSeenAt: "2026-01-01T00:00:00.000Z",
		});
		const lockfile = parseLockfile({
			version: 1,
			sources: {
				"github:o/r": {
					id: "github:o/r",
					type: "github",
					repo: "o/r",
					url: "https://github.com/o/r",
					ref: "main",
					resolvedCommit: "abc",
					fetchedAt: "2026-01-01T00:00:00.000Z",
					skills: {
						live: skill("live", "present"),
						gone: { ...skill("gone", "removed-upstream"), removedAt: "2026-01-01T00:00:00.000Z" },
					},
				},
			},
		});
		expect(Object.keys(lockfile.sources["github:o/r"]?.skills ?? {})).toEqual(["live"]);
	});
});
