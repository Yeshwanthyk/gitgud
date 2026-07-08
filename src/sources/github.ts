import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
	cp,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { findSkillManifestPath, parseSkill } from "../core/skills";
import { err, ok, type Result, type SkillMeta } from "../types";
import { parseSource } from "./parse";

type InstallFromGithubOptions = {
	url: string;
	subpath?: string | undefined;
	targetDir: string;
};

export type GithubSource = {
	id: string;
	repo: string;
	owner: string;
	name: string;
	url: string;
	ref: string;
	source: string;
	subdir?: string;
};

type GithubSnapshot = {
	source: GithubSource;
	rootDir: string;
	resolvedCommit: string;
};

export type DiscoveredGithubSkill = {
	id: string;
	sourceId: string;
	name: string;
	description: string;
	subpath: string;
	path: string;
	contentHash: string;
};

/** Normalize any accepted GitHub spelling into a single `github:owner/repo[/sub][#ref]` source. */
function normalizeGithubSource(inputUrl: string, subpath?: string): Result<string> {
	const trimmed = inputUrl.trim();
	if (!trimmed) return err(new Error("Empty GitHub source URL"));

	// Already in provider-prefixed form (e.g. `github:owner/repo#ref`).
	if (/^[a-z]+:/.test(trimmed) && !trimmed.startsWith("http")) {
		const [base, ref] = trimmed.split("#", 2) as [string, string | undefined];
		const baseWithSubpath = subpath ? `${base}/${subpath}` : base;
		return ok(ref ? `${baseWithSubpath}#${ref}` : baseWithSubpath);
	}

	try {
		const parsed = parseSource(trimmed);
		if (parsed.type !== "github") {
			return err(new Error(`Not a GitHub source: ${inputUrl}`));
		}

		const finalSubdir = subpath ?? parsed.subdir;
		const refSuffix = parsed.ref ? `#${parsed.ref}` : "";
		return ok(`github:${parsed.repo}${finalSubdir ? `/${finalSubdir}` : ""}${refSuffix}`);
	} catch {
		// Treat as user/repo shorthand (optionally with #ref).
		const finalSubdir = subpath ? `/${subpath}` : "";
		return ok(`github:${trimmed}${finalSubdir}`);
	}
}

function parseNormalizedGithubSource(source: string): Result<GithubSource> {
	const withoutPrefix = source.replace(/^github:/, "");
	const [repoAndPath, refRaw] = withoutPrefix.split("#", 2) as [string, string | undefined];
	const parts = repoAndPath.split("/").filter(Boolean);
	if (parts.length < 2) {
		return err(new Error(`Invalid GitHub source: ${source}`));
	}

	const owner = parts[0] as string;
	const name = parts[1] as string;
	const repo = `${owner}/${name}`;
	const subdir = parts.slice(2).join("/");
	const ref = refRaw && refRaw.trim().length > 0 ? refRaw.trim() : "HEAD";
	const id = `github:${repo}${subdir ? `/${subdir}` : ""}`;
	const url = subdir
		? `https://github.com/${repo}/tree/${encodeURIComponent(ref)}/${subdir}`
		: `https://github.com/${repo}`;

	return ok({
		id,
		repo,
		owner,
		name,
		url,
		ref,
		source,
		...(subdir ? { subdir } : {}),
	});
}

export function parseGithubSource(inputUrl: string, subpath?: string): Result<GithubSource> {
	const normalized = normalizeGithubSource(inputUrl, subpath);
	if (!normalized.ok) return err(normalized.error);
	return parseNormalizedGithubSource(normalized.value);
}

