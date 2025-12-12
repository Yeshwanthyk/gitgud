import type { InstallSource } from "../types";

const isLocalPath = (s: string): boolean =>
	s.startsWith("./") || s.startsWith("../") || s.startsWith("/");

const parseGithubUrl = (s: string): InstallSource | null => {
	const m = s.match(
		/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?(?:tree\/([^/]+)\/?(.*))?$/i,
	);
	if (!m) return null;

	const user = m[1];
	const repoName = m[2];
	const ref = m[3];
	const subdir = m[4];

	const out: InstallSource = { type: "github", repo: `${user}/${repoName}` };
	if (ref) out.ref = ref;
	if (subdir) out.subdir = subdir.replace(/\/$/, "");
	return out;
};

const parseGhShorthand = (s: string): InstallSource | null => {
	if (!s.startsWith("gh:")) return null;
	const rest = s.slice(3);
	const parts = rest.split("/").filter(Boolean);
	if (parts.length < 2) return null;

	const repo = `${parts[0]}/${parts[1]}`;
	const subdir = parts.length > 2 ? parts.slice(2).join("/") : undefined;
	const out: InstallSource = { type: "github", repo };
	if (subdir) out.subdir = subdir;
	return out;
};

const parseRegistryId = (s: string): InstallSource | null => {
	if (!s.startsWith("@")) return null;

	// Split optional version suffix after the last slash.
	const lastSlash = s.lastIndexOf("/");
	const lastAt = s.lastIndexOf("@");
	let pkg = s;
	let version: string | undefined;
	if (lastAt > lastSlash) {
		pkg = s.slice(0, lastAt);
		version = s.slice(lastAt + 1);
	}

	if (!/^@[^/]+\/[^/]+\/[^/]+$/.test(pkg)) return null;

	const out: InstallSource = { type: "registry", package: pkg };
	if (version) out.version = version;
	return out;
};

export function parseSource(source: string): InstallSource {
	const s = source.trim();
	if (!s) throw new Error("Empty source");

	if (isLocalPath(s)) {
		return { type: "local", path: s };
	}

	const githubUrl = parseGithubUrl(s);
	if (githubUrl) return githubUrl;

	const ghShort = parseGhShorthand(s);
	if (ghShort) return ghShort;

	const reg = parseRegistryId(s);
	if (reg) return reg;

	throw new Error(`Unknown install source: ${source}`);
}
