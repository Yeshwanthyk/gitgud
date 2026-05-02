#!/usr/bin/env bun
import { parseArgs } from "node:util";

import { initCommand } from "./commands/init";
import { installCommand } from "./commands/install";
import { listCommand } from "./commands/list";
import { searchCommand } from "./commands/search";
import { show } from "./commands/show";
import { uninstallCommand } from "./commands/uninstall";
import { updateCommand, updateSkillsCommand } from "./commands/update";
import type { OutputFormat, Scope } from "./types";

type CliOptions = {
	json: boolean;
	robot: boolean;
	format?: OutputFormat | undefined;
	local: boolean;
	global: boolean;
	source?: string | undefined;
	skills: boolean;
};

const USAGE = `gitgud <command> [args] [options]

Commands:
  list
  show <name>
  search <query>
  install <name>
  uninstall <name>
  init
  update                 Self-update gitgud binary
  update <name>          Re-pull a skill from its origin
  update --skills        Re-pull every installed skill

Options:
  --format     Output format: text|json|robot
  --json       Output JSON
  --robot      Robot-friendly output (TSV for list, raw content for show)
  --local      Use local registry
  --global     Use global registry
  --source     Install source (for install)
  -h, --help   Show help
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
			help: { type: "boolean", short: "h" },
		},
		strict: true,
	});

	const help = values.help ?? false;
	const options: CliOptions = {
		json: values.json ?? false,
		robot: values.robot ?? false,
		format: (values.format as OutputFormat | undefined) ?? undefined,
		local: values.local ?? false,
		global: values.global ?? false,
		source: values.source as string | undefined,
		skills: values.skills ?? false,
	};

	const command = positionals[0];
	const args = positionals.slice(1);

	return { help, options, command, args };
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
		case "show": {
			await show({ name: args[0], format: resolveOutputFormat(options, true) });
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
		default:
			throw new Error(`Unknown command: ${command}`);
	}
}

async function main(argv: string[]): Promise<void> {
	const { help, options, command, args } = parseCli(argv);

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
