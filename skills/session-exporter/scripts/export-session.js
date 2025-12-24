#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.input) {
	printHelp();
	process.exit(args.help ? 0 : 1);
}

const inputPath = args.input;
const raw = await readFile(inputPath, "utf8");
const parsed = parseSession(raw, inputPath, args);
const source = args.source === "auto" ? parsed.detectedSource : args.source;
const outputPath = args.out ?? defaultOutputPath(inputPath, args.format);
let output;
if (args.format === "html") {
	output = renderHtml(parsed.items, args.title);
} else {
	output = renderMarkdown(parsed.items, { source, inputPath, title: args.title });
}
await writeFile(outputPath, output);
console.log(`Wrote ${outputPath}`);

function parseArgs(argv) {
	const out = {
		input: "",
		format: "md",
		source: "auto",
		out: "",
		title: "",
		includeTools: true,
		includeThinking: false,
		help: false,
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--input" || arg === "-i") {
			out.input = argv[i + 1] || "";
			i += 1;
			continue;
		}
		if (arg === "--format" || arg === "-f") {
			out.format = (argv[i + 1] || "").toLowerCase();
			i += 1;
			continue;
		}
		if (arg === "--source" || arg === "-s") {
			out.source = (argv[i + 1] || "").toLowerCase();
			i += 1;
			continue;
		}
		if (arg === "--out" || arg === "-o") {
			out.out = argv[i + 1] || "";
			i += 1;
			continue;
		}
		if (arg === "--title" || arg === "-t") {
			out.title = argv[i + 1] || "";
			i += 1;
			continue;
		}
		if (arg === "--no-tools") {
			out.includeTools = false;
			continue;
		}
		if (arg === "--include-thinking") {
			out.includeThinking = true;
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			out.help = true;
		}
	}

	if (!out.format || (out.format !== "md" && out.format !== "html")) {
		out.format = "md";
	}

	return out;
}

function printHelp() {
	const help =
		"session-exporter\n\nUsage:\n  node scripts/export-session.js --input <path> [options]\n\nOptions:\n  --format <md|html>       Output format (default: md)\n  --out <path>             Output path (default: input + .md/.html)\n  --source <auto|codex|claude|marvin|pi>  Source hint (default: auto)\n  --title <text>           Custom title\n  --include-thinking       Include reasoning blocks\n  --no-tools               Exclude tool calls and outputs\n  -h, --help               Show help\n";
	console.log(help);
}

function defaultOutputPath(inputPath, format) {
	const ext = extname(inputPath);
	if (!ext) return `${inputPath}.${format}`;
	if (ext === ".json" || ext === ".jsonl") {
		return `${inputPath}.${format}`;
	}
	return `${inputPath}.${format}`;
}

function parseSession(raw, inputPath, args) {
	const trimmed = raw.trim();
	const detectedSource = args.source === "auto" ? detectSourceFromPath(inputPath) : args.source;
	if (!trimmed) return { items: [], detectedSource };

	if (trimmed.startsWith("{")) {
		const asJson = safeJsonParse(trimmed);
		if (asJson && Array.isArray(asJson.items)) {
			return { items: parseCodexJson(asJson, args), detectedSource: "codex" };
		}
	}

	const records = [];
	for (const line of trimmed.split("\n")) {
		const rec = safeJsonParse(line);
		if (rec) records.push(rec);
	}

	const inferred =
		args.source === "auto" ? detectSourceFromRecords(records, detectedSource) : args.source;
	const items = [];
	for (const record of records) items.push(...parseRecord(record, args));
	return { items, detectedSource: inferred };
}

function detectSourceFromPath(inputPath) {
	const p = inputPath || "";
	if (p.includes("/.codex/")) return "codex";
	if (p.includes("/.claude/")) return "claude";
	if (p.includes("/.config/marvin/")) return "marvin";
	if (p.includes("/.pi/agent/")) return "pi";
	return "unknown";
}

function detectSourceFromRecords(records, fallback) {
	for (const r of records) {
		if (r?.type === "event_msg" || r?.type === "response_item") return "codex";
		if (r?.type === "user" || r?.type === "assistant") return "claude";
		if (r?.type === "message" && typeof r?.role === "string") return "codex";
		if (r?.type === "message" && r?.message?.role) return "marvin";
	}
	return fallback || "unknown";
}