function runTarExtract(archivePath: string, extractDir: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn("tar", ["-xzf", archivePath, "-C", extractDir], {
			stdio: "pipe",
		});
		let stderr = "";
		child.stderr.on("data", (chunk: Buffer) => {
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

// Hidden directories that commonly contain agent skills. Without this list,
// repos that ship skills under .agents/, .claude/, .codex/, .pi/ would be
// invisible to gitgud because we otherwise skip dotfile dirs to avoid .git etc.
const AGENT_SKILL_HIDDEN_DIRS = new Set([".agents", ".claude", ".codex", ".pi", ".gitgud"]);

/**
 * Recursively search for skill manifest files in a directory.
 * Returns paths to directories containing a manifest, sorted by depth (shallowest first).
 */
async function findSkillDirs(dir: string, maxDepth = 5): Promise<string[]> {
	const results: { path: string; depth: number }[] = [];

	async function search(currentDir: string, depth: number): Promise<void> {
		if (depth > maxDepth) return;

		if (findSkillManifestPath(currentDir)) {
			results.push({ path: currentDir, depth });
			return; // Don't search inside skill directories
		}

		try {
			const entries = await readdir(currentDir);
			for (const entry of entries) {
				if (entry.startsWith(".") && !AGENT_SKILL_HIDDEN_DIRS.has(entry)) continue;
				const fullPath = path.join(currentDir, entry);
				const s = await stat(fullPath);
				if (s.isDirectory()) {
					await search(fullPath, depth + 1);
				}
			}
		} catch {
			// Ignore permission errors, etc.
		}
	}

	await search(dir, 0);
	return results.sort((a, b) => a.depth - b.depth).map((r) => r.path);
}

async function findAllSkillDirs(dir: string, maxDepth = 5): Promise<string[]> {
	const results: { path: string; depth: number }[] = [];

	async function search(currentDir: string, depth: number): Promise<void> {
		if (depth > maxDepth) return;

		if (findSkillManifestPath(currentDir)) {
			results.push({ path: currentDir, depth });
		}

		try {
			const entries = await readdir(currentDir);
			for (const entry of entries) {
				if (entry.startsWith(".") && !AGENT_SKILL_HIDDEN_DIRS.has(entry)) continue;
				const fullPath = path.join(currentDir, entry);
				const s = await stat(fullPath);
				if (s.isDirectory()) {
					await search(fullPath, depth + 1);
				}
			}
		} catch {
			// Ignore permission errors, etc.
		}
	}

	await search(dir, 0);
	return results
		.sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path))
		.map((r) => r.path);
}

async function listFilesRecursive(dir: string): Promise<string[]> {
	const files: string[] = [];

	async function walk(currentDir: string): Promise<void> {
		const entries = await readdir(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name === ".git") continue;
			const fullPath = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				await walk(fullPath);
			} else if (entry.isFile()) {
				files.push(path.relative(dir, fullPath));
			}
		}
	}

	await walk(dir);
	return files.sort();
}

async function canonicalizeSkillManifest(skillDir: string): Promise<void> {
	const manifestPath = findSkillManifestPath(skillDir);
	if (!manifestPath || path.basename(manifestPath) === "SKILL.md") return;

	const canonicalPath = path.join(skillDir, "SKILL.md");
	const tempPath = path.join(skillDir, `.gitgud-${Date.now()}-SKILL.md`);
	await rename(manifestPath, tempPath);
	await rename(tempPath, canonicalPath);
}

export async function hashSkillDir(dir: string): Promise<string> {
	const hash = createHash("sha256");
	for (const relativePath of await listFilesRecursive(dir)) {
		const filePath = path.join(dir, relativePath);
		hash.update(relativePath);
		hash.update("\0");
		hash.update(await readFile(filePath));
		hash.update("\0");
	}
	return `sha256:${hash.digest("hex")}`;
}

async function resolveGithubCommit(source: GithubSource): Promise<string> {
	const apiUrl = `https://api.github.com/repos/${source.repo}/commits/${encodeURIComponent(source.ref)}`;
	const res = await fetch(apiUrl, {
		headers: {
			"User-Agent": "gitgud",
			Accept: "application/vnd.github+json",
		},
	});
	if (!res.ok) {
		throw new Error(
			`Failed to resolve ${source.repo}@${source.ref}: ${res.status} ${res.statusText}`
		);
	}
	const data = (await res.json()) as unknown;
	if (typeof data !== "object" || data === null || !("sha" in data)) {
		throw new Error(`GitHub did not return a commit SHA for ${source.repo}@${source.ref}`);
	}
	const sha = (data as { sha?: unknown }).sha;
	if (typeof sha !== "string" || sha.length === 0) {
		throw new Error(`GitHub returned an invalid commit SHA for ${source.repo}@${source.ref}`);
	}
	return sha;
}

