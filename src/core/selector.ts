import readline from "node:readline";

import { ANSI, paint } from "./colors";
import type { SelectionState } from "./profile";

export type SelectableSkill = {
	id: string;
	name: string;
	description: string;
	group: string;
	state: SelectionState;
	status: "present" | "removed-upstream";
};

function clearScreen(): void {
	process.stdout.write("\x1b[2J\x1b[H");
}

function truncate(text: string, max: number): string {
	const clean = text.replace(/\s+/g, " ").trim();
	if (clean.length <= max) return clean;
	return `${clean.slice(0, Math.max(0, max - 1))}…`;
}

function visibleItems(items: SelectableSkill[], filter: string): SelectableSkill[] {
	const q = filter.toLowerCase();
	if (!q) return items;
	return items.filter(
		(item) =>
			item.name.toLowerCase().includes(q) ||
			item.description.toLowerCase().includes(q) ||
			item.group.toLowerCase().includes(q)
	);
}

function render(params: {
	title: string;
	items: SelectableSkill[];
	cursor: number;
	filter: string;
	filtering: boolean;
}): void {
	const { title, cursor, filter, filtering } = params;
	const items = visibleItems(params.items, filter);
	clearScreen();
	process.stdout.write(
		`${paint(ANSI.bold, title)}  ${paint(ANSI.gray, `${items.length} skills`)}\n\n`
	);

	const nameWidth = Math.min(34, Math.max(18, ...items.map((item) => item.name.length)));
	for (let i = 0; i < items.length; i++) {
		const item = items[i] as SelectableSkill;
		const selected = item.state === "enabled";
		let marker = "[ ]";
		if (item.status === "removed-upstream") marker = "[-]";
		else if (selected) marker = "[x]";
		const pointer = i === cursor ? paint(ANSI.cyan, ">") : " ";
		const name = item.status === "removed-upstream" ? paint(ANSI.gray, item.name) : item.name;
		const padded = `${truncate(name, nameWidth)}${" ".repeat(Math.max(0, nameWidth - item.name.length))}`;
		const group = paint(ANSI.gray, truncate(item.group, 22));
		const status = item.status === "removed-upstream" ? paint(ANSI.red, "removed upstream") : "";
		process.stdout.write(`${pointer} ${marker} ${padded}  ${group}  ${status}\n`);
	}

	process.stdout.write("\n");
	if (filtering) {
		process.stdout.write(`filter: ${filter}\n`);
	} else if (filter) {
		process.stdout.write(`filter: ${filter}  ${paint(ANSI.gray, "esc clears")}\n`);
	}
	process.stdout.write(
		`${paint(ANSI.gray, "space toggle · a all · n none · / filter · enter apply · q cancel")}\n`
	);
}

function clampCursor(cursor: number, count: number): number {
	if (count <= 0) return 0;
	return Math.max(0, Math.min(cursor, count - 1));
}

export function runSelector(
	title: string,
	items: SelectableSkill[]
): Promise<Record<string, SelectionState> | null> {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		return Promise.resolve(null);
	}

	const nextItems = items.map((item) => ({ ...item }));
	let cursor = 0;
	let filter = "";
	let filtering = false;

	readline.emitKeypressEvents(process.stdin);
	process.stdin.setRawMode(true);
	process.stdin.resume();

	return new Promise((resolve) => {
		const cleanup = (): void => {
			process.stdin.setRawMode(false);
			process.stdin.pause();
			process.stdin.off("keypress", onKeypress);
			clearScreen();
		};

		const finish = (value: Record<string, SelectionState> | null): void => {
			cleanup();
			resolve(value);
		};

		const rerender = (): void => {
			const count = visibleItems(nextItems, filter).length;
			cursor = clampCursor(cursor, count);
			render({ title, items: nextItems, cursor, filter, filtering });
		};

		const onKeypress = (str: string, key: readline.Key): void => {
			if (key.ctrl && key.name === "c") return finish(null);

			if (filtering) {
				if (key.name === "return") {
					filtering = false;
					return rerender();
				}
				if (key.name === "escape") {
					filtering = false;
					filter = "";
					return rerender();
				}
				if (key.name === "backspace") {
					filter = filter.slice(0, -1);
					return rerender();
				}
				if (str && str >= " ") {
					filter += str;
					return rerender();
				}
				return;
			}

			if (key.name === "q") return finish(null);
			if (key.name === "return") {
				const out: Record<string, SelectionState> = {};
				for (const item of nextItems) out[item.id] = item.state;
				return finish(out);
			}
			if (key.name === "up" || key.name === "k") {
				cursor = clampCursor(cursor - 1, visibleItems(nextItems, filter).length);
				return rerender();
			}
			if (key.name === "down" || key.name === "j") {
				cursor = clampCursor(cursor + 1, visibleItems(nextItems, filter).length);
				return rerender();
			}
			if (key.name === "slash" || str === "/") {
				filtering = true;
				return rerender();
			}
			if (key.name === "escape") {
				filter = "";
				return rerender();
			}
			if (key.name === "a" || key.name === "n") {
				const state: SelectionState = key.name === "a" ? "enabled" : "disabled";
				for (const item of visibleItems(nextItems, filter)) {
					if (item.status === "present") item.state = state;
				}
				return rerender();
			}
			if (key.name === "space") {
				const item = visibleItems(nextItems, filter)[cursor];
				if (item && item.status === "present") {
					item.state = item.state === "enabled" ? "disabled" : "enabled";
				}
				return rerender();
			}
		};

		process.stdin.on("keypress", onKeypress);
		rerender();
	});
}