function parseCodexJson(session, args) {
	const items = [];
	for (const item of session.items || []) {
		if (item?.type === "message") {
			items.push(...itemsFromMessage(item.role || "assistant", item.content, item.timestamp, args));
			continue;
		}
		if (item?.type?.endsWith("_call")) {
			if (args.includeTools) items.push(toolCallFromCodexItem(item));
			continue;
		}
		if (item?.type?.endsWith("_call_output")) {
			if (args.includeTools) items.push(toolOutputFromCodexItem(item));
			continue;
		}
		if (item?.type === "reasoning" && args.includeThinking) {
			const summary = Array.isArray(item.summary)
				? item.summary
						.map((s) => s.text)
						.filter(Boolean)
						.join("\n")
				: "";
			if (summary) items.push({ kind: "thinking", content: summary, timestamp: item.timestamp });
		}
	}
	return items.filter(Boolean);
}

function toolCallFromCodexItem(item) {
	const action = item.action || {};
	const cmd = Array.isArray(action.command) ? action.command.join(" ") : action.command || "";
	return {
		kind: "tool_call",
		name: item.type || "tool",
		input: cmd || action,
		timestamp: item.timestamp,
	};
}

function toolOutputFromCodexItem(item) {
	const output = normalizeToolOutput(item.output);
	return { kind: "tool_output", output, timestamp: item.timestamp };
}

function parseRecord(record, args) {
	if (!record || typeof record !== "object") return [];

	if (record.type === "message" && typeof record.role === "string") {
		return itemsFromMessage(record.role, record.content, record.timestamp, args);
	}

	if (record.type === "message" && record.message?.role) {
		const content =
			record.message.content ?? record.message.text ?? record.message.message ?? record.message;
		return itemsFromMessage(record.message.role, content, record.timestamp, args);
	}

	if (record.type === "user" || record.type === "assistant") {
		const content =
			record.message?.content ??
			record.message?.text ??
			record.message?.message ??
			record.message ??
			record.content;
		return itemsFromMessage(record.type, content, record.timestamp, args);
	}

	if (record.type === "event_msg" && record.payload?.type === "user_message") {
		return itemsFromMessage("user", record.payload.message, record.timestamp, args);
	}

	if (record.type === "response_item") {
		const payload = record.payload || {};
		if (payload.type === "function_call" && args.includeTools) {
			return [
				{
					kind: "tool_call",
					name: payload.name || "tool",
					input: payload.arguments ?? payload.input,
					timestamp: record.timestamp,
				},
			];
		}
		if (payload.type === "function_call_output" && args.includeTools) {
			return [
				{
					kind: "tool_output",
					output: normalizeToolOutput(payload.output),
					timestamp: record.timestamp,
				},
			];
		}
		if (payload.type === "reasoning" && args.includeThinking) {
			const summary = Array.isArray(payload.summary)
				? payload.summary
						.map((s) => s.text)
						.filter(Boolean)
						.join("\n")
				: "";
			return summary ? [{ kind: "thinking", content: summary, timestamp: record.timestamp }] : [];
		}
		if (payload.type === "message" || payload.type === "assistant_message") {
			return itemsFromMessage(
				"assistant",
				payload.message ?? payload.content ?? payload.text,
				record.timestamp,
				args,
			);
		}
	}

	return [];
}

