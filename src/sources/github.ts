import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseSkill } from "../core/skills";
import type { Result, SkillMeta } from "../types";
import { parseSource } from "./parse";

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T = never>(error: Error): Result<T> => ({ ok: false, error });

export type InstallFromGithubOptions = {
	url: string;
	subpath?: string;
	targetDir: string;
};

function normalizeGithubSource(
	inputUrl: string,
	subpath?: string,
): Result<{
	gigetSource: string;
	metaSource: string;
}> {
	const trimmed = inputUrl.trim();
	if (!trimmed) return err(new Error("Empty GitHub source URL"));

	// If already in giget format, keep provider prefix.
	if (/^[a-z]+:/.test(trimmed) && !trimmed.startsWith("http")) {
		const [base, ref] = trimmed.split("#", 2);
		const baseWithSubpath = subpath ? `${base}/${subpath}` : base;
		const reconstructed = ref ? `${baseWithSubpath}#${ref}` : baseWithSubpath;
		return ok({ gigetSource: reconstructed, metaSource: reconstructed });
	}

	try {
		const parsed = parseSource(trimmed);
		if (parsed.type !== "github") {
			return err(new Error(`Not a GitHub source: ${inputUrl}`));
		}

		const finalSubdir = subpath ?? parsed.subdir;
		const refSuffix = parsed.ref ? `#${parsed.ref}` : "";
		const gigetSource = `github:${parsed.repo}${finalSubdir ? `/${finalSubdir}` : ""}${refSuffix}`;
		return ok({ gigetSource, metaSource: gigetSource });
	} catch {
		// Treat as user/repo shorthand (optionally with #ref).
		const finalSubdir = subpath ? `/${subpath}` : "";
		const gigetSource = `github:${trimmed}${finalSubdir}`;
		return ok({ gigetSource, metaSource: gigetSource });
	}
}

async function moveDir(from: string, to: string): Promise<void> {
	try {
		await rename(from, to);
	} catch (error) {
		// Fallback for cross-device moves.
		if (error instanceof Error && (error as NodeJS.ErrnoException).code === "EXDEV") {
			await cp(from, to, { recursive: true });
			await rm(from, { recursive: true, force: true });
			return;
		}
		throw error;
	}
}

function runTarExtract(archivePath: string, extractDir: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn("tar", ["-xzf", archivePath, "-C", extractDir], {
			stdio: "pipe",
		});
		let stderr = "";
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => reject(error));
		child.on("close", (code) => {
			if (code === 0) return resolve();
			reject(new Error(`Failed to extract archive (tar exit ${code}): ${stderr.trim()}`));
		});
	});
}

async function findFirstDirectory(dir: string): Promise<string> {
	const entries = await readdir(dir);
	for (const entry of entries) {
		const fullPath = path.join(dir, entry);
		const s = await stat(fullPath);
		if (s.isDirectory()) return fullPath;
	}
	throw new Error(`No directory found in extracted archive at ${dir}`);
}

async function downloadGithubSource(gigetSource: string, tempDir: string): Promise<string> {
	const withoutPrefix = gigetSource.replace(/^github:/, "");
	const [repoAndPath, refRaw] = withoutPrefix.split("#", 2);
	const parts = repoAndPath.split("/").filter(Boolean);
	if (parts.length < 2) {
		throw new Error(`Invalid GitHub source: ${gigetSource}`);
	}
	const owner = parts[0];
	const repo = parts[1];
	const subdir = parts.slice(2).join("/");
	const ref = refRaw?.trim() || "HEAD";

	const tarUrl = `https://codeload.github.com/${owner}/${repo}/tar.gz/${ref}`;
	const res = await fetch(tarUrl, {
		headers: { "User-Agent": "gitgud" },
	});
	if (!res.ok) {
		throw new Error(`Failed to download ${tarUrl}: ${res.status} ${res.statusText}`);
	}

	const archivePath = path.join(tempDir, "repo.tgz");
	const ab = await res.arrayBuffer();
	await writeFile(archivePath, new Uint8Array(ab));

	const extractDir = path.join(tempDir, "extract");
	await mkdir(extractDir, { recursive: true });
	await runTarExtract(archivePath, extractDir);

	const rootDir = await findFirstDirectory(extractDir);
	const finalDir = subdir ? path.join(rootDir, subdir) : rootDir;
	if (!existsSync(finalDir)) {
		throw new Error(`Subpath not found in repo: ${subdir}`);
	}
	return finalDir;
}

export async function installFromGithub(
	options: InstallFromGithubOptions,
): Promise<Result<string>> {
	const normalized = normalizeGithubSource(options.url, options.subpath);
	if (!normalized.ok) return err(normalized.error);

	const { gigetSource, metaSource } = normalized.value;

	const tempBase = path.join(os.tmpdir(), "gitgud-");
	const tempDir = await mkdtemp(tempBase);

	const cleanup = async () => {
		await rm(tempDir, { recursive: true, force: true });
	};

	try {
		const downloadedDir = await downloadGithubSource(gigetSource, tempDir);
		const skillDir = path.resolve(downloadedDir);
		const parsed = parseSkill(skillDir, "local");
		if (!parsed.ok) {
			throw parsed.error;
		}

		const skillName = parsed.value.frontmatter.name;
		if (!skillName) {
			throw new Error("Skill name missing from frontmatter");
		}

		await mkdir(options.targetDir, { recursive: true });
		const destDir = path.join(options.targetDir, skillName);
		if (existsSync(destDir)) {
			throw new Error(`Skill already exists at ${destDir}`);
		}

		await moveDir(skillDir, destDir);

		const meta: SkillMeta = {
			source: metaSource,
			installedAt: new Date().toISOString(),
		};
		const metaPath = path.join(destDir, ".gitgud-meta.json");
		await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");

		await cleanup();
		return ok(destDir);
	} catch (error) {
		await cleanup();
		const message = error instanceof Error ? error.message : "Unknown GitHub install error";
		return err(new Error(message));
	}
}
