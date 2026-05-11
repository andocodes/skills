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
});
