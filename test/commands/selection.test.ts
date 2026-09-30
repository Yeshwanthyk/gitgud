import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { assertApplicable, resolveSkills } from "../../src/commands/selection";
import type { SelectableSkill } from "../../src/core/selector";

const firstId = "github:owner/one::module-map";
const secondId = "github:owner/two::module-map";

const items: SelectableSkill[] = [
	{
		id: firstId,
		name: "module-map",
		description: "",
		group: "root",
		state: "disabled",
		status: "present",
	},
	{
		id: secondId,
		name: "module-map",
		description: "",
		group: "root",
		state: "disabled",
		status: "present",
	},
	{
		id: "github:owner/one::other",
		name: "other",
		description: "",
		group: "root",
		state: "disabled",
		status: "present",
	},
];

const ids = (args: string[]) => resolveSkills(args, items).map((item) => item.id);

describe("resolveSkills", () => {
	test("resolves a unique name and a full id", () => {
		expect(ids(["other", firstId])).toEqual(["github:owner/one::other", firstId]);
	});

	test("lists matching ids for an ambiguous name", () => {
		expect(() => ids(["module-map"])).toThrow(firstId);
		expect(() => ids(["module-map"])).toThrow(secondId);
	});

	test("names an unknown skill without returning partial results", () => {
		expect(() => ids(["other", "missing"])).toThrow("Skill not found: missing.");
	});
});

describe("assertApplicable", () => {
	test("rejects enabling a second skill with an enabled name", () => {
		const enabled = items.map((item) =>
			item.id === firstId ? { ...item, state: "enabled" as const } : item
		);
		expect(() => assertApplicable(enabled, { [secondId]: "enabled" })).toThrow(
			"Enabled skill name conflict: module-map"
		);
		expect(() =>
			assertApplicable(enabled, { [firstId]: "disabled", [secondId]: "enabled" })
		).not.toThrow();
	});

	test("rejects enabling a skill removed upstream", () => {
		const removed = items.map((item) =>
			item.id === firstId ? { ...item, status: "removed-upstream" as const } : item
		);
		expect(() => assertApplicable(removed, { [firstId]: "enabled" })).toThrow(
			`Skill removed upstream: ${firstId}.`
		);
	});
});

describe("enable CLI", () => {
	let root: string | undefined;

	afterEach(() => {
		if (root) rmSync(root, { recursive: true, force: true });
		root = undefined;
	});

	test("enables a local pinned skill and materializes its cached content", () => {
		root = mkdtempSync(path.join(os.tmpdir(), "gitgud-selection-"));
		const project = path.join(root, "project");
		const registry = path.join(project, ".gitgud");
		const cache = path.join(registry, "cache", "github", "owner", "one", "abc", "module-map");
		mkdirSync(cache, { recursive: true });
		writeFileSync(
			path.join(cache, "SKILL.md"),
			"---\nname: module-map\ndescription: test\n---\nbody\n"
		);
		writeFileSync(
			path.join(registry, "profile.json"),
			JSON.stringify({
				version: 1,
				sources: [
					{
						id: "github:owner/one",
						type: "github",
						repo: "owner/one",
						url: "https://github.com/owner/one",
						ref: "main",
					},
				],
				selections: { [firstId]: "disabled" },
			})
		);
		writeFileSync(
			path.join(registry, "gitgud.lock.json"),
			JSON.stringify({
				version: 1,
				sources: {
					"github:owner/one": {
						id: "github:owner/one",
						type: "github",
						repo: "owner/one",
						url: "https://github.com/owner/one",
						ref: "main",
						resolvedCommit: "abc",
						fetchedAt: "2026-01-01T00:00:00.000Z",
						skills: {
							"module-map": {
								id: firstId,
								sourceId: "github:owner/one",
								name: "module-map",
								description: "test",
								subpath: "module-map",
								status: "present",
								contentHash: "sha256:a",
								commit: "abc",
								lastSeenCommit: "abc",
								lastSeenAt: "2026-01-01T00:00:00.000Z",
							},
						},
					},
				},
			})
		);

		const cli = path.resolve(import.meta.dir, "../../src/cli.ts");
		const run = (...args: string[]) =>
			spawnSync(process.execPath, [cli, ...args], {
				cwd: project,
				env: { ...process.env, HOME: path.join(root!, "home") },
				encoding: "utf8",
			});
		const enabled = run("enable", "module-map", "--local", "--json");
		expect(enabled.status).toBe(0);
		expect(JSON.parse(enabled.stdout)).toMatchObject({ ok: true, updated: 1 });
		expect(
			JSON.parse(readFileSync(path.join(registry, "profile.json"), "utf8")).selections[firstId]
		).toBe("enabled");
		expect(existsSync(path.join(registry, "skills", "module-map", "SKILL.md"))).toBeTrue();

		const repeated = run("enable", firstId, "--local", "--json");
		expect(repeated.status).toBe(0);
		expect(JSON.parse(repeated.stdout)).toMatchObject({ ok: true, updated: 0 });

		const invalid = run("disable", "module-map", "missing", "--local");
		expect(invalid.status).toBe(1);
		expect(invalid.stderr).toContain("Skill not found: missing.");
		expect(
			JSON.parse(readFileSync(path.join(registry, "profile.json"), "utf8")).selections[firstId]
		).toBe("enabled");

		const disabled = run("disable", firstId, "--local");
		expect(disabled.status).toBe(0);
		expect(disabled.stdout).toBe("Disabled 1 skill(s).\n");
		expect(
			JSON.parse(readFileSync(path.join(registry, "profile.json"), "utf8")).selections[firstId]
		).toBe("disabled");
		expect(existsSync(path.join(registry, "skills", "module-map"))).toBeFalse();

		const noArgs = run("enable", "--local");
		expect(noArgs.status).toBe(1);
		expect(noArgs.stderr).toContain("Usage: gitgud enable <skill...>");
	});
});
