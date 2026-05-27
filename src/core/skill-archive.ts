import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Scope, Skill, SkillMeta } from "../types";
import { VERSION } from "../version";
import { readSkillMeta, writeSkillMeta } from "./metadata";
import { ensureDir, getGlobalSkillsDir, getLocalSkillsDir } from "./paths";
import { parseSkill } from "./skills";

type SkillArchiveManifestSkill = {
	name: string;
	relativeDir: string;
	description: string;
	meta?: SkillMeta;
};

type SkillArchiveManifest = {
	version: 1;
	gitgudVersion: string;
	exportedAt: string;
	sourceScope: Scope;
	skills: SkillArchiveManifestSkill[];
};

type ExportSkipped = {
	name: string;
	path: string;
	reason: string;
};

type ExportResult = {
	archivePath: string;
	sourceDir: string;
	skills: SkillArchiveManifestSkill[];
	skipped: ExportSkipped[];
};

type ImportAction = {
	name: string;
	action: "imported" | "skipped" | "replaced" | "would-import" | "would-replace";
	path: string;
	reason?: string;
};

type ImportResult = {
	archivePath: string;
	targetDir: string;
	dryRun: boolean;
	actions: ImportAction[];
};

type ImportArchiveOptions = {
	archivePath: string;
	targetDir: string;
	force: boolean;
	dryRun: boolean;
};

function assertSafeRelativePath(relativePath: string): void {
	if (relativePath.length === 0 || path.isAbsolute(relativePath)) {
		throw new Error(`Unsafe archive path: ${relativePath}`);
	}
	const normalized = path.normalize(relativePath);
	if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
		throw new Error(`Unsafe archive path: ${relativePath}`);
	}
}

function runTar(args: string[]): Promise<{ stdout: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn("tar", args, { stdio: "pipe" });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => reject(error));
		child.on("close", (code) => {
			if (code === 0) return resolve({ stdout });
			reject(new Error(`tar failed with exit ${code}: ${stderr.trim()}`));
		});
	});
}

function normalizeTarEntry(entry: string): string {
	let normalized = entry.trim();
	while (normalized.startsWith("./")) normalized = normalized.slice(2);
	return normalized;
}

async function assertSafeTarEntries(archivePath: string): Promise<void> {
	const { stdout } = await runTar(["-tzf", archivePath]);
	for (const rawEntry of stdout.split("\n")) {
		const entry = normalizeTarEntry(rawEntry);
		if (entry.length === 0 || entry === ".") continue;
		assertSafeRelativePath(entry);
	}
}

function getStoreDir(scope: Scope): string | null {
	return scope === "global" ? getGlobalSkillsDir() : getLocalSkillsDir();
}

function skillEntries(sourceDir: string): string[] {
	if (!existsSync(sourceDir)) return [];
	return readdirSync(sourceDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
		.map((entry) => entry.name)
		.sort();
}

function parseManifest(value: unknown): SkillArchiveManifest {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Invalid archive manifest.");
	}
	const record = value as Record<string, unknown>;
	if (record["version"] !== 1) throw new Error("Unsupported archive manifest version.");
	if (typeof record["gitgudVersion"] !== "string") throw new Error("Invalid archive manifest.");
	if (typeof record["exportedAt"] !== "string") throw new Error("Invalid archive manifest.");
	if (record["sourceScope"] !== "global" && record["sourceScope"] !== "local") {
		throw new Error("Invalid archive manifest source scope.");
	}
	if (!Array.isArray(record["skills"])) throw new Error("Invalid archive manifest skills.");

	const skills = record["skills"].map((item): SkillArchiveManifestSkill => {
		if (typeof item !== "object" || item === null || Array.isArray(item)) {
			throw new Error("Invalid skill entry in archive manifest.");
		}
		const skill = item as Record<string, unknown>;
		const name = skill["name"];
		const relativeDir = skill["relativeDir"];
		const description = skill["description"];
		if (
			typeof name !== "string" ||
			typeof relativeDir !== "string" ||
			typeof description !== "string"
		) {
			throw new Error("Invalid skill entry in archive manifest.");
		}
		assertSafeRelativePath(relativeDir);
		return {
			name,
			relativeDir,
			description,
		};
	});

	return {
		version: 1,
		gitgudVersion: record["gitgudVersion"],
		exportedAt: record["exportedAt"],
		sourceScope: record["sourceScope"],
		skills,
	};
}

export function getSkillsStoreDir(scope: Scope): string {
	const dir = getStoreDir(scope);
	if (!dir) throw new Error("Local skills directory not found.");
	return dir;
}

