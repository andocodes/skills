import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import type { AgentDefinition, ModelSelection } from "@cursor/sdk";

export interface LoadedAgent {
  name: string;
  description: string;
  prompt: string;
  model?: string;
  path: string;
}

export function loadAgentDefinitions(repoRoot: string): Map<string, LoadedAgent> {
  const dirs = [join(repoRoot, ".cursor", "agents"), join(homedir(), ".cursor", "agents")];
  const agents = new Map<string, LoadedAgent>();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir).sort()) {
      if (!entry.endsWith(".md")) continue;
      const path = join(dir, entry);
      const parsed = parseAgentFile(path);
      agents.set(parsed.name, parsed);
    }
  }
  return agents;
}

export function toSdkAgentDefinitions(
  agents: Map<string, LoadedAgent>
): Record<string, AgentDefinition> {
  const result: Record<string, AgentDefinition> = {};
  for (const [name, agent] of agents) {
    result[name] = {
      description: agent.description,
      prompt: agent.prompt,
      // Cursor UI agent model names are not always valid SDK local model ids.
      // The selected task still receives the agent prompt; SDK subagents inherit
      // the parent model unless a task explicitly sets `model`.
      model: "inherit",
    };
  }
  return result;
}

export function parseAgentFile(path: string): LoadedAgent {
  const raw = readFileSync(path, "utf8");
  const { frontmatter, body } = splitFrontmatter(raw);
  const name = stringValue(frontmatter.name) ?? basename(path, ".md");
  const description = stringValue(frontmatter.description) ?? `Local swarm agent ${name}`;
  const model = stringValue(frontmatter.model);
  return {
    name,
    description,
    model,
    prompt: body.trim(),
    path,
  };
}

export function modelSelection(id: string): ModelSelection {
  return { id };
}

function splitFrontmatter(raw: string): {
  frontmatter: Record<string, string | boolean>;
  body: string;
} {
  if (!raw.startsWith("---")) return { frontmatter: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { frontmatter: {}, body: raw };
  const frontmatterText = raw.slice(3, end).trim();
  const body = raw.slice(end + "\n---".length);
  const frontmatter: Record<string, string | boolean> = {};
  for (const line of frontmatterText.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (value === "true") frontmatter[key] = true;
    else if (value === "false") frontmatter[key] = false;
    else frontmatter[key] = stripQuotes(value);
  }
  return { frontmatter, body };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
