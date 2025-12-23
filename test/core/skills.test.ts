import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ensureDir } from "../../src/core/paths";
import { getAllSkills, parseSkill, resolveSkill, scanSkillsDir } from "../../src/core/skills";

const fixtureDir = (name: string) => path.join("test", "fixtures", name);

const copyFixture = (name: string, destDir: string) => {
	const src = fixtureDir(name);
	cpSync(src, destDir, { recursive: true });
};

const normalize = (p: string): string => {
	try {
		return realpathSync(p);
	} catch {
		return p;
	}
};

describe("core/skills", () => {
	let tmpRoot: string;
	let originalCwd: string;
	let originalHome: string | undefined;

	beforeEach(() => {
		originalCwd = process.cwd();
		// biome-ignore lint/complexity/useLiteralKeys: TS requires bracket notation
		originalHome = process.env["HOME"];
		tmpRoot = mkdtempSync(path.join(os.tmpdir(), "gitgud-skills-"));

		// Isolate homedir for global paths.
		// biome-ignore lint/complexity/useLiteralKeys: TS requires bracket notation
		process.env["HOME"] = tmpRoot;
	});

	afterEach(() => {
		process.chdir(originalCwd);
		if (originalHome === undefined) {
			// biome-ignore lint/complexity/useLiteralKeys: TS requires bracket notation
			process.env["HOME"] = undefined;
		} else {
			// biome-ignore lint/complexity/useLiteralKeys: TS requires bracket notation
			process.env["HOME"] = originalHome;
		}
		rmSync(tmpRoot, { recursive: true, force: true });
	});

	test("parseSkill returns ok for valid skill", () => {
		const dir = path.join(tmpRoot, "valid-skill");
		copyFixture("valid-skill", dir);

		const result = parseSkill(dir, "global");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.name).toBe("valid-skill");
			expect(result.value.description).toBe("A fully specified skill for tests.");
			expect(result.value.scope).toBe("global");
			expect(result.value.path).toBe(path.resolve(dir));
			expect(result.value.frontmatter.allowedTools).toEqual(["Read", "Grep"]);
			expect(result.value.frontmatter.compatibility).toBe("Requires git");
		}
	});

	test("parseSkill errors for invalid fixtures", () => {
		const malformed = path.join(tmpRoot, "malformed");
		copyFixture("malformed-skill", malformed);
		expect(parseSkill(malformed, "global").ok).toBe(false);

		const noFrontmatter = path.join(tmpRoot, "no-frontmatter");
		copyFixture("no-frontmatter", noFrontmatter);
		expect(parseSkill(noFrontmatter, "global").ok).toBe(false);

		const empty = path.join(tmpRoot, "sample");
		copyFixture("sample-skill", empty);
		expect(parseSkill(empty, "global").ok).toBe(false);
	});

	test("parseSkill errors when directory name mismatches frontmatter name", () => {
		// Copy valid-skill to wrong-name directory
		const wrongDir = path.join(tmpRoot, "wrong-name");
		copyFixture("valid-skill", wrongDir);

		const result = parseSkill(wrongDir, "global");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("must match directory name");
			expect(result.error.message).toContain("wrong-name");
			expect(result.error.message).toContain("valid-skill");
		}
	});

	test("scanSkillsDir returns only valid skills", () => {
		const skillsDir = path.join(tmpRoot, "skills");
		ensureDir(skillsDir);
		copyFixture("minimal-skill", path.join(skillsDir, "minimal-skill"));
		copyFixture("valid-skill", path.join(skillsDir, "valid-skill"));
		copyFixture("malformed-skill", path.join(skillsDir, "malformed-skill"));

		const skills = scanSkillsDir(skillsDir, "global");
		expect(skills.map((s) => s.name)).toEqual(["minimal-skill", "valid-skill"]);
	});

	test("getAllSkills merges dirs with later shadowing", () => {
		const globalSkillsDir = path.join(tmpRoot, ".gitgud", "skills");
		ensureDir(globalSkillsDir);
		copyFixture("minimal-skill", path.join(globalSkillsDir, "minimal-skill"));
		copyFixture("valid-skill", path.join(globalSkillsDir, "valid-skill"));

		const projectRoot = path.join(tmpRoot, "project");
		const localSkillsDir = path.join(projectRoot, ".gitgud", "skills");
		ensureDir(localSkillsDir);
		copyFixture("minimal-skill", path.join(localSkillsDir, "minimal-skill"));

		process.chdir(projectRoot);

		const all = getAllSkills();
		expect(all).toHaveLength(2);

		const minimal = all.find((s) => s.name === "minimal-skill");
		const valid = all.find((s) => s.name === "valid-skill");

		// local .gitgud takes priority over global .gitgud
		expect(minimal?.scope).toBe("local");
		expect(normalize(minimal?.path ?? "")).toBe(
			normalize(path.resolve(localSkillsDir, "minimal-skill")),
		);
		// valid-skill only in global
		expect(valid?.scope).toBe("global");
	});

	test("resolveSkill checks dirs with local taking priority", () => {
		const globalSkillsDir = path.join(tmpRoot, ".gitgud", "skills");
		ensureDir(globalSkillsDir);
		copyFixture("minimal-skill", path.join(globalSkillsDir, "minimal-skill"));
		copyFixture("valid-skill", path.join(globalSkillsDir, "valid-skill"));

		const projectRoot = path.join(tmpRoot, "project2");
		const localSkillsDir = path.join(projectRoot, ".gitgud", "skills");
		ensureDir(localSkillsDir);
		copyFixture("minimal-skill", path.join(localSkillsDir, "minimal-skill"));

		process.chdir(projectRoot);

		// local .gitgud takes priority over global .gitgud
		const minimal = resolveSkill("minimal-skill");
		expect(minimal.ok).toBe(true);
		if (minimal.ok) {
			expect(minimal.value.scope).toBe("local");
		}

		// valid-skill only exists in global, so it comes from there
		const valid = resolveSkill("valid-skill");
		expect(valid.ok).toBe(true);
		if (valid.ok) {
			expect(valid.value.scope).toBe("global");
		}

		const missing = resolveSkill("nope");
		expect(missing.ok).toBe(false);
		if (!missing.ok) {
			expect(missing.error.message).toContain("Skill not found");
		}
	});

	test("precedence: local .gitgud > global .gitgud > local .claude > global .claude", () => {
		const globalClaudeSkillsDir = path.join(tmpRoot, ".claude", "skills");
		ensureDir(globalClaudeSkillsDir);
		copyFixture("minimal-skill", path.join(globalClaudeSkillsDir, "minimal-skill"));

		const globalGitgudSkillsDir = path.join(tmpRoot, ".gitgud", "skills");
		ensureDir(globalGitgudSkillsDir);
		copyFixture("minimal-skill", path.join(globalGitgudSkillsDir, "minimal-skill"));

		const projectRoot = path.join(tmpRoot, "project3");
		const localClaudeSkillsDir = path.join(projectRoot, ".claude", "skills");
		ensureDir(localClaudeSkillsDir);
		copyFixture("minimal-skill", path.join(localClaudeSkillsDir, "minimal-skill"));

		const localGitgudSkillsDir = path.join(projectRoot, ".gitgud", "skills");
		ensureDir(localGitgudSkillsDir);
		copyFixture("minimal-skill", path.join(localGitgudSkillsDir, "minimal-skill"));

		process.chdir(projectRoot);

		// local .gitgud has highest priority
		const all = getAllSkills();
		const minimal = all.find((s) => s.name === "minimal-skill");
		expect(minimal?.scope).toBe("local");
		expect(normalize(minimal?.path ?? "")).toBe(
			normalize(path.resolve(localGitgudSkillsDir, "minimal-skill")),
		);

		const resolved = resolveSkill("minimal-skill");
		expect(resolved.ok).toBe(true);
		if (resolved.ok) {
			expect(resolved.value.scope).toBe("local");
			expect(normalize(resolved.value.path)).toBe(
				normalize(path.resolve(localGitgudSkillsDir, "minimal-skill")),
			);
		}
	});
});
