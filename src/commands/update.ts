import { chmodSync, createWriteStream, existsSync, renameSync, unlinkSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { resolveSkill } from "../core/skills";
import { installFromGithub } from "../sources/github";
import type { SkillMeta } from "../types";
import { VERSION } from "../version";

const REPO = "Yeshwanthyk/gitgud";

type ReleaseAsset = {
	name: string;
	browser_download_url: string;
};

type Release = {
	tag_name: string;
	assets: ReleaseAsset[];
};

function detectPlatform(): string {
	const platform = os.platform();
	const arch = os.arch();

	let osName: string;
	if (platform === "darwin") {
		osName = "darwin";
	} else if (platform === "linux") {
		osName = "linux";
	} else {
		throw new Error(`Unsupported platform: ${platform}`);
	}

	let archName: string;
	if (arch === "x64") {
		archName = "x64";
	} else if (arch === "arm64") {
		archName = "arm64";
	} else {
		throw new Error(`Unsupported architecture: ${arch}`);
	}

	return `${osName}-${archName}`;
}

function compareVersions(current: string, latest: string): number {
	const c = current.replace(/^v/, "").split(".").map(Number);
	const l = latest.replace(/^v/, "").split(".").map(Number);

	for (let i = 0; i < Math.max(c.length, l.length); i++) {
		const cv = c[i] ?? 0;
		const lv = l[i] ?? 0;
		if (cv < lv) return -1;
		if (cv > lv) return 1;
	}
	return 0;
}

function getCurrentBinaryPath(): string {
	const binaryPath = process.argv[0] ?? "";

	if (binaryPath.includes("bun") || binaryPath.includes("node")) {
		throw new Error(
			"Cannot self-update when running via bun/node. Use: curl -fsSL https://raw.githubusercontent.com/Yeshwanthyk/gitgud/main/install.sh | bash"
		);
	}

	return binaryPath;
}

async function readSkillMeta(skillPath: string): Promise<SkillMeta | null> {
	const metaPath = path.join(skillPath, ".gitgud-meta.json");
	if (!existsSync(metaPath)) return null;
	try {
		const raw = await readFile(metaPath, "utf8");
		return JSON.parse(raw) as SkillMeta;
	} catch {
		return null;
	}
}

/** Re-pull a single installed skill from its `source` (github only for now). */
async function updateSkill(name: string): Promise<{ ok: boolean; message: string }> {
	const resolved = resolveSkill(name);
	if (!resolved.ok) {
		return { ok: false, message: `${name}: ${resolved.error.message}` };
	}

	const skillPath = resolved.value.path;
	const meta = await readSkillMeta(skillPath);
	if (!meta) {
		return {
			ok: false,
			message: `${name}: no .gitgud-meta.json (not installed via gitgud, can't update)`,
		};
	}
	if (!meta.source.startsWith("github:")) {
		return { ok: false, message: `${name}: unsupported source ${meta.source}` };
	}

	const targetDir = path.dirname(skillPath);
	await rm(skillPath, { recursive: true, force: true });

	const res = await installFromGithub({ url: meta.source, targetDir });
	if (!res.ok) {
		return { ok: false, message: `${name}: ${res.error.message}` };
	}

	// Refresh installedAt while preserving original source/subpath.
	for (const installedPath of res.value.installed) {
		const freshMetaPath = path.join(installedPath, ".gitgud-meta.json");
		const freshMeta: SkillMeta = {
			source: meta.source,
			installedAt: new Date().toISOString(),
		};
		if (meta.subpath) freshMeta.subpath = meta.subpath;
		await writeFile(freshMetaPath, JSON.stringify(freshMeta, null, 2), "utf8");
	}

	return { ok: true, message: `${name}: updated from ${meta.source}` };
}

export async function updateSkillsCommand(names: string[]): Promise<void> {
	let targets = names;
	if (targets.length === 0) {
		// Default: every skill in ~/.gitgud/skills with a github source.
		const { getGlobalSkillsDir } = await import("../core/paths");
		const { readdirSync, statSync } = await import("node:fs");
		const dir = getGlobalSkillsDir();
		if (!existsSync(dir)) {
			console.log("No installed skills to update.");
			return;
		}
		targets = readdirSync(dir).filter((entry) => {
			const full = path.join(dir, entry);
			try {
				if (!statSync(full).isDirectory()) return false;
			} catch {
				return false;
			}
			return existsSync(path.join(full, ".gitgud-meta.json"));
		});
		if (targets.length === 0) {
			console.log("No installed skills with origin metadata to update.");
			return;
		}
	}

	let failures = 0;
	for (const name of targets) {
		const result = await updateSkill(name);
		console.log(`${result.ok ? "\u2713" : "\u2717"} ${result.message}`);
		if (!result.ok) failures++;
	}
	if (failures > 0) process.exit(1);
}

export async function updateCommand(): Promise<void> {
	console.log(`Current version: v${VERSION}`);
	console.log("Checking for updates...\n");

	const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
	if (!response.ok) {
		console.error(`Failed to check for updates: ${response.statusText}`);
		process.exit(1);
	}

	const release = (await response.json()) as Release;
	const latestVersion = release.tag_name;

	console.log(`Latest version:  ${latestVersion}`);

	const cmp = compareVersions(VERSION, latestVersion);
	if (cmp >= 0) {
		console.log("\nYou're already on the latest version!");
		return;
	}

	console.log(`\nUpdating to ${latestVersion}...`);

	const platform = detectPlatform();
	const assetName = `gitgud-${platform}`;
	const asset = release.assets.find((a) => a.name === assetName);

	if (!asset) {
		console.error(`No binary found for platform: ${platform}`);
		console.error("Available assets:", release.assets.map((a) => a.name).join(", "));
		process.exit(1);
	}

	let binaryPath: string;
	try {
		binaryPath = getCurrentBinaryPath();
	} catch (error) {
		console.error((error as Error).message);
		process.exit(1);
	}

	const tmpPath = path.join(os.tmpdir(), `gitgud-update-${Date.now()}`);

	console.log(`Downloading ${assetName}...`);
	const downloadResponse = await fetch(asset.browser_download_url);
	if (!downloadResponse.ok || !downloadResponse.body) {
		console.error(`Failed to download: ${downloadResponse.statusText}`);
		process.exit(1);
	}

	const fileStream = createWriteStream(tmpPath);
	await pipeline(downloadResponse.body as unknown as NodeJS.ReadableStream, fileStream);

	chmodSync(tmpPath, 0o755);

	try {
		const backupPath = `${binaryPath}.backup`;
		renameSync(binaryPath, backupPath);

		try {
			renameSync(tmpPath, binaryPath);
			unlinkSync(backupPath);
		} catch (error) {
			renameSync(backupPath, binaryPath);
			throw error;
		}
	} catch (error) {
		console.error(`Failed to replace binary: ${(error as Error).message}`);
		console.error("You may need to run with sudo or update manually.");
		unlinkSync(tmpPath);
		process.exit(1);
	}

	console.log(`\n✓ Updated to ${latestVersion}`);
}