async function downloadGithubSource(source: string, tempDir: string): Promise<string> {
	const withoutPrefix = source.replace(/^github:/, "");
	const [repoAndPath, refRaw] = withoutPrefix.split("#", 2) as [string, string | undefined];
	const parts = repoAndPath.split("/").filter(Boolean);
	if (parts.length < 2) {
		throw new Error(`Invalid GitHub source: ${source}`);
	}
	const owner = parts[0] as string;
	const repo = parts[1] as string;
	const subdir = parts.slice(2).join("/");
	const trimmedRef = refRaw?.trim();
	const ref = trimmedRef && trimmedRef.length > 0 ? trimmedRef : "HEAD";

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

export async function downloadGithubSnapshot(
	source: GithubSource,
	tempDir: string
): Promise<GithubSnapshot> {
	let resolvedCommit: string;
	try {
		resolvedCommit = await resolveGithubCommit(source);
	} catch {
		resolvedCommit = source.ref;
	}

	const downloadSource = `github:${source.repo}${source.subdir ? `/${source.subdir}` : ""}#${resolvedCommit}`;
	const rootDir = await downloadGithubSource(downloadSource, tempDir);
	return { source, rootDir, resolvedCommit };
}

export async function cacheGithubSnapshot(
	snapshot: GithubSnapshot,
	cacheRoot: string
): Promise<string> {
	const cacheDir = path.join(
		cacheRoot,
		"github",
		snapshot.source.owner,
		snapshot.source.name,
		snapshot.resolvedCommit
	);
	await rm(cacheDir, { recursive: true, force: true });
	await mkdir(path.dirname(cacheDir), { recursive: true });
	await cp(snapshot.rootDir, cacheDir, { recursive: true });
	return cacheDir;
}

export async function discoverGithubSkills(
	source: GithubSource,
	rootDir: string
): Promise<Result<DiscoveredGithubSkill[]>> {
	const candidateDirs = await findAllSkillDirs(rootDir);
	if (candidateDirs.length === 0) {
		return err(
			new Error(
				"No SKILL.md found in repository. Expected at root or in a subdirectory.\n" +
					"Hint: Use a URL with subpath like: https://github.com/user/repo/tree/main/path/to/skill"
			)
		);
	}

	const parseOpts = { enforceDirName: false } as const;
	const skills: DiscoveredGithubSkill[] = [];
	for (const candidateDir of candidateDirs) {
		const parsed = parseSkill(candidateDir, "local", parseOpts);
		if (!parsed.ok) return err(parsed.error);
		const subpath = path.relative(rootDir, candidateDir);
		const normalizedSubpath = subpath.length > 0 ? subpath : ".";
		const id = `${source.id}::${normalizedSubpath}`;
		skills.push({
			id,
			sourceId: source.id,
			name: parsed.value.name,
			description: parsed.value.description,
			subpath: normalizedSubpath,
			path: candidateDir,
			contentHash: await hashSkillDir(candidateDir),
		});
	}

	skills.sort((a, b) => a.subpath.localeCompare(b.subpath));
	return ok(skills);
}

export interface GithubInstallResult {
	installed: string[];
	skipped: { name: string; reason: string }[];
}

export async function installFromGithub(
	options: InstallFromGithubOptions
): Promise<Result<GithubInstallResult>> {
	const normalized = normalizeGithubSource(options.url, options.subpath);
	if (!normalized.ok) return err(normalized.error);

	const source = normalized.value;

	const tempBase = path.join(os.tmpdir(), "gitgud-");
	const tempDir = await mkdtemp(tempBase);

	const cleanup = async () => {
		await rm(tempDir, { recursive: true, force: true });
	};

	try {
		const downloadedDir = await downloadGithubSource(source, tempDir);
		const repoRoot = path.resolve(downloadedDir);

		// Try parsing at root first. Skip the dirname-equals-frontmatter-name
		// check during pre-install — the destination dir is named per
		// frontmatter.name below, so the invariant holds post-install even when
		// the upstream repo used a different folder name.
		const parseOpts = { enforceDirName: false } as const;
		const parsed = parseSkill(repoRoot, "local", parseOpts);
		let candidates: string[];

		if (parsed.ok) {
			candidates = [repoRoot];
		} else {
			// Auto-discover nested skills (descends into known agent dirs like
			// .agents/, .claude/, .codex/, .pi/ as well as plain subdirs).
			candidates = await findSkillDirs(repoRoot);
			if (candidates.length === 0) {
				throw new Error(
					"No SKILL.md found in repository. Expected at root or in a subdirectory.\n" +
						"Hint: Use a URL with subpath like: https://github.com/user/repo/tree/main/path/to/skill"
				);
			}
		}

		await mkdir(options.targetDir, { recursive: true });

		const installed: string[] = [];
		const skipped: { name: string; reason: string }[] = [];

		for (const candidateDir of candidates) {
			const parsedSkill = parseSkill(candidateDir, "local", parseOpts);
			if (!parsedSkill.ok) {
				skipped.push({
					name: path.relative(repoRoot, candidateDir) || "<root>",
					reason: parsedSkill.error.message,
				});
				continue;
			}

			const skillName = parsedSkill.value.frontmatter.name;
			const destDir = path.join(options.targetDir, skillName);
			if (existsSync(destDir)) {
				skipped.push({
					name: skillName,
					reason: `already installed at ${destDir}`,
				});
				continue;
			}

			// cp instead of moveDir so each skill in a multi-skill repo gets its
			// own copy (the candidate dirs share the same temp tree).
			await cp(candidateDir, destDir, { recursive: true });
			await canonicalizeSkillManifest(destDir);

			const subpath = path.relative(repoRoot, candidateDir);
			const meta: SkillMeta = {
				source,
				installedAt: new Date().toISOString(),
			};
			if (subpath) meta.subpath = subpath;
			const metaPath = path.join(destDir, ".gitgud-meta.json");
			await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");

			installed.push(destDir);
		}

		await cleanup();

		if (installed.length === 0) {
			const detail = skipped.map((s) => `  - ${s.name}: ${s.reason}`).join("\n");
			return err(new Error(`No skills installed.\n${detail}`));
		}

		return ok({ installed, skipped });
	} catch (error) {
		await cleanup();
		const message = error instanceof Error ? error.message : "Unknown GitHub install error";
		return err(new Error(message));
	}
}
