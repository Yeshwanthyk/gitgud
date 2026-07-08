import { chmodSync, createWriteStream, renameSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { materialize } from "../core/materialize";
import { refreshProfileSources } from "../core/source-manager";
import type { OutputFormat, Scope } from "../types";
import { VERSION } from "../version";
import { autoSync } from "./sync";

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
	// Inside a `bun build --compile` standalone binary, process.argv[0] is the
	// literal string "bun" (the embedded runtime name), not a path. The actual
	// on-disk path lives on process.execPath, which is what we need to swap.
	const execPath = process.execPath;
	const basename = path.basename(execPath);

	if (basename === "bun" || basename === "node") {
		throw new Error(
			"Cannot self-update when running via bun/node. Use: curl -fsSL https://raw.githubusercontent.com/Yeshwanthyk/gitgud/main/install.sh | bash"
		);
	}

	return execPath;
}

export async function updateSourcesCommand(
	args: string[],
	options: { scope: Scope; format: OutputFormat }
): Promise<void> {
	try {
		const results = await refreshProfileSources(options.scope, args);
		const materialized = await materialize(options.scope);
		if (options.scope === "global") autoSync();

		if (options.format === "json") {
			process.stdout.write(`${JSON.stringify({ ok: true, results, materialized }, null, 2)}\n`);
			return;
		}

		for (const result of results) {
			const counts = result.entries.reduce<Record<string, number>>((acc, entry) => {
				acc[entry.change] = (acc[entry.change] ?? 0) + 1;
				return acc;
			}, {});
			const summary = Object.entries(counts)
				.map(([change, count]) => `${count} ${change}`)
				.join(", ");
			process.stdout.write(`Updated ${result.source.id}${summary ? ` (${summary})` : ""}.\n`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown update error";
		process.stderr.write(`${message}\n`);
		process.exit(1);
	}
}

export async function selfUpdateCommand(): Promise<void> {
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

	// Stage the download alongside the target binary so the final swap is an
	// in-place rename on the same filesystem. Using os.tmpdir() breaks on
	// systems where /tmp is a separate mount (e.g. tmpfs): rename() across
	// filesystems fails with EXDEV.
	const tmpPath = path.join(path.dirname(binaryPath), `.gitgud-update-${Date.now()}`);

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
