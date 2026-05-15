import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLaunchPlan } from "../src/launch.ts";
import type { TaskState } from "../src/schemas.ts";

const state: TaskState = {
  name: "build-ui",
  type: "worker",
  status: "running",
  repo: "platform",
  repoPath: "/repo/platform",
  agent: "frontend",
  executor: "codex-cli",
  isolation: { mode: "worktree", network: "restricted" },
  branch: "swarm/root/build-ui",
  worktreePath: "/repo/.swarm/root/worktrees/platform/build-ui",
  agentId: null,
  runId: null,
  resultStatus: null,
  handoffPath: null,
  startedAt: null,
  finishedAt: null,
  attempts: 1,
  dependsOn: [],
};

describe("launch plans", () => {
  test("builds host codex CLI command with prompt stdin", () => {
    const plan = buildLaunchPlan({
      executor: "codex-cli",
      isolation: state.isolation,
      taskState: state,
      workspace: "/repo/.swarm/root",
      root: "/repo",
      promptPath: "/repo/.swarm/root/logs/build-ui-prompt.md",
      handoffPath: "/repo/.swarm/root/handoffs/build-ui.md",
      launchInstruction: "launch codex",
    });

    expect(plan.kind).toBe("command");
    expect(plan.command?.slice(0, 2)).toEqual(["codex", "exec"]);
    expect(plan.stdinFile).toBe("/repo/.swarm/root/logs/build-ui-prompt.md");
    expect(plan.commandPreview).toContain("< /repo/.swarm/root/logs/build-ui-prompt.md");
  });

  test("uses codex read-only sandbox for readonly host lanes", () => {
    const readonlyState: TaskState = {
      ...state,
      isolation: { mode: "readonly", network: "none" },
    };
    const plan = buildLaunchPlan({
      executor: "codex-cli",
      isolation: readonlyState.isolation,
      taskState: readonlyState,
      workspace: "/repo/.swarm/root",
      root: "/repo",
      promptPath: "/repo/.swarm/root/logs/build-ui-prompt.md",
      handoffPath: "/repo/.swarm/root/handoffs/build-ui.md",
      launchInstruction: "launch codex",
    });

    expect(plan.command).toContain("--sandbox");
    expect(plan.command).toContain("read-only");
    expect(plan.command).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  });

  test("builds host Pi CLI command with readonly tool allowlist", () => {
    const readonlyState: TaskState = {
      ...state,
      isolation: { mode: "readonly", network: "none" },
    };
    const plan = buildLaunchPlan({
      executor: "pi-cli",
      isolation: readonlyState.isolation,
      taskState: readonlyState,
      workspace: "/repo/.swarm/root",
      root: "/repo",
      promptPath: "/repo/.swarm/root/logs/build-ui-prompt.md",
      handoffPath: "/repo/.swarm/root/handoffs/build-ui.md",
      launchInstruction: "launch pi",
    });

    expect(plan.kind).toBe("command");
    expect(plan.command?.slice(0, 3)).toEqual(["pi", "-p", "--no-session"]);
    expect(plan.command).toContain("--tools");
    expect(plan.command).toContain("read,grep,find,ls");
    expect(plan.stdinFile).toBe("/repo/.swarm/root/logs/build-ui-prompt.md");
  });

  test("builds container CLI command that runs inside the image", () => {
    const containerState: TaskState = {
      ...state,
      isolation: {
        mode: "container",
        runtime: "docker",
        image: "swarm-agent:0.1.0-claude-core",
        network: "none",
      },
    };
    const plan = buildLaunchPlan({
      executor: "claude-cli",
      isolation: containerState.isolation,
      taskState: containerState,
      workspace: "/repo/.swarm/root",
      root: "/repo",
      promptPath: "/repo/.swarm/root/logs/build-ui-prompt.md",
      handoffPath: "/repo/.swarm/root/handoffs/build-ui.md",
      launchInstruction: "launch claude",
    });

    expect(plan.kind).toBe("command");
    expect(plan.command?.[0]).toBe("docker");
    expect(plan.command).toContain("--network");
    expect(plan.command).toContain("none");
    expect(plan.commandPreview).toContain("claude --print");
  });

  test("defaults Pi container lanes to a Pi agent image", () => {
    const containerState: TaskState = {
      ...state,
      isolation: {
        mode: "container",
        runtime: "docker",
        network: "none",
      },
    };
    const plan = buildLaunchPlan({
      executor: "pi-cli",
      isolation: containerState.isolation,
      taskState: containerState,
      workspace: "/repo/.swarm/root",
      root: "/repo",
      promptPath: "/repo/.swarm/root/logs/build-ui-prompt.md",
      handoffPath: "/repo/.swarm/root/handoffs/build-ui.md",
      launchInstruction: "launch pi",
    });

    expect(plan.command).toContain("swarm-agent:0.1.0-pi-core");
    expect(plan.commandPreview).toContain("pi -p --no-session");
  });

  test("mounts profiles without exposing auth values in launch plan", () => {
    const previous = process.env.SWARM_PROFILE_HOME;
    const root = mkdtempSync(join(tmpdir(), "swarm-profiles-"));
    mkdirSync(join(root, "auth"), { recursive: true });
    mkdirSync(join(root, "git"), { recursive: true });
    writeFileSync(join(root, "auth", "github-work.env"), "GH_TOKEN=secret\nGITHUB_TOKEN=secret\n");
    writeFileSync(
      join(root, "git", "thomas-work.gitconfig"),
      "[user]\n  name = Thomas\n  email = thomas@example.com\n"
    );
    process.env.SWARM_PROFILE_HOME = root;
    try {
      const profiledState: TaskState = {
        ...state,
        authProfile: "github-work",
        gitIdentity: "thomas-work",
        isolation: {
          mode: "container",
          runtime: "docker",
          image: "swarm-agent:0.1.0-fake",
          network: "restricted",
        },
      };
      const plan = buildLaunchPlan({
        executor: "codex-cli",
        isolation: profiledState.isolation,
        taskState: profiledState,
        workspace: "/repo/.swarm/root",
        root: "/repo",
        promptPath: "/repo/.swarm/root/logs/build-ui-prompt.md",
        handoffPath: "/repo/.swarm/root/handoffs/build-ui.md",
        launchInstruction: "launch codex",
      });

      expect(plan.profileFiles?.authEnv).toBe(join(root, "auth", "github-work.env"));
      expect(plan.profileFiles?.gitConfig).toBe(join(root, "git", "thomas-work.gitconfig"));
      expect(plan.command).toContain("--env-file");
      expect(JSON.stringify(plan)).not.toContain("secret");
    } finally {
      if (previous === undefined) delete process.env.SWARM_PROFILE_HOME;
      else process.env.SWARM_PROFILE_HOME = previous;
    }
  });

  test("adds read-only worktree mount for readonly container lanes", () => {
    const containerState: TaskState = {
      ...state,
      isolation: {
        mode: "container",
        runtime: "docker",
        image: "swarm-agent:0.1.0-fake",
        network: "restricted",
        readonly: true,
      },
    };
    const plan = buildLaunchPlan({
      executor: "codex-cli",
      isolation: containerState.isolation,
      taskState: containerState,
      workspace: "/repo/.swarm/root",
      root: "/repo",
      promptPath: "/repo/.swarm/root/logs/build-ui-prompt.md",
      handoffPath: "/repo/.swarm/root/handoffs/build-ui.md",
      launchInstruction: "launch codex",
    });

    expect(plan.command).toContain(
      "type=bind,source=/repo/.swarm/root/worktrees/platform/build-ui,target=/repo/.swarm/root/worktrees/platform/build-ui,readonly"
    );
  });

  test("keeps native launch plans instruction-only", () => {
    const plan = buildLaunchPlan({
      executor: "codex-native",
      isolation: state.isolation,
      taskState: state,
      workspace: "/repo/.swarm/root",
      root: "/repo",
      promptPath: "/repo/.swarm/root/logs/build-ui-prompt.md",
      handoffPath: "/repo/.swarm/root/handoffs/build-ui.md",
      launchInstruction: "launch native codex",
    });

    expect(plan.kind).toBe("native");
    expect(plan.command).toBeUndefined();
    expect(plan.instructions).toBe("launch native codex");
  });
});
