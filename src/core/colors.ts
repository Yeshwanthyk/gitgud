export const ANSI = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	gray: "\x1b[90m",
} as const;

function useColor(): boolean {
	return (
		process.stdout.isTTY === true && !process.env["NO_COLOR"] && process.env["TERM"] !== "dumb"
	);
}

/** Wrap `text` in the given ANSI open sequence (and reset) when color is enabled. */
export function paint(open: string, text: string): string {
	return useColor() ? `${open}${text}${ANSI.reset}` : text;
}