function itemsFromMessage(role, content, timestamp, args) {
	const blocks = normalizeBlocks(content);
	const items = [];
	let buffer = [];

	const flush = () => {
		if (!buffer.length) return;
		items.push({ kind: "message", role, content: buffer.join("\n\n"), timestamp });
		buffer = [];
	};

	for (const block of blocks) {
		if (!block) continue;
		const type = String(block.type || "");
		if (type === "text" || type === "input_text" || type === "output_text") {
			if (block.text) buffer.push(String(block.text));
			continue;
		}
		if (type === "thinking") {
			flush();
			if (args.includeThinking && (block.thinking || block.text)) {
				items.push({ kind: "thinking", content: String(block.thinking || block.text), timestamp });
			}
			continue;
		}
		if (type === "tool_use" || type === "toolCall") {
			flush();
			if (args.includeTools) {
				items.push({
					kind: "tool_call",
					name: block.name || block.tool_name || "tool",
					input: block.input ?? block.arguments ?? block.args,
					timestamp,
				});
			}
			continue;
		}
		if (type === "tool_result") {
			flush();
			if (args.includeTools) {
				items.push({
					kind: "tool_output",
					output: normalizeToolOutput(block.content ?? block.output),
					timestamp,
				});
			}
			continue;
		}
		if (typeof block.text === "string") {
			buffer.push(block.text);
			continue;
		}
		if (typeof block.content === "string") {
			buffer.push(block.content);
		}
	}

	flush();
	return items;
}

function normalizeBlocks(content) {
	if (content == null) return [];
	if (typeof content === "string") return [{ type: "text", text: content }];
	if (Array.isArray(content)) return content;
	if (Array.isArray(content.content)) return content.content;
	if (typeof content.text === "string") return [{ type: "text", text: content.text }];
	return [{ type: "text", text: String(content) }];
}

function normalizeToolOutput(raw) {
	if (raw == null) return "";
	if (typeof raw === "string") {
		const parsed = safeJsonParse(raw);
		if (parsed && typeof parsed.output === "string") return parsed.output;
		return raw;
	}
	if (typeof raw === "object") {
		if (typeof raw.output === "string") return raw.output;
		return safeStringify(raw);
	}
	return String(raw);
}

function formatToolInput(input) {
	if (input == null) return "";
	if (typeof input === "string") return input;
	return safeStringify(input);
}

function renderMarkdown(items, meta) {
	const title = meta.title || "Session Export";
	const lines = [];
	lines.push(`# ${title}`);
	lines.push("");
	lines.push(`- Source: ${meta.source || "unknown"}`);
	lines.push(`- Input: ${meta.inputPath || ""}`);
	lines.push(`- Exported: ${new Date().toISOString()}`);
	lines.push(`- Entries: ${items.length}`);
	lines.push("");
	lines.push("---");
	lines.push("");

	for (const item of items) {
		if (item.kind === "message") {
			const stamp = formatTimestamp(item.timestamp);
			lines.push(`## ${item.role}${stamp ? ` (${stamp})` : ""}`);
			lines.push("");
			if (item.content) lines.push(item.content.trim());
			lines.push("");
			continue;
		}
		if (item.kind === "tool_call") {
			lines.push(`### tool: ${item.name || "tool"}`);
			lines.push("");
			const input = formatToolInput(item.input);
			if (input) lines.push(renderCodeBlock(input));
			lines.push("");
			continue;
		}
		if (item.kind === "tool_output") {
			lines.push("### output");
			lines.push("");
			const output = item.output || "";
			if (output) lines.push(renderCodeBlock(output));
			lines.push("");
			continue;
		}
		if (item.kind === "thinking") {
			lines.push("### thinking");
			lines.push("");
			const block = (item.content || "")
				.split("\n")
				.map((l) => `> ${l}`)
				.join("\n");
			lines.push(block);
			lines.push("");
		}
	}

	return `${lines.join("\n").trimEnd()}\n`;
}

function renderCodeBlock(text) {
	const fence = pickFence(text);
	return `${fence}\n${text}\n${fence}`;
}

