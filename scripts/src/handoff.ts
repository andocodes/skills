import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PlanTask } from "./schemas.ts";

export interface HandoffSummary {
  kind: "worker" | "verifier";
  status: string | null;
  branch: string | null;
  hasStructuredHandoff: boolean;
}

export function handoffPath(workspace: string, taskName: string): string {
  return join(workspace, "handoffs", `${taskName}.md`);
}

export function writeHandoff(args: {
  workspace: string;
  task: PlanTask;
  body: string;
}): string {
  const path = handoffPath(args.workspace, args.task.name);
  writeFileSync(path, normalizeHandoffBody(args.body));
  return path;
}

export function readHandoff(workspace: string, taskName: string): string | null {
  try {
    return readFileSync(handoffPath(workspace, taskName), "utf8");
  } catch {
    return null;
  }
}

export function parseHandoff(body: string): HandoffSummary {
  const verification = extractSection(body, "Verification");
  const status = extractSection(body, "Status");
  return {
    kind: verification && !status ? "verifier" : "worker",
    status: firstMeaningfulLine(verification ?? status),
    branch: parseBranch(body),
    hasStructuredHandoff: Boolean(status || verification),
  };
}

export function extractFinalHandoff(result: string | undefined): string {
  const text = result?.trim() ?? "";
  if (!text) return "";
  const marker = text.search(/^##\s+(Status|Verification)\s*$/m);
  return marker >= 0 ? text.slice(marker).trim() : text;
}

export function failureHandoff(args: {
  taskName: string;
  reason: string;
  branch: string;
  diagnostics?: Record<string, string | number | boolean | null | undefined>;
}): string {
  const diagnostics = args.diagnostics
    ? [
        "",
        "## Diagnostics",
        ...Object.entries(args.diagnostics).map(
          ([key, value]) => `- ${key}: ${value ?? "(unset)"}`
        ),
      ]
    : [];
  return [
    "## Status",
    "failed",
    "",
    "## Branch",
    `\`${args.branch}\``,
    "",
    "## Summary",
    args.reason,
    ...diagnostics,
    "",
    "## Files Changed",
    "- (unknown)",
    "",
    "## Verification",
    "- (not run)",
    "",
    "## Risks",
    "- Local swarm generated this failure handoff because the SDK run failed.",
    "",
    "## Next Steps",
    `- Inspect logs for \`${args.taskName}\` and decide whether to respawn.`,
    "",
  ].join("\n");
}

function normalizeHandoffBody(body: string): string {
  return `${body.trim()}\n`;
}

function parseBranch(body: string): string | null {
  const section = extractSection(body, "Branch");
  if (!section) return null;
  const match = section.match(/`([^`]+)`/);
  return (match?.[1] ?? firstMeaningfulLine(section)) || null;
}

function extractSection(body: string, heading: string): string | null {
  const re = new RegExp(`^##\\s+${heading}\\s*\\r?\\n([\\s\\S]*?)(?=^##\\s+|$(?![\\r\\n]))`, "im");
  const match = body.match(re);
  return match?.[1]?.trim() ?? null;
}

function firstMeaningfulLine(section: string | null): string | null {
  if (!section) return null;
  for (const line of section.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^[-*]\s*/, "");
    if (trimmed) return trimmed;
  }
  return null;
}
