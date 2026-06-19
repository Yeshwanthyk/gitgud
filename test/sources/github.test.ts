import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { discoverGithubSkills, hashSkillDir, parseGithubSource } from "../../src/sources/github";

function makeSkill(
	root: string,
	relative: string,
	name: string,
	description = `skill ${name}`
): void {
	const dir = path.join(root, relative);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		path.join(dir, "SKILL.md"),
		`---\nname: ${name}\ndescription: ${description}\n---\nbody\n`
	);
}

describe("sources/github discovery", () => {
	let tmpRoot: string;

	beforeEach(() => {
		tmpRoot = mkdtempSync(path.join(os.tmpdir(), "gitgud-github-"));
	});

	afterEach(() => {
		rmSync(tmpRoot, { recursive: true, force: true });
	});

	test("parses a GitHub source into stable source identity", () => {
		const parsed = parseGithubSource("https://github.com/mattpocock/skills/tree/main/skills");
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.value.id).toBe("github:mattpocock/skills/skills");
		expect(parsed.value.repo).toBe("mattpocock/skills");
		expect(parsed.value.ref).toBe("main");
		expect(parsed.value.subdir).toBe("skills");
	});

	test("discovers root and nested skills instead of short-circuiting at root", async () => {
		makeSkill(tmpRoot, ".", "root-skill");
		makeSkill(tmpRoot, "skills/engineering/review", "review-skill");
		makeSkill(tmpRoot, ".agents/skills/hidden", "hidden-skill");

		const source = parseGithubSource("github:owner/repo");
		expect(source.ok).toBe(true);
		if (!source.ok) return;

		const discovered = await discoverGithubSkills(source.value, tmpRoot);
		expect(discovered.ok).toBe(true);
		if (!discovered.ok) return;

		expect(discovered.value.map((skill) => skill.name)).toEqual([
			"root-skill",
			"hidden-skill",
			"review-skill",
		]);
		expect(discovered.value.map((skill) => skill.subpath)).toEqual([
			".",
			".agents/skills/hidden",
			"skills/engineering/review",
		]);
	});

	test("hashSkillDir changes when bundled files change", async () => {
		makeSkill(tmpRoot, "skill", "hash-skill");
		const dir = path.join(tmpRoot, "skill");
		const before = await hashSkillDir(dir);
		writeFileSync(path.join(dir, "extra.txt"), "new data");
		const after = await hashSkillDir(dir);
		expect(after).not.toBe(before);
		expect(after.startsWith("sha256:")).toBeTrue();
	});
});
