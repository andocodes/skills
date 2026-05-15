import { z } from "zod";

export const TASK_NAME_RE = /^[a-z0-9-]+$/;

const taskName = z.string().regex(TASK_NAME_RE, "must be kebab-case ASCII");
const nonEmpty = z.string().min(1);
const profileRef = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._@:/-]+$/, "must be a named local profile, not an inline secret");

export const taskTypeSchema = z.enum(["worker", "verifier"]);
export const executorSchema = z.enum([
  "cursor-visible",
  "cursor-sdk",
  "claude-native",
  "claude-cli",
  "codex-native",
  "codex-cli",
]);
export const isolationModeSchema = z.enum(["worktree", "container", "readonly"]);
export const isolationRuntimeSchema = z.enum(["docker", "podman"]);
export const isolationNetworkSchema = z.enum(["restricted", "none", "inherit"]);
export const isolationSchema = z
  .object({
    mode: isolationModeSchema.default("worktree"),
    runtime: isolationRuntimeSchema.optional(),
    image: nonEmpty.optional(),
    network: isolationNetworkSchema.default("restricted"),
    readonly: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .superRefine((isolation, ctx) => {
    if (
      isolation.mode === "container" &&
      isolation.runtime &&
      isolation.runtime !== "docker" &&
      isolation.runtime !== "podman"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["runtime"],
        message: "container isolation supports docker or podman",
      });
    }
    if (
      (isolation.mode === "worktree" || isolation.mode === "readonly") &&
      isolation.runtime
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["runtime"],
        message: `${isolation.mode} isolation does not use a runtime`,
      });
    }
    if (
      (isolation.mode === "worktree" || isolation.mode === "readonly") &&
      isolation.image
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["image"],
        message: `${isolation.mode} isolation does not use an image`,
      });
    }
  });
export const defaultIsolation = {
  mode: "worktree",
  network: "restricted",
} satisfies z.infer<typeof isolationSchema>;
export const taskStatusSchema = z.enum([
  "pending",
  "running",
  "handed-off",
  "error",
  "cancelled",
]);
export const runResultStatusSchema = z
  .enum(["finished", "error", "cancelled"])
  .nullable();

export const repositorySchema = z.object({
  name: taskName,
  path: nonEmpty,
  baseRef: nonEmpty.default("main"),
  authProfile: profileRef.optional(),
  gitIdentity: profileRef.optional(),
});

export const planTaskSchema = z
  .object({
    name: taskName,
    type: taskTypeSchema.default("worker"),
    repo: taskName.optional(),
    agent: taskName.optional(),
    executor: executorSchema.optional(),
    isolation: isolationSchema.optional(),
    authProfile: profileRef.optional(),
    gitIdentity: profileRef.optional(),
    model: nonEmpty.optional(),
    scopedGoal: nonEmpty,
    brief: z.string().optional(),
    pathsAllowed: z.array(z.string()).default([]),
    pathsForbidden: z.array(z.string()).default([]),
    acceptance: z.array(z.string()).default([]),
    verify: z.string().optional(),
    dependsOn: z.array(taskName).default([]),
    verifies: taskName.optional(),
    maxAttempts: z.number().int().min(1).default(1),
  })
  .superRefine((task, ctx) => {
    if (task.type !== "verifier" && task.verifies) {
      ctx.addIssue({
        code: "custom",
        path: ["verifies"],
        message: "is only valid for verifier tasks",
      });
    }
  });

