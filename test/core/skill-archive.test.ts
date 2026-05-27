import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { exportSkillsArchive, importSkillsArchive } from "../../src/core/skill-archive";

function makeSkill(root: string, name: string, description = `test skill ${name}`): string {
	const dir = path.join(root, name);
	mkdirSync(path.join(dir, "scripts"), { recursive: true });
	writeFileSync(
		path.join(dir, "SKILL.md"),
		`---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`,
		"utf8"
	);
	writeFileSync(path.join(dir, "scripts", "run.sh"), "echo ok\n", "utf8");
	return dir;
}

describe("core/skill-archive", () => {
	let tmpHome: string;
	let originalHome: string | undefined;

	beforeEach(() => {
		tmpHome = mkdtempSync(path.join(os.tmpdir(), "gitgud-archive-"));
		originalHome = process.env["HOME"];
		process.env["HOME"] = tmpHome;
		mkdirSync(path.join(tmpHome, ".gitgud", "skills"), { recursive: true });
	});

	afterEach(() => {
		if (originalHome === undefined) {
			process.env["HOME"] = undefined;
		} else {
			process.env["HOME"] = originalHome;
		}
		rmSync(tmpHome, { recursive: true, force: true });
	});

	test("exports valid skills and imports a full directory tree", async () => {
		const sourceRoot = path.join(tmpHome, ".gitgud", "skills");
		const skillDir = makeSkill(sourceRoot, "alpha");
		writeFileSync(
			path.join(skillDir, ".gitgud-meta.json"),
			`${JSON.stringify({ source: "github:owner/repo", installedAt: "2026-01-01T00:00:00.000Z" }, null, 2)}\n`,
			"utf8"
		);
		mkdirSync(path.join(sourceRoot, "broken"));

		const archivePath = path.join(tmpHome, "skills.tgz");
		const exported = await exportSkillsArchive({
			scope: "global",
			archivePath,
			force: false,
		});

		expect(existsSync(archivePath)).toBeTrue();
		expect(exported.skills.map((skill) => skill.name)).toEqual(["alpha"]);
		expect(exported.skipped.map((skill) => skill.name)).toEqual(["broken"]);

		const targetDir = path.join(tmpHome, "imported");
		const imported = await importSkillsArchive({
			archivePath,
			targetDir,
			force: false,
			dryRun: false,
		});

		expect(imported.actions).toEqual([
			{
				name: "alpha",
				action: "imported",
				path: path.join(targetDir, "alpha"),
			},
		]);
		expect(readFileSync(path.join(targetDir, "alpha", "scripts", "run.sh"), "utf8")).toBe(
			"echo ok\n"
		);
		const meta = JSON.parse(
			readFileSync(path.join(targetDir, "alpha", ".gitgud-meta.json"), "utf8")
		) as { source: string };
		expect(meta.source).toBe("github:owner/repo");
	});

	test("import skips existing skills unless force is set", async () => {
		const sourceRoot = path.join(tmpHome, ".gitgud", "skills");
		makeSkill(sourceRoot, "alpha", "new alpha");
		const archivePath = path.join(tmpHome, "skills.tgz");
		await exportSkillsArchive({ scope: "global", archivePath, force: false });

		const targetDir = path.join(tmpHome, "target");
		makeSkill(targetDir, "alpha", "old alpha");

		const skipped = await importSkillsArchive({
			archivePath,
			targetDir,
			force: false,
			dryRun: false,
		});
		expect(skipped.actions[0]?.action).toBe("skipped");
		expect(readFileSync(path.join(targetDir, "alpha", "SKILL.md"), "utf8")).toContain("old alpha");

		const replaced = await importSkillsArchive({
			archivePath,
			targetDir,
			force: true,
			dryRun: false,
		});
		expect(replaced.actions[0]?.action).toBe("replaced");
		expect(readFileSync(path.join(targetDir, "alpha", "SKILL.md"), "utf8")).toContain("new alpha");
	});

	test("import dry-run reports changes without writing", async () => {
		makeSkill(path.join(tmpHome, ".gitgud", "skills"), "alpha");
		const archivePath = path.join(tmpHome, "skills.tgz");
		await exportSkillsArchive({ scope: "global", archivePath, force: false });

		const targetDir = path.join(tmpHome, "dry-run-target");
		const result = await importSkillsArchive({
			archivePath,
			targetDir,
			force: false,
			dryRun: true,
		});

		expect(result.actions[0]?.action).toBe("would-import");
		expect(existsSync(path.join(targetDir, "alpha"))).toBeFalse();
	});
});
