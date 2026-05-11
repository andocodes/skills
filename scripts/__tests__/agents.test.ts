import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { loadAgentDefinitions, parseAgentFile } from "../src/agents.ts";

describe("agent definitions", () => {
  test("parses frontmatter and body", () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-agent-"));
    const path = join(dir, "test-agent.md");
    writeFileSync(
      path,
      `---
name: test-agent
description: Does test work
model: auto
---

You are a test agent.
`
    );
    const agent = parseAgentFile(path);
    expect(agent.name).toBe("test-agent");
    expect(agent.description).toBe("Does test work");
    expect(agent.model).toBe("auto");
    expect(agent.prompt).toContain("test agent");
  });

  test("loads project agents", () => {
    const repo = mkdtempSync(join(tmpdir(), "swarm-repo-"));
    const agentsDir = join(repo, ".cursor", "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, "project-agent.md"),
      `---
name: project-agent
description: Project agent
---
Prompt
`
    );
    const agents = loadAgentDefinitions(repo);
    expect(agents.get("project-agent")?.description).toBe("Project agent");
  });
});
