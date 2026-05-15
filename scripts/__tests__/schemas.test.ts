import { describe, expect, test } from "bun:test";
import { parsePlanJson, SwarmValidationError } from "../src/schemas.ts";

describe("plan schema", () => {
  test("accepts a worker and verifier plan", () => {
    const plan = parsePlanJson(
      JSON.stringify({
        goal: "ship thing",
        rootSlug: "ship-thing",
        tasks: [
          {
            name: "build",
            type: "worker",
            repo: "platform",
            scopedGoal: "Build it",
          },
          {
            name: "verify",
            type: "verifier",
            repo: "platform",
            verifies: "build",
            dependsOn: ["build"],
            scopedGoal: "Verify it",
          },
        ],
        repositoryMode: "single",
        repositories: [{ name: "platform", path: "/tmp/platform", baseRef: "main" }],
        defaultRepo: "platform",
      })
    );
    expect(plan.maxConcurrency).toBe(2);
    expect(plan.tasks[1].verifies).toBe("build");
    expect(plan.tasks[0].repo).toBe("platform");
  });

  test("rejects unknown dependencies", () => {
    expect(() =>
      parsePlanJson(
        JSON.stringify({
          goal: "ship thing",
          rootSlug: "ship-thing",
          tasks: [
            {
              name: "build",
              scopedGoal: "Build it",
              dependsOn: ["missing"],
            },
          ],
        })
      )
    ).toThrow(SwarmValidationError);
  });

  test("accepts standalone verifier lanes", () => {
    const plan = parsePlanJson(
      JSON.stringify({
        goal: "audit thing",
        rootSlug: "audit-thing",
        tasks: [
          {
            name: "platform-checks",
            type: "verifier",
            repo: "platform",
            scopedGoal: "Run independent platform checks without modifying code",
            verify: "bun test",
          },
        ],
        repositoryMode: "single",
        repositories: [{ name: "platform", path: "/tmp/platform", baseRef: "main" }],
        defaultRepo: "platform",
      })
    );

    expect(plan.tasks[0].type).toBe("verifier");
    expect(plan.tasks[0].verifies).toBeUndefined();
  });

  test("accepts isolation and local identity profiles", () => {
    const plan = parsePlanJson(
      JSON.stringify({
        goal: "risky migration",
        rootSlug: "risky-migration",
        isolation: { mode: "container", runtime: "docker", image: "swarm-node-22" },
        authProfile: "github-work",
        gitIdentity: "thomas-work",
        tasks: [
          {
            name: "port-module",
            scopedGoal: "Port the module",
            isolation: { mode: "container", runtime: "podman", network: "none" },
            authProfile: "github-oss",
            gitIdentity: "thomas-oss",
          },
        ],
      })
    );

    expect(plan.isolation.mode).toBe("container");
    expect(plan.isolation.runtime).toBe("docker");
    expect(plan.tasks[0].isolation?.runtime).toBe("podman");
    expect(plan.tasks[0].authProfile).toBe("github-oss");
  });

  test("rejects unknown isolation modes", () => {
    expect(() =>
      parsePlanJson(
        JSON.stringify({
          goal: "bad isolation",
          rootSlug: "bad-isolation",
          isolation: { mode: "vm", runtime: "docker" },
        })
      )
    ).toThrow(SwarmValidationError);
  });

  test("rejects images outside container isolation", () => {
    expect(() =>
      parsePlanJson(
        JSON.stringify({
          goal: "bad image",
          rootSlug: "bad-image",
          isolation: { mode: "readonly", image: "swarm-agent:0.1.0-codex-core" },
        })
      )
    ).toThrow(SwarmValidationError);
  });
});
