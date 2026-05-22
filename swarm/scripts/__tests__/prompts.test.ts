import { describe, expect, test } from "bun:test";
import { rootPlannerPrompt, taskPrompt } from "../src/prompts.ts";
import type { LoadedAgent } from "../src/agents.ts";
import type { Plan, PlanTask, TaskState } from "../src/schemas.ts";

const agent: LoadedAgent = {
  name: "btl-frontend-track",
  description: "Frontend implementation agent",
  path: "/agents/btl-frontend-track.md",
  model: undefined,
  prompt: "Use the full frontend agent instructions.",
};

describe("swarm prompts", () => {
  test("planner prompt describes repo-aware plan without prompt modes", () => {
    const prompt = rootPlannerPrompt({
      goal: "ship feature",
      rootSlug: "ship-feature",
      baseRef: "main",
      workspace: "/repo/.swarm/ship-feature",
      agents: new Map([[agent.name, agent]]),
      repositories: [{ name: "platform", path: "/repo/platform", baseRef: "main" }],
      repositoryMode: "single",
      executor: "cursor-visible",
      defaultRepo: "platform",
    });

    expect(prompt).toContain('repositoryMode: "single"');
    expect(prompt).toContain('executor: "cursor-visible"');
    expect(prompt).toContain("isolation:");
    expect(prompt).toContain("repositories: copy the available repositories below exactly");
    expect(prompt).toContain("Available repositories:");
    expect(prompt).toContain("the root planner is not counted");
    expect(prompt).toContain("each one gets its own branch and worktree");
  });

  test("task prompt always includes the full selected agent body", () => {
    const task: PlanTask = {
      name: "build-ui",
      type: "worker",
      repo: "platform",
      agent: "btl-frontend-track",
      scopedGoal: "Build the UI",
      pathsAllowed: ["src/**"],
      pathsForbidden: [],
      acceptance: ["UI works"],
      dependsOn: [],
      maxAttempts: 1,
    };
    const plan: Plan = {
      goal: "ship feature",
      rootSlug: "ship-feature",
      repositoryMode: "single",
      executor: "cursor-visible",
      isolation: { mode: "worktree", network: "restricted" },
      repositories: [{ name: "platform", path: "/repo/platform", baseRef: "main" }],
      defaultRepo: "platform",
      baseRef: "main",
      maxConcurrency: 2,
      tasks: [task],
    };
    const state: TaskState = {
      name: "build-ui",
      type: "worker",
      status: "pending",
      repo: "platform",
      executor: "cursor-visible",
      repoPath: "/repo/platform",
      agent: "btl-frontend-track",
      branch: "swarm/ship-feature/build-ui",
      isolation: { mode: "worktree", network: "restricted" },
      worktreePath: "/repo/.swarm/ship-feature/worktrees/platform/build-ui",
      agentId: null,
      runId: null,
      resultStatus: null,
      handoffPath: null,
      startedAt: null,
      finishedAt: null,
      attempts: 0,
      dependsOn: [],
    };

    const prompt = taskPrompt({
      plan,
      task,
      taskState: state,
      agent,
      workspace: "/repo/.swarm/ship-feature",
    });

    expect(prompt).toContain("Use the full frontend agent instructions.");
    expect(prompt).toContain("Isolation:\n- mode=worktree network=restricted");
    expect(prompt).not.toContain("Frontend implementation agent");
  });

  test("standalone verifier prompt is read-only and has no target requirement", () => {
    const task: PlanTask = {
      name: "platform-checks",
      type: "verifier",
      repo: "platform",
      scopedGoal: "Run independent platform checks",
      pathsAllowed: [],
      pathsForbidden: [],
      acceptance: ["Checks pass"],
      verify: "bun test",
      dependsOn: [],
      maxAttempts: 1,
    };
    const plan: Plan = {
      goal: "audit feature",
      rootSlug: "audit-feature",
      repositoryMode: "single",
      executor: "cursor-visible",
      isolation: { mode: "worktree", network: "restricted" },
      repositories: [{ name: "platform", path: "/repo/platform", baseRef: "main" }],
      defaultRepo: "platform",
      baseRef: "main",
      maxConcurrency: 2,
      tasks: [task],
    };
    const state: TaskState = {
      name: "platform-checks",
      type: "verifier",
      status: "pending",
      repo: "platform",
      executor: "cursor-visible",
      repoPath: "/repo/platform",
      branch: "swarm/audit-feature/platform-checks",
      isolation: { mode: "readonly", network: "none" },
      worktreePath: "/repo/.swarm/audit-feature/worktrees/platform/platform-checks",
      agentId: null,
      runId: null,
      resultStatus: null,
      handoffPath: null,
      startedAt: null,
      finishedAt: null,
      attempts: 0,
      dependsOn: [],
    };

    const prompt = taskPrompt({
      plan,
      task,
      taskState: state,
      workspace: "/repo/.swarm/audit-feature",
    });

    expect(prompt).toContain("Verification target:\n(standalone verification lane)");
    expect(prompt).toContain("Do not modify code unless the verifier task explicitly asks you to.");
  });
});