function pickFence(text) {
	const matches = text.match(/`{3,}/g) || [];
	let max = 2;
	for (const m of matches) max = Math.max(max, m.length);
	return "`".repeat(max + 1);
}

function formatTimestamp(ts) {
	if (!ts) return "";
	const date = new Date(ts);
	if (Number.isNaN(date.valueOf())) return String(ts);
	return date.toISOString();
}

function renderHtml(items, title) {
	const safeTitle = escapeHtml(title || "Session Export");

	const html = [];
	for (const item of items) {
		if (item.kind === "message") {
			const roleClass = item.role === "user" ? "user" : "assistant";
			html.push(
				`<div class="entry"><span class="role ${roleClass}">${item.role.toUpperCase()}</span>`,
			);
			html.push(`<div class="content">${renderContent(item.content)}</div></div>`);
			continue;
		}
		if (item.kind === "tool_call") {
			const name = item.name?.replace(/_call$/, "") || "tool";
			const displayName =
				name.includes("shell") || name.includes("bash")
					? "bash"
					: name.includes("read")
						? "read"
						: name;
			html.push(`<div class="entry tool"><span class="tool-name">${displayName}</span>`);
			const input = formatToolInput(item.input);
			if (input) html.push(`<code class="tool-input">${escapeHtml(input)}</code>`);
			html.push("</div>");
			continue;
		}
		if (item.kind === "tool_output") {
			const output = item.output || "";
			if (output.trim()) {
				html.push(`<div class="tool-output"><pre>${escapeHtml(output)}</pre></div>`);
			}
			continue;
		}
		if (item.kind === "thinking") {
			html.push(
				`<div class="thinking"><div class="thinking-content">${renderContent(item.content)}</div></div>`,
			);
		}
	}

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:24px;background:#1a1a1a;color:#e0e0e0;line-height:1.6}
.entry{margin-bottom:16px}
.role{display:inline-block;font-weight:600;font-size:13px;margin-bottom:4px}
.role.user{color:#4ecdc4}
.role.assistant{color:#ff9f43}
.content{white-space:pre-wrap}
.content p{margin:0 0 12px}
.content code{background:#2d2d2d;padding:2px 6px;border-radius:4px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px}
.content pre{background:#111;padding:12px;border-radius:6px;overflow-x:auto;margin:12px 0}
.content pre code{background:none;padding:0}
.tool{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.tool-name{color:#26de81;font-weight:600;font-size:13px}
.tool-input{color:#a0a0a0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;background:none}
.tool-output{margin:4px 0 16px;padding-left:0}
.tool-output pre{background:#111;color:#c0c0c0;padding:12px;border-radius:6px;margin:0;white-space:pre-wrap;word-break:break-word;font-size:13px;max-height:400px;overflow:auto}
.thinking{border-left:3px solid #444;padding-left:12px;margin:8px 0 16px}
.thinking-content{color:#888;font-style:italic;white-space:pre-wrap}
h1,h2,h3,h4{color:#fff;margin:24px 0 12px;font-weight:600}
h1{font-size:1.5em}
h2{font-size:1.25em}
h3{font-size:1.1em}
a{color:#4ecdc4}
ul,ol{margin:8px 0;padding-left:24px}
blockquote{border-left:3px solid #444;padding-left:12px;margin:12px 0;color:#888}
hr{border:none;border-top:1px solid #333;margin:24px 0}
</style>
</head>
<body>
${html.join("\n")}
</body>
</html>`;
}

function renderContent(text) {
	if (!text) return "";
	// code blocks first (before escaping)
	let s = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => {
		return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
	});
	// escape remaining HTML
	s = s.replace(/(<pre><code>[\s\S]*?<\/code><\/pre>)/g, "%%CODEBLOCK%%$1%%ENDCODEBLOCK%%");
	const parts = s.split(/(%%CODEBLOCK%%[\s\S]*?%%ENDCODEBLOCK%%)/g);
	s = parts
		.map((part) => {
			if (part.startsWith("%%CODEBLOCK%%")) {
				return part.replace(/%%CODEBLOCK%%|%%ENDCODEBLOCK%%/g, "");
			}
			let p = escapeHtml(part);
			// inline code
			p = p.replace(/`([^`]+)`/g, "<code>$1</code>");
			// bold
			p = p.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
			// headers
			p = p.replace(/^### (.+)$/gm, "<h3>$1</h3>");
			p = p.replace(/^## (.+)$/gm, "<h2>$1</h2>");
			p = p.replace(/^# (.+)$/gm, "<h1>$1</h1>");
			// lists
			p = p.replace(/^- (.+)$/gm, "<li>$1</li>");
			p = p.replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>");
			return p;
		})
		.join("");
	return s;
}

function safeJsonParse(value) {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function safeStringify(value) {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function escapeHtml(value) {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
