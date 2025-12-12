import { describe, test, expect } from "bun:test";

import { parseSource } from "../../src/sources/parse";

describe("sources/parseSource", () => {
  test("parses local paths", () => {
    expect(parseSource("./foo")).toEqual({ type: "local", path: "./foo" });
    expect(parseSource("../bar/baz")).toEqual({ type: "local", path: "../bar/baz" });
    expect(parseSource("/abs/path")).toEqual({ type: "local", path: "/abs/path" });
  });

  test("parses GitHub URLs", () => {
    expect(parseSource("https://github.com/user/repo")).toEqual({
      type: "github",
      repo: "user/repo",
    });
    expect(parseSource("https://github.com/user/repo/")).toEqual({
      type: "github",
      repo: "user/repo",
    });
    expect(parseSource("https://github.com/user/repo.git")).toEqual({
      type: "github",
      repo: "user/repo",
    });
  });

  test("parses GitHub URLs with tree ref and subdir", () => {
    expect(parseSource("https://github.com/user/repo/tree/main")).toEqual({
      type: "github",
      repo: "user/repo",
      ref: "main",
    });
    expect(parseSource("https://github.com/user/repo/tree/main/sub/path")).toEqual({
      type: "github",
      repo: "user/repo",
      ref: "main",
      subdir: "sub/path",
    });
  });

  test("parses gh: shorthand", () => {
    expect(parseSource("gh:user/repo")).toEqual({
      type: "github",
      repo: "user/repo",
    });
    expect(parseSource("gh:user/repo/subpath")).toEqual({
      type: "github",
      repo: "user/repo",
      subdir: "subpath",
    });
    expect(parseSource("gh:user/repo/sub/path")).toEqual({
      type: "github",
      repo: "user/repo",
      subdir: "sub/path",
    });
  });

  test("parses registry identifiers", () => {
    expect(parseSource("@scope/repo/skill")).toEqual({
      type: "registry",
      package: "@scope/repo/skill",
    });
    expect(parseSource("@scope/repo/skill@1.2.3")).toEqual({
      type: "registry",
      package: "@scope/repo/skill",
      version: "1.2.3",
    });
  });

  test("throws on unknown formats", () => {
    expect(() => parseSource("gitlab:user/repo")).toThrow();
    expect(() => parseSource("user/repo")).toThrow();
    expect(() => parseSource("")).toThrow();
  });
});

