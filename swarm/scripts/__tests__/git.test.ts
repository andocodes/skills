import { describe, expect, test } from "bun:test";
import { branchForTask, worktreePathForTask } from "../src/git.ts";

describe("git path helpers", () => {
  test("builds deterministic swarm branch names", () => {
    expect(branchForTask("root-slug", "task-one")).toBe("swarm/root-slug/task-one");
  });

  test("places worktrees under workspace", () => {
    expect(worktreePathForTask("/repo/.swarm/root", "platform", "task-one")).toBe(
      "/repo/.swarm/root/worktrees/platform/task-one"
    );
  });
});
