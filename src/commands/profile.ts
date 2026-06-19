import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseLockfile, writeLockfile } from "../core/lockfile";
import { materialize } from "../core/materialize";
import { ensureDir } from "../core/paths";
import { parseProfile, readProfile, writeProfile } from "../core/profile";
import { refreshProfileSources } from "../core/source-manager";
import { formatError } from "../output";
import type { OutputFormat, Scope } from "../types";
import { autoSync } from "./sync";

type ProfileOptions = {
	scope: Scope;
	format: OutputFormat;
	dryRun: boolean;
	force: boolean;
};

type PortableProfile = {
	version: 1;
	exportedAt: string;
	profile: unknown;
	lockfile: unknown;
};

function fail(message: string, format: OutputFormat): never {
	process.stderr.write(`${formatError(message, format)}\n`);
	process.exit(1);
}

function parsePortableProfile(value: unknown): PortableProfile {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Invalid profile export.");
	}
	const record = value as Record<string, unknown>;
	if (record["version"] !== 1) throw new Error("Unsupported profile export version.");
	if (typeof record["exportedAt"] !== "string") throw new Error("Invalid profile export.");
	if (!("profile" in record) || !("lockfile" in record)) throw new Error("Invalid profile export.");
	return {
		version: 1,
		exportedAt: record["exportedAt"],
		profile: record["profile"],
		lockfile: record["lockfile"],
	};
}

async function exportProfile(filePath: string, options: ProfileOptions): Promise<void> {
	const outputPath = path.resolve(filePath);
	if (existsSync(outputPath) && !options.force) {
		throw new Error(`Profile export already exists: ${outputPath}`);
	}

	const profile = await readProfile(options.scope);
	const { readLockfile } = await import("../core/lockfile");
	const lockfile = await readLockfile(options.scope);
	const portable: PortableProfile = {
		version: 1,
		exportedAt: new Date().toISOString(),
		profile,
		lockfile,
	};

	ensureDir(path.dirname(outputPath));
	await writeFile(outputPath, `${JSON.stringify(portable, null, 2)}\n`, "utf8");

	if (options.format === "json") {
		process.stdout.write(`${JSON.stringify({ ok: true, path: outputPath }, null, 2)}\n`);
	} else {
		process.stdout.write(`Exported gitgud profile to ${outputPath}.\n`);
	}
}

async function applyProfile(filePath: string, options: ProfileOptions): Promise<void> {
	const inputPath = path.resolve(filePath);
	if (!existsSync(inputPath)) throw new Error(`Profile export not found: ${inputPath}`);

	const raw = await readFile(inputPath, "utf8");
	const portable = parsePortableProfile(JSON.parse(raw) as unknown);
	const profile = parseProfile(portable.profile);
	const lockfile = parseLockfile(portable.lockfile);

	if (options.dryRun) {
		if (options.format === "json") {
			process.stdout.write(
				`${JSON.stringify(
					{
						ok: true,
						dryRun: true,
						sources: profile.sources.length,
						skills: Object.values(lockfile.sources).reduce(
							(count, source) => count + Object.keys(source.skills).length,
							0
						),
					},
					null,
					2
				)}\n`
			);
			return;
		}
		process.stdout.write(
			`Would apply ${profile.sources.length} source(s) from ${inputPath}; no files changed.\n`
		);
		return;
	}

	await writeProfile(options.scope, profile);
	await writeLockfile(options.scope, lockfile);
	await refreshProfileSources(options.scope);
	const materialized = await materialize(options.scope);
	if (options.scope === "global") autoSync();

	if (options.format === "json") {
		process.stdout.write(`${JSON.stringify({ ok: true, materialized }, null, 2)}\n`);
	} else {
		process.stdout.write(`Applied profile from ${inputPath}.\n`);
	}
}

export async function profileCommand(args: string[], options: ProfileOptions): Promise<void> {
	const subcommand = args[0];
	const filePath = args[1];
	if (!subcommand || !filePath) {
		fail("Usage: gitgud profile export <file> | gitgud profile apply <file>", options.format);
	}

	try {
		if (subcommand === "export") {
			await exportProfile(filePath, options);
			return;
		}
		if (subcommand === "apply") {
			await applyProfile(filePath, options);
			return;
		}
		fail(`Unknown profile command: ${subcommand}`, options.format);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown profile error";
		fail(message, options.format);
	}
}
