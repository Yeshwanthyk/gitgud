import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { writeLockfile } from "../../src/core/lockfile";
import { materialize } from "../../src/core/materialize";
import { ensureDir, getGlobalSkillsDir } from "../../src/core/paths";
import { writeProfile } from "../../src/core/profile";

function makeSkill(root: string, name: string, body = "body"): void {
	const dir = path.join(root, name);
	ensureDir(dir);
	writeFileSync(
		path.join(dir, "SKILL.md"),
		`---\nname: ${name}\ndescription: ${name}\n---\n${body}\n`
	);
}

describe("materialize", () => {
	let tmpHome: string;
	let originalHome: string | undefined;

	beforeEach(() => {
		tmpHome = mkdtempSync(path.join(os.tmpdir(), "gitgud-materialize-"));
		// biome-ignore lint/complexity/useLiteralKeys: bracket notation
		originalHome = process.env["HOME"];
		// biome-ignore lint/complexity/useLiteralKeys: bracket notation
		process.env["HOME"] = tmpHome;
	});

	afterEach(() => {
		if (originalHome === undefined) {
			// biome-ignore lint/complexity/useLiteralKeys: bracket notation
			process.env["HOME"] = undefined;
		} else {
			// biome-ignore lint/complexity/useLiteralKeys: bracket notation
			process.env["HOME"] = originalHome;
		}
		rmSync(tmpHome, { recursive: true, force: true });
	});

	test("installs enabled present skills and removes disabled active dirs", async () => {
		const cacheRoot = path.join(tmpHome, ".gitgud", "cache", "github", "owner", "repo", "abc");
		makeSkill(cacheRoot, "alpha", "alpha cache");
		makeSkill(cacheRoot, "beta", "beta cache");

		const skillsDir = getGlobalSkillsDir();
		makeSkill(skillsDir, "stale", "stale active");
		makeSkill(skillsDir, "beta", "old beta active");

		await writeProfile("global", {
			version: 1,
			sources: [
				{
					id: "github:owner/repo",
					type: "github",
					repo: "owner/repo",
					url: "https://github.com/owner/repo",
					ref: "main",
				},
			],
			selections: {
				"github:owner/repo::alpha": "enabled",
				"github:owner/repo::beta": "disabled",
			},
		});

		await writeLockfile("global", {
			version: 1,
			sources: {
				"github:owner/repo": {
					id: "github:owner/repo",
					type: "github",
					repo: "owner/repo",
					url: "https://github.com/owner/repo",
					ref: "main",
					resolvedCommit: "abc",
					fetchedAt: "2026-01-01T00:00:00.000Z",
					skills: {
						alpha: {
							id: "github:owner/repo::alpha",
							sourceId: "github:owner/repo",
							name: "alpha",
							description: "alpha",
							subpath: "alpha",
							status: "present",
							contentHash: "sha256:a",
							commit: "abc",
							lastSeenCommit: "abc",
							lastSeenAt: "2026-01-01T00:00:00.000Z",
						},
						beta: {
							id: "github:owner/repo::beta",
							sourceId: "github:owner/repo",
							name: "beta",
							description: "beta",
							subpath: "beta",
							status: "present",
							contentHash: "sha256:b",
							commit: "abc",
							lastSeenCommit: "abc",
							lastSeenAt: "2026-01-01T00:00:00.000Z",
						},
					},
				},
			},
		});

		await materialize("global");

		expect(existsSync(path.join(skillsDir, "alpha", "SKILL.md"))).toBeTrue();
		expect(readFileSync(path.join(skillsDir, "alpha", "SKILL.md"), "utf8")).toContain(
			"alpha cache"
		);
		expect(existsSync(path.join(skillsDir, "beta"))).toBeFalse();
		expect(existsSync(path.join(skillsDir, "stale"))).toBeFalse();
	});

	test("fails on duplicate enabled skill names", async () => {
		const cacheRoot = path.join(tmpHome, ".gitgud", "cache", "github", "owner", "repo", "abc");
		makeSkill(cacheRoot, "one", "one");
		makeSkill(cacheRoot, "two", "two");
		mkdirSync(path.join(tmpHome, ".gitgud", "skills"), { recursive: true });

		await writeProfile("global", {
			version: 1,
			sources: [
				{
					id: "github:owner/repo",
					type: "github",
					repo: "owner/repo",
					url: "https://github.com/owner/repo",
					ref: "main",
				},
			],
			selections: {
				"github:owner/repo::one": "enabled",
				"github:owner/repo::two": "enabled",
			},
		});

		await writeLockfile("global", {
			version: 1,
			sources: {
				"github:owner/repo": {
					id: "github:owner/repo",
					type: "github",
					repo: "owner/repo",
					url: "https://github.com/owner/repo",
					ref: "main",
					resolvedCommit: "abc",
					fetchedAt: "2026-01-01T00:00:00.000Z",
					skills: {
						one: {
							id: "github:owner/repo::one",
							sourceId: "github:owner/repo",
							name: "same",
							description: "one",
							subpath: "one",
							status: "present",
							contentHash: "sha256:1",
							commit: "abc",
							lastSeenCommit: "abc",
							lastSeenAt: "2026-01-01T00:00:00.000Z",
						},
						two: {
							id: "github:owner/repo::two",
							sourceId: "github:owner/repo",
							name: "same",
							description: "two",
							subpath: "two",
							status: "present",
							contentHash: "sha256:2",
							commit: "abc",
							lastSeenCommit: "abc",
							lastSeenAt: "2026-01-01T00:00:00.000Z",
						},
					},
				},
			},
		});

		await expect(materialize("global")).rejects.toThrow("Enabled skill name conflict");
	});
});
