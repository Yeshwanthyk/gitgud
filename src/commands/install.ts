import path from "node:path";

import { getGlobalSkillsDir, getLocalSkillsDir } from "../core/paths";
import { formatError } from "../output";
import { type GithubInstallResult, installFromGithub } from "../sources/github";
import { installFromLocal } from "../sources/local";
import { parseSource } from "../sources/parse";
import { installFromRegistry } from "../sources/registry";
import type { OutputFormat } from "../types";

type InstallOptions = {
	source?: string | undefined;
	local: boolean;
	format: OutputFormat;
};

type RemoteSourceType = "github" | "registry";

type RemoteInstallOutput = {
	result: GithubInstallResult;
	sourceType: RemoteSourceType;
	originLabel: "GitHub" | "registry";
	format: OutputFormat;
	scopeLabel: "local" | "global";
	targetDir: string;
	sourceInput: string;
};

function fail(message: string, format: OutputFormat): never {
	process.stderr.write(`${formatError(message, format)}\n`);
	process.exit(1);
}

function printRemoteInstallOutput(output: RemoteInstallOutput): void {
	const { result, sourceType, originLabel, format, scopeLabel, targetDir, sourceInput } = output;
	const { installed, skipped } = result;
	const names = installed.map((p) => path.basename(p));

	if (format === "json") {
		process.stdout.write(
			`${JSON.stringify(
				{
					ok: true,
					installed: installed.map((p) => ({ name: path.basename(p), path: p })),
					skipped,
					scope: scopeLabel,
					targetDir,
					source: sourceInput,
					sourceType,
				},
				null,
				2
			)}\n`
		);
		return;
	}

	if (installed.length === 1) {
		process.stdout.write(
			`Installed skill "${names[0]}" from ${originLabel} into ${scopeLabel} registry.\n`
		);
	} else {
		process.stdout.write(
			`Installed ${installed.length} skills from ${originLabel} into ${scopeLabel} registry:\n`
		);
		for (const name of names) process.stdout.write(`  - ${name}\n`);
	}
	if (skipped.length > 0) {
		process.stdout.write(`Skipped ${skipped.length}:\n`);
		for (const s of skipped) process.stdout.write(`  - ${s.name}: ${s.reason}\n`);
	}
}

export async function installCommand(args: string[], options: InstallOptions): Promise<void> {
	const sourceInput = options.source ?? args[0];
	if (!sourceInput) {
		fail("Missing install source.", options.format);
	}

	const targetDir = options.local ? getLocalSkillsDir() : getGlobalSkillsDir();

	if (!targetDir) {
		fail("Local skills directory not found.", options.format);
	}

	let parsed;
	try {
		parsed = parseSource(sourceInput);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown source parse error";
		fail(message, options.format);
	}

	const scopeLabel = options.local ? "local" : "global";

	try {
		switch (parsed.type) {
			case "local": {
				const res = installFromLocal({
					sourcePath: parsed.path,
					targetDir,
				});
				if (!res.ok) fail(res.error.message, options.format);

				if (options.format === "json") {
					process.stdout.write(
						`${JSON.stringify(
							{
								ok: true,
								name: res.value,
								scope: scopeLabel,
								targetDir,
								source: sourceInput,
								sourceType: parsed.type,
							},
							null,
							2
						)}\n`
					);
					return;
				}

				process.stdout.write(`Installed skill "${res.value}" into ${scopeLabel} registry.\n`);
				return;
			}

			case "github": {
				const url = `github:${parsed.repo}${parsed.subdir ? `/${parsed.subdir}` : ""}${parsed.ref ? `#${parsed.ref}` : ""}`;
				const res = await installFromGithub({
					url,
					targetDir,
				});
				if (!res.ok) fail(res.error.message, options.format);

				printRemoteInstallOutput({
					result: res.value,
					sourceType: parsed.type,
					originLabel: "GitHub",
					format: options.format,
					scopeLabel,
					targetDir,
					sourceInput,
				});
				return;
			}

			case "registry": {
				const identifier = parsed.version ? `${parsed.package}@${parsed.version}` : parsed.package;
				const res = await installFromRegistry({
					identifier,
					targetDir,
				});
				if (!res.ok) fail(res.error.message, options.format);

				printRemoteInstallOutput({
					result: res.value,
					sourceType: parsed.type,
					originLabel: "registry",
					format: options.format,
					scopeLabel,
					targetDir,
					sourceInput,
				});
			}
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown install error";
		fail(message, options.format);
	}
}
