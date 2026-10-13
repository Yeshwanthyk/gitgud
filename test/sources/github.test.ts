import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { discoverGithubSkills, hashSkillDir, parseGithubSource } from "../../src/sources/github";

function makeSkill(
	root: string,
	relative: string,
	name: string,
	description = `skill ${name}`,
	manifestName = "SKILL.md"
): void {
	const dir = path.join(root, relative);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		path.join(dir, manifestName),
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

		expect(discovered.value.skills.map((skill) => skill.name)).toEqual([
			"root-skill",
			"hidden-skill",
			"review-skill",
		]);
		expect(discovered.value.skills.map((skill) => skill.subpath)).toEqual([
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

	test("discovers lowercase skill.md manifests", async () => {
		makeSkill(tmpRoot, "breadboarding", "breadboarding", "Breadboarding.", "skill.md");

		const source = parseGithubSource("github:owner/repo");
		expect(source.ok).toBe(true);
		if (!source.ok) return;

		const discovered = await discoverGithubSkills(source.value, tmpRoot);
		expect(discovered.ok).toBe(true);
		if (!discovered.ok) return;

		expect(discovered.value.skills.map((skill) => skill.name)).toEqual(["breadboarding"]);
		expect(discovered.value.skills[0]?.subpath).toBe("breadboarding");
	});

	test("skips an invalid skill and keeps the rest of the source", async () => {
		makeSkill(tmpRoot, "skills/good", "good");
		makeSkill(tmpRoot, "skills/colon", "colon", "Catch up, read-only: what happened");
		mkdirSync(path.join(tmpRoot, "skills/bad"), { recursive: true });
		writeFileSync(path.join(tmpRoot, "skills/bad/SKILL.md"), "---\nname: bad\n---\nbody\n");

		const source = parseGithubSource("github:owner/repo");
		if (!source.ok) throw source.error;
		const discovered = await discoverGithubSkills(source.value, tmpRoot);
		expect(discovered.ok).toBe(true);
		if (!discovered.ok) return;

		expect(discovered.value.skills.map((skill) => skill.name)).toEqual(["colon", "good"]);
		expect(discovered.value.diagnostics).toEqual([
			{
				subpath: "skills/bad",
				level: "skipped",
				message: "Frontmatter requires a non-empty description",
			},
			{
				subpath: "skills/colon",
				level: "warning",
				message: "unquoted value containing ': ' was quoted",
			},
		]);
	});

	test("warns on skill names that differ only in case", async () => {
		makeSkill(tmpRoot, "skills/a/Thing", "Thing");
		makeSkill(tmpRoot, "skills/b/thing", "thing");

		const source = parseGithubSource("github:owner/repo");
		if (!source.ok) throw source.error;
		const discovered = await discoverGithubSkills(source.value, tmpRoot);
		expect(discovered.ok).toBe(true);
		if (!discovered.ok) return;

		expect(discovered.value.skills).toHaveLength(2);
		expect(discovered.value.diagnostics).toContainEqual({
			subpath: "skills/b/thing",
			level: "warning",
			message: "name thing is also used by skills/a/Thing",
		});
	});
});