export async function exportSkillsArchive(params: {
	scope: Scope;
	archivePath: string;
	force: boolean;
}): Promise<ExportResult> {
	const sourceDir = getSkillsStoreDir(params.scope);
	const archivePath = path.resolve(params.archivePath);

	if (existsSync(archivePath) && !params.force) {
		throw new Error(`Archive already exists: ${archivePath}`);
	}

	const tempDir = await mkdtemp(path.join(os.tmpdir(), "gitgud-export-"));
	const packageDir = path.join(tempDir, "package");
	const skillsDir = path.join(packageDir, "skills");
	await rm(archivePath, { force: true });

	try {
		mkdirSync(skillsDir, { recursive: true });
		const manifestSkills: SkillArchiveManifestSkill[] = [];
		const skipped: ExportSkipped[] = [];

		for (const entry of skillEntries(sourceDir)) {
			const sourceSkillDir = path.join(sourceDir, entry);
			const parsed = parseSkill(sourceSkillDir, params.scope);
			if (!parsed.ok) {
				skipped.push({ name: entry, path: sourceSkillDir, reason: parsed.error.message });
				continue;
			}

			const skill = parsed.value;
			const relativeDir = path.join("skills", skill.name);
			await cp(sourceSkillDir, path.join(packageDir, relativeDir), {
				recursive: true,
				verbatimSymlinks: true,
			});

			const meta = await readSkillMeta(sourceSkillDir);
			manifestSkills.push({
				name: skill.name,
				relativeDir,
				description: skill.description,
				...(meta ? { meta } : {}),
			});
		}

		if (manifestSkills.length === 0) {
			throw new Error(`No valid skills found in ${sourceDir}`);
		}

		const manifest: SkillArchiveManifest = {
			version: 1,
			gitgudVersion: VERSION,
			exportedAt: new Date().toISOString(),
			sourceScope: params.scope,
			skills: manifestSkills,
		};
		await writeFile(
			path.join(packageDir, "gitgud-export.json"),
			`${JSON.stringify(manifest, null, 2)}\n`,
			"utf8"
		);
		ensureDir(path.dirname(archivePath));
		await runTar(["-czf", archivePath, "-C", packageDir, "."]);

		return {
			archivePath,
			sourceDir,
			skills: manifestSkills,
			skipped,
		};
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

async function readManifest(extractDir: string): Promise<SkillArchiveManifest> {
	const manifestPath = path.join(extractDir, "gitgud-export.json");
	if (!existsSync(manifestPath)) throw new Error("Archive missing gitgud-export.json.");
	const raw = await readFile(manifestPath, "utf8");
	return parseManifest(JSON.parse(raw) as unknown);
}

async function copyImportedSkill(params: {
	skill: Skill;
	sourceDir: string;
	targetDir: string;
	archivePath: string;
	force: boolean;
	dryRun: boolean;
}): Promise<ImportAction> {
	const destDir = path.join(params.targetDir, params.skill.name);
	const targetExists = existsSync(destDir);
	if (targetExists && !params.force) {
		return {
			name: params.skill.name,
			action: "skipped",
			path: destDir,
			reason: "already exists",
		};
	}

	if (params.dryRun) {
		return {
			name: params.skill.name,
			action: targetExists ? "would-replace" : "would-import",
			path: destDir,
		};
	}

	if (targetExists) {
		rmSync(destDir, { recursive: true, force: true });
	}

	await cp(params.sourceDir, destDir, { recursive: true, verbatimSymlinks: true });
	const meta = await readSkillMeta(destDir);
	if (!meta) {
		await writeSkillMeta(destDir, {
			source: `archive:${params.archivePath}`,
			installedAt: new Date().toISOString(),
		});
	}

	return {
		name: params.skill.name,
		action: targetExists ? "replaced" : "imported",
		path: destDir,
	};
}

export async function importSkillsArchive(options: ImportArchiveOptions): Promise<ImportResult> {
	const archivePath = path.resolve(options.archivePath);
	if (!existsSync(archivePath) || !statSync(archivePath).isFile()) {
		throw new Error(`Archive does not exist: ${archivePath}`);
	}

	const tempDir = await mkdtemp(path.join(os.tmpdir(), "gitgud-import-"));
	const extractDir = path.join(tempDir, "extract");

	try {
		mkdirSync(extractDir, { recursive: true });
		await assertSafeTarEntries(archivePath);
		await runTar(["-xzf", archivePath, "-C", extractDir]);
		const manifest = await readManifest(extractDir);
		const targetDir = path.resolve(options.targetDir);
		if (!options.dryRun) ensureDir(targetDir);

		const actions: ImportAction[] = [];
		for (const entry of manifest.skills) {
			assertSafeRelativePath(entry.relativeDir);
			const sourceDir = path.join(extractDir, entry.relativeDir);
			const parsed = parseSkill(sourceDir, "local");
			if (!parsed.ok) throw parsed.error;
			if (parsed.value.name !== entry.name) {
				throw new Error(`Manifest name mismatch: ${entry.name} != ${parsed.value.name}`);
			}
			actions.push(
				await copyImportedSkill({
					skill: parsed.value,
					sourceDir,
					targetDir,
					archivePath,
					force: options.force,
					dryRun: options.dryRun,
				})
			);
		}

		return {
			archivePath,
			targetDir,
			dryRun: options.dryRun,
			actions,
		};
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}
