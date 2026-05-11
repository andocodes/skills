import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { discoverRepositories } from "../src/repos.ts";

describe("repository discovery", () => {
  test("discovers side-by-side child repos", () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-repos-"));
    for (const name of ["platform", "content-service"]) {
      const repo = join(root, name);
      mkdirSync(repo);
      execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
    }

    const context = discoverRepositories({ cwd: root, mode: "siblings", baseRef: "main" });
    expect(context.mode).toBe("siblings");
    expect(context.repos.map(repo => repo.name)).toEqual(["content-service", "platform"]);
    expect(context.projectRoot).toBe(root);
  });

  test("uses current repo in auto mode", () => {
    const repo = mkdtempSync(join(tmpdir(), "swarm-single-"));
    execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });

    const context = discoverRepositories({ cwd: repo, mode: "auto", baseRef: "main" });
    expect(context.mode).toBe("single");
    expect(context.repos).toHaveLength(1);
    expect(context.repos[0].path).toBe(realpathSync(repo));
  });
});
