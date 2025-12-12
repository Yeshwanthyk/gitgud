#!/usr/bin/env bun
import { parseArgs } from "node:util";

import { initCommand } from "./commands/init";
import { installCommand } from "./commands/install";
import { listCommand } from "./commands/list";
import { runPathCommand } from "./commands/path";
import { searchCommand } from "./commands/search";
import { show } from "./commands/show";
import { uninstallCommand } from "./commands/uninstall";
import type { OutputFormat, Scope } from "./types";

type CliOptions = {
	json: boolean;
	format?: OutputFormat;
	local: boolean;
	global: boolean;
	name?: string;
	source?: string;
};

const USAGE = `gitgud <command> [args] [options]

Commands:
  list
  show <name>
  path <name>
  search <query>
  install <name>
  uninstall <name>
  init

Options:
  --format     Output format: text|json
  --json       Output JSON
  --local      Use local registry
  --global     Use global registry
  --name       Skill name (for path)
  --source     Install source (for install)
  -h, --help   Show help
`;

function printHelp() {
	process.stdout.write(`${USAGE}\n`);
}

function parseCli(argv: string[]) {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			format: { type: "string" },
			json: { type: "boolean" },
			local: { type: "boolean" },
			global: { type: "boolean" },
			name: { type: "string" },
			source: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
		strict: true,
	});

	const help = values.help ?? false;
	const options: CliOptions = {
		json: values.json ?? false,
		format: (values.format as OutputFormat | undefined) ?? undefined,
		local: values.local ?? false,
		global: values.global ?? false,
		name: values.name as string | undefined,
		source: values.source as string | undefined,
	};

	const command = positionals[0];
	const args = positionals.slice(1);

	return { help, options, command, args };
}

async function dispatch(command: string, args: string[], options: CliOptions): Promise<void> {
	switch (command) {
		case "list": {
			const format: OutputFormat = options.format ?? (options.json ? "json" : "text");
			listCommand({
				format,
				local: options.local,
				global: options.global,
			});
			return;
		}
		case "init": {
			const scope: Scope = options.local ? "local" : "global";
			await initCommand(args, { scope });
			return;
		}
		case "path": {
			const format: OutputFormat = options.format ?? (options.json ? "json" : "text");
			await runPathCommand(args, { name: options.name, format });
			return;
		}
		case "search": {
			const format: OutputFormat = options.format ?? (options.json ? "json" : "text");
			await searchCommand(args, { format });
			return;
		}
		case "install": {
			const format: OutputFormat = options.format ?? (options.json ? "json" : "text");
			await installCommand(args, {
				source: options.source,
				local: options.local,
				format,
			});
			return;
		}
		case "uninstall": {
			const format: OutputFormat = options.format ?? (options.json ? "json" : "text");
			uninstallCommand(args, {
				name: options.name,
				local: options.local,
				format,
			});
			return;
		}
		case "show": {
			const name = args[0];
			const format = options.json ? "json" : "text";
			await show({ name, format });
			return;
		}
		default:
			throw new Error(`Unknown command: ${command}`);
	}
}

async function main(argv: string[]) {
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
