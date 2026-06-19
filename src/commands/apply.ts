import type { OutputFormat, Scope } from "../types";
import { materialize } from "../core/materialize";
import { formatError } from "../output";
import { autoSync } from "./sync";

type ApplyOptions = {
	scope: Scope;
	format: OutputFormat;
};

function fail(message: string, format: OutputFormat): never {
	process.stderr.write(`${formatError(message, format)}\n`);
	process.exit(1);
}

export async function applyCommand(_args: string[], options: ApplyOptions): Promise<void> {
	try {
		const result = await materialize(options.scope);
		if (options.scope === "global") autoSync();

		if (options.format === "json") {
			process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
			return;
		}

		const changed = result.actions.filter((action) => action.action !== "noop");
		process.stdout.write(`Applied ${changed.length} active skill change(s).\n`);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown apply error";
		fail(message, options.format);
	}
}
