import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { discoverRepositories } from "../src/repos.ts";
import { parseGhAuthStatus, parseGitConfigEntries, parseGitHubRemoteOwner } from "../src/identity.ts";

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

describe("identity discovery parsing", () => {
  test("parses git config entries with scope and origin", () => {
    const entries = parseGitConfigEntries(
      [
        "global\tfile:/home/me/.gitconfig\tuser.email me@example.com",
        "local\tfile:.git/config\tincludeIf.gitdir:/work/.path /home/me/.gitconfig-work",
        "global\tfile:/home/me/.gitconfig\tcredential.https://github.com.helper !gh auth git-credential",
        "global file:/home/me/.gitconfig user.name Me Example",
      ].join("\n")
    );

    expect(entries[0]).toEqual({
      scope: "global",
      origin: "file:/home/me/.gitconfig",
      key: "user.email",
      value: "me@example.com",
    });
    expect(entries[1].key).toBe("includeIf.gitdir:/work/.path");
    expect(entries[2].value).toBe("!gh auth git-credential");
    expect(entries[3]).toEqual({
      scope: "global",
      origin: "file:/home/me/.gitconfig",
      key: "user.name",
      value: "Me Example",
    });
  });

  test("parses gh auth status accounts without tokens", () => {
    const accounts = parseGhAuthStatus(
      [
        "github.com",
        "  ✓ Logged in to github.com account andocodes (/home/me/.config/gh/hosts.yml)",
        "  - Active account: true",
        "  ✓ Logged in to github.com account work-user (/home/me/.config/gh/hosts.yml)",
        "  - Active account: false",
      ].join("\n")
    );

    expect(accounts).toEqual([
      { login: "andocodes", active: true },
      { login: "work-user", active: false },
    ]);
  });

  test("parses github remote owners", () => {
    expect(parseGitHubRemoteOwner("https://github.com/andocodes/skills.git")).toBe("andocodes");
    expect(parseGitHubRemoteOwner("git@github.com:andocodes/skills.git")).toBe("andocodes");
    expect(parseGitHubRemoteOwner("git@github-personal:andocodes/skills.git")).toBeUndefined();
  });
});
