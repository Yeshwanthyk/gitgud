#!/usr/bin/env bun
import { parseArgs } from "node:util";

import { exportCommand } from "./commands/export";
import { importCommand } from "./commands/import";
import { initCommand } from "./commands/init";
import { installCommand } from "./commands/install";
import { listCommand } from "./commands/list";
import { searchCommand } from "./commands/search";
import { show } from "./commands/show";
import { syncCommand } from "./commands/sync";
import { uninstallCommand } from "./commands/uninstall";
import { updateCommand, updateSkillsCommand } from "./commands/update";
import type { OutputFormat, Scope } from "./types";
import { VERSION } from "./version";

type CliOptions = {
	json: boolean;
	robot: boolean;
	format?: OutputFormat | undefined;
	local: boolean;
	global: boolean;
	source?: string | undefined;
	skills: boolean;
	dryRun: boolean;
	force: boolean;
	noPrune: boolean;
};

const USAGE = `gitgud <command> [args] [options]

Commands:
  list
  show <name>
  search <query>
  install <name>
  uninstall <name>
  export <archive.tgz>  Export all skills from the gitgud registry
  import <archive.tgz>  Import skills into the gitgud registry
  init
  sync [agent...]        Symlink ~/.gitgud/skills into Claude/Codex/Pi skill dirs
  update                 Self-update gitgud binary
  update <name>          Re-pull a skill from its origin
  update --skills        Re-pull every installed skill
  version                Print gitgud version

Options:
  --format        Output format: text|json|robot
  --json          Output JSON
  --robot         Robot-friendly output (TSV for list, raw content for show)
  --local         Use local registry
  --global        Use global registry
  --source        Install source (for install)
  --dry-run       Preview changes (sync/import)
  --force         Replace existing entries (sync/export/import)
  --no-prune      Don't remove dangling managed symlinks (sync)
  -v, --version   Print gitgud version
  -h, --help      Show help
`;

function printHelp(): void {
	process.stdout.write(`${USAGE}\n`);
}

function resolveOutputFormat(options: CliOptions, allowRobot = false): OutputFormat {
	if (options.format) return options.format;
	if (allowRobot && options.robot) return "robot";
	return options.json ? "json" : "text";
}

function parseCli(argv: string[]): {
	help: boolean;
	version: boolean;
	options: CliOptions;
	command: string | undefined;
	args: string[];
} {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			format: { type: "string" },
			json: { type: "boolean" },
			robot: { type: "boolean" },
			local: { type: "boolean" },
			global: { type: "boolean" },
			source: { type: "string" },
			skills: { type: "boolean" },
			"dry-run": { type: "boolean" },
			force: { type: "boolean" },
			"no-prune": { type: "boolean" },
			help: { type: "boolean", short: "h" },
			version: { type: "boolean", short: "v" },
		},
		strict: true,
	});

	const help = values.help ?? false;
	const version = values.version ?? false;
	const options: CliOptions = {
		json: values.json ?? false,
		robot: values.robot ?? false,
		format: (values.format as OutputFormat | undefined) ?? undefined,
		local: values.local ?? false,
		global: values.global ?? false,
		source: values.source as string | undefined,
		skills: values.skills ?? false,
		dryRun: (values["dry-run"] as boolean | undefined) ?? false,
		force: values.force ?? false,
		noPrune: (values["no-prune"] as boolean | undefined) ?? false,
	};

	const command = positionals[0];
	const args = positionals.slice(1);

	return { help, version, options, command, args };
}

async function dispatch(command: string, args: string[], options: CliOptions): Promise<void> {
	switch (command) {
		case "list": {
			listCommand({
				format: resolveOutputFormat(options, true),
				local: options.local,
				global: options.global,
			});
			return;
		}
		case "init": {
			const scope: Scope = options.local ? "local" : "global";
			initCommand(args, { scope });
			return;
		}
		case "search": {
			await searchCommand(args, { format: resolveOutputFormat(options) });
			return;
		}
		case "install": {
			await installCommand(args, {
				source: options.source,
				local: options.local,
				format: resolveOutputFormat(options),
			});
			return;
		}
		case "uninstall": {
			uninstallCommand(args, {
				local: options.local,
				format: resolveOutputFormat(options),
			});
			return;
		}
		case "export": {
			await exportCommand(args, {
				scope: options.local ? "local" : "global",
				format: resolveOutputFormat(options),
				force: options.force,
			});
			return;
		}
		case "import": {
			await importCommand(args, {
				scope: options.local ? "local" : "global",
				format: resolveOutputFormat(options),
				force: options.force,
				dryRun: options.dryRun,
			});
			return;
		}
		case "show": {
			await show({ name: args[0], format: resolveOutputFormat(options, true) });
			return;
		}
		case "sync": {
			syncCommand(args, {
				dryRun: options.dryRun,
				force: options.force,
				prune: !options.noPrune,
				format: resolveOutputFormat(options),
			});
			return;
		}
		case "update": {
			if (options.skills || args.length > 0) {
				await updateSkillsCommand(args);
				return;
			}
			await updateCommand();
			return;
		}
		case "version": {
			process.stdout.write(`gitgud v${VERSION}\n`);
			return;
		}
		default:
			throw new Error(`Unknown command: ${command}`);
	}
}

async function main(argv: string[]): Promise<void> {
	const { help, version, options, command, args } = parseCli(argv);

	if (version) {
		process.stdout.write(`gitgud v${VERSION}\n`);
		return;
	}

	if (help || !command) {
		printHelp();
		return;
	}

	if (options.local && options.global) {
		throw new Error("Options --local and --global are mutually exclusive.");
	}

	await dispatch(command, args, options);
}

main(process.argv.slice(2))
	.then(() => {
		process.exit(0);
	})
	.catch((err: unknown) => {
		const message = err instanceof Error ? err.message : "Unexpected error occurred.";
		process.stderr.write(`${message}\n`);
		process.exit(1);
	});
