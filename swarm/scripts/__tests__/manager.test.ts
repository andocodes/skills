import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { availableSubagentSlots, SwarmManager } from "../src/manager.ts";

describe("swarm manager", () => {
  test("counts maxConcurrency as subagent lanes only", () => {
    expect(availableSubagentSlots(3, 0)).toBe(3);
    expect(availableSubagentSlots(3, 1)).toBe(2);
    expect(availableSubagentSlots(3, 3)).toBe(0);
  });

  test("allocates per-lane worktrees when lanes share a repo", () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-manager-"));
    const workspace = join(root, ".swarm", "shared-repo");
    mkdirSync(workspace, { recursive: true });
    writeFileSync(
      join(workspace, "plan.json"),
      JSON.stringify(
        {
          goal: "ship shared repo changes",
          rootSlug: "shared-repo",
          repositoryMode: "single",
          executor: "codex-native",
          isolation: { mode: "worktree", network: "restricted" },
          repositories: [{ name: "platform", path: join(root, "platform"), baseRef: "main" }],
          defaultRepo: "platform",
          baseRef: "main",
          maxConcurrency: 3,
          tasks: [
            { name: "api-lane", scopedGoal: "Update the API" },
            { name: "ui-lane", scopedGoal: "Update the UI" },
            { name: "verify-lane", type: "verifier", scopedGoal: "Verify both changes" },
          ],
        },
        null,
        2
      )
    );

    const manager = SwarmManager.load(workspace);
    const worktrees = manager.state.tasks.map(task => task.worktreePath);

    expect(new Set(worktrees).size).toBe(3);
    expect(worktrees).toEqual([
      join(workspace, "worktrees", "platform", "api-lane"),
      join(workspace, "worktrees", "platform", "ui-lane"),
      join(workspace, "worktrees", "platform", "verify-lane"),
    ]);
  });
});
