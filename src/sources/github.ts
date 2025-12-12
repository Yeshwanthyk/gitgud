import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { downloadTemplate } from "giget";

import { parseSkill } from "../core/skills";
import type { Result, SkillMeta } from "../types";
import { parseSource } from "./parse";

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T = never>(error: Error): Result<T> => ({ ok: false, error });

export type InstallFromGithubOptions = {
  url: string;
  subpath?: string;
  targetDir: string;
};

function normalizeGithubSource(inputUrl: string, subpath?: string): Result<{
  gigetSource: string;
  metaSource: string;
}> {
  const trimmed = inputUrl.trim();
  if (!trimmed) return err(new Error("Empty GitHub source URL"));

  // If already in giget format, keep provider prefix.
  if (/^[a-z]+:/.test(trimmed) && !trimmed.startsWith("http")) {
    const [base, ref] = trimmed.split("#", 2);
    const baseWithSubpath = subpath ? `${base}/${subpath}` : base;
    const reconstructed = ref ? `${baseWithSubpath}#${ref}` : baseWithSubpath;
    return ok({ gigetSource: reconstructed, metaSource: reconstructed });
  }

  try {
    const parsed = parseSource(trimmed);
    if (parsed.type !== "github") {
      return err(new Error(`Not a GitHub source: ${inputUrl}`));
    }

    const finalSubdir = subpath ?? parsed.subdir;
    const refSuffix = parsed.ref ? `#${parsed.ref}` : "";
    const gigetSource = `github:${parsed.repo}${
      finalSubdir ? `/${finalSubdir}` : ""
    }${refSuffix}`;
    return ok({ gigetSource, metaSource: gigetSource });
  } catch {
    // Treat as user/repo shorthand (optionally with #ref).
    const finalSubdir = subpath ? `/${subpath}` : "";
    const gigetSource = `github:${trimmed}${finalSubdir}`;
    return ok({ gigetSource, metaSource: gigetSource });
  }
}

async function moveDir(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (error) {
    // Fallback for cross-device moves.
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === "EXDEV") {
      await cp(from, to, { recursive: true });
      await rm(from, { recursive: true, force: true });
      return;
    }
    throw error;
  }
}

export async function installFromGithub(
  options: InstallFromGithubOptions,
): Promise<Result<string>> {
  const normalized = normalizeGithubSource(options.url, options.subpath);
  if (!normalized.ok) return err(normalized.error);

  const { gigetSource, metaSource } = normalized.value;

  const tempBase = path.join(os.tmpdir(), "gitgud-");
  const tempDir = await mkdtemp(tempBase);

  const cleanup = async () => {
    await rm(tempDir, { recursive: true, force: true });
  };

  try {
    const { dir: downloadedDir } = await downloadTemplate(gigetSource, {
      dir: tempDir,
      forceClean: true,
    });

    const skillDir = path.resolve(downloadedDir);
    const parsed = parseSkill(skillDir, "local");
    if (!parsed.ok) {
      throw parsed.error;
    }

    const skillName = parsed.value.frontmatter.name;
    if (!skillName) {
      throw new Error("Skill name missing from frontmatter");
    }

    await mkdir(options.targetDir, { recursive: true });
    const destDir = path.join(options.targetDir, skillName);
    if (existsSync(destDir)) {
      throw new Error(`Skill already exists at ${destDir}`);
    }

    await moveDir(skillDir, destDir);

    const meta: SkillMeta = {
      source: metaSource,
      installedAt: new Date().toISOString(),
    };
    const metaPath = path.join(destDir, ".gitgud-meta.json");
    await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");

    await cleanup();
    return ok(destDir);
  } catch (error) {
    await cleanup();
    const message =
      error instanceof Error ? error.message : "Unknown GitHub install error";
    return err(new Error(message));
  }
}
