import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "bun:test";
import path from "node:path";
import os from "node:os";
import {
  cpSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";

import { installFromLocal } from "../../src/sources/local";
import { ensureDir } from "../../src/core/paths";

const fixtureDir = (name: string) =>
  path.join("test", "fixtures", name);

const copyFixture = (name: string, destDir: string) => {
  const src = fixtureDir(name);
  cpSync(src, destDir, { recursive: true });
};

describe("sources/local", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(
      path.join(os.tmpdir(), "gitgud-local-"),
    );
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("installs a valid local skill and writes meta", () => {
    const sourceDir = path.join(tmpRoot, "source-skill");
    copyFixture("valid-skill", sourceDir);

    const targetDir = path.join(tmpRoot, "skills");
    const res = installFromLocal({
      sourcePath: sourceDir,
      targetDir,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toBe("valid-skill");

    const installedDir = path.join(targetDir, "valid-skill");
    expect(existsSync(installedDir)).toBe(true);
    expect(
      existsSync(path.join(installedDir, "SKILL.md")),
    ).toBe(true);

    const metaPath = path.join(
      installedDir,
      ".gitgud-meta.json",
    );
    const metaRaw = readFileSync(metaPath, "utf8");
    const meta = JSON.parse(metaRaw) as {
      source: string;
      installedAt: string;
    };
    expect(meta.source).toBe(sourceDir);
    expect(new Date(meta.installedAt).toString()).not.toBe(
      "Invalid Date",
    );
  });

  test("errors when source does not exist", () => {
    const res = installFromLocal({
      sourcePath: path.join(tmpRoot, "missing"),
      targetDir: path.join(tmpRoot, "skills"),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain(
        "Source does not exist",
      );
    }
  });

  test("errors when source is not a directory", () => {
    const filePath = path.join(tmpRoot, "file.txt");
    writeFileSync(filePath, "hi", "utf8");
    const res = installFromLocal({
      sourcePath: filePath,
      targetDir: path.join(tmpRoot, "skills"),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain(
        "not a directory",
      );
    }
  });

  test("errors when target already has same skill", () => {
    const sourceDir = path.join(tmpRoot, "source-skill");
    copyFixture("valid-skill", sourceDir);

    const targetDir = path.join(tmpRoot, "skills");
    ensureDir(path.join(targetDir, "valid-skill"));

    const res = installFromLocal({
      sourcePath: sourceDir,
      targetDir,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain(
        "already exists",
      );
    }
  });
});