export const planSchema = z
  .object({
    $schema: z.string().optional(),
    goal: nonEmpty,
    summary: z.string().optional(),
    rootSlug: taskName,
    repositoryMode: z.enum(["single", "siblings"]).default("single"),
    executor: executorSchema.default("cursor-visible"),
    isolation: isolationSchema.default(defaultIsolation),
    authProfile: profileRef.optional(),
    gitIdentity: profileRef.optional(),
    repositories: z.array(repositorySchema).default([]),
    defaultRepo: taskName.optional(),
    baseRef: nonEmpty.default("main"),
    maxConcurrency: z.number().int().min(1).max(8).default(2),
    tasks: z.array(planTaskSchema).default([]),
  })
  .superRefine((plan, ctx) => {
    const names = new Set<string>();
    for (const [index, task] of plan.tasks.entries()) {
      if (names.has(task.name)) {
        ctx.addIssue({
          code: "custom",
          path: ["tasks", index, "name"],
          message: `duplicate task name ${task.name}`,
        });
      }
      names.add(task.name);
    }
    const repoNames = new Set(plan.repositories.map(repo => repo.name));
    if (plan.repositories.length > 0 && plan.defaultRepo && !repoNames.has(plan.defaultRepo)) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultRepo"],
        message: `unknown default repo ${plan.defaultRepo}`,
      });
    }
    for (const [index, task] of plan.tasks.entries()) {
      for (const dep of task.dependsOn) {
        if (!names.has(dep)) {
          ctx.addIssue({
            code: "custom",
            path: ["tasks", index, "dependsOn"],
            message: `unknown dependency ${dep}`,
          });
        }
      }
      if (task.repo && repoNames.size > 0 && !repoNames.has(task.repo)) {
        ctx.addIssue({
          code: "custom",
          path: ["tasks", index, "repo"],
          message: `unknown repo ${task.repo}`,
        });
      }
      if (task.verifies && !names.has(task.verifies)) {
        ctx.addIssue({
          code: "custom",
          path: ["tasks", index, "verifies"],
          message: `unknown verified task ${task.verifies}`,
        });
      }
    }
  });

export const taskStateSchema = z.object({
  name: taskName,
  type: taskTypeSchema,
  status: taskStatusSchema,
  repo: taskName.optional(),
  repoPath: nonEmpty,
  agent: taskName.optional(),
  executor: executorSchema.optional(),
  isolation: isolationSchema.default(defaultIsolation),
  authProfile: profileRef.optional(),
  gitIdentity: profileRef.optional(),
  branch: nonEmpty,
  worktreePath: nonEmpty,
  agentId: z.string().nullable().default(null),
  runId: z.string().nullable().default(null),
  resultStatus: runResultStatusSchema.default(null),
  handoffPath: z.string().nullable().default(null),
  startedAt: z.string().datetime().nullable().default(null),
  finishedAt: z.string().datetime().nullable().default(null),
  attempts: z.number().int().min(0).default(0),
  dependsOn: z.array(taskName).default([]),
});

export const stateSchema = z.object({
  rootSlug: taskName,
  projectRoot: nonEmpty.optional(),
  repositories: z.array(repositorySchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  tasks: z.array(taskStateSchema).default([]),
  attention: z.array(z.string()).default([]),
});

export type PlanTask = z.infer<typeof planTaskSchema>;
export type Plan = z.infer<typeof planSchema>;
export type TaskState = z.infer<typeof taskStateSchema>;
export type State = z.infer<typeof stateSchema>;
export type TaskStatus = TaskState["status"];
export type Executor = z.infer<typeof executorSchema>;
export type Isolation = z.infer<typeof isolationSchema>;
export type IsolationMode = z.infer<typeof isolationModeSchema>;

export class SwarmValidationError extends Error {}

export function parsePlanJson(json: string, file = "plan.json"): Plan {
  try {
    return planSchema.parse(JSON.parse(json));
  } catch (error) {
    throw new SwarmValidationError(formatZodError(error, file));
  }
}

export function parseStateJson(json: string, file = "state.json"): State {
  try {
    return stateSchema.parse(JSON.parse(json));
  } catch (error) {
    throw new SwarmValidationError(formatZodError(error, file));
  }
}

function formatZodError(error: unknown, file: string): string {
  if (error instanceof z.ZodError) {
    return `${file}: ${error.issues
      .map(issue => `${issue.path.join(".") || "(root)"} ${issue.message}`)
      .join("; ")}`;
  }
  if (error instanceof SyntaxError) return `${file}: invalid JSON: ${error.message}`;
  return `${file}: ${String(error)}`;
}
