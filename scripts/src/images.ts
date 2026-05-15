import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SWARM_IMAGE_VERSION = "0.1.0";

export type ImagePreset =
  | "codex-core"
  | "claude-core"
  | "codex-rust"
  | "claude-rust"
  | "codex-go"
  | "claude-go"
  | "fake";

export interface ImageBuildOptions {
  preset: ImagePreset;
  runtime?: "docker" | "podman";
  tag?: string;
  dryRun?: boolean;
}

export interface ImageBuildResult {
  preset: ImagePreset;
  tag: string;
  command: string[];
  dryRun?: boolean;
  status?: number;
  error?: string;
}

export function buildImage(options: ImageBuildOptions): ImageBuildResult {
  const runtime = options.runtime ?? "docker";
  const preset = options.preset;
  const tag = options.tag ?? defaultImageTag(preset);
  const parsed = parsePreset(preset);
  const command = [
    runtime,
    "build",
    "-f",
    dockerfilePath(),
    "-t",
    tag,
    "--build-arg",
    `SWARM_AGENT_HARNESS=${parsed.harness}`,
    "--build-arg",
    `SWARM_AGENT_TOOLCHAIN=${parsed.toolchain}`,
    skillRoot(),
  ];

  if (options.dryRun) {
    return { preset, tag, command, dryRun: true };
  }

  const result = spawnSync(command[0], command.slice(1), { stdio: "inherit" });
  return {
    preset,
    tag,
    command,
    status: result.status ?? 1,
    error: result.error?.message,
  };
}

export function defaultImageTag(preset: ImagePreset): string {
  return `swarm-agent:${SWARM_IMAGE_VERSION}-${preset}`;
}

export function parseImagePreset(value: string): ImagePreset {
  if (
    value === "codex-core" ||
    value === "claude-core" ||
    value === "codex-rust" ||
    value === "claude-rust" ||
    value === "codex-go" ||
    value === "claude-go" ||
    value === "fake"
  ) {
    return value;
  }
  throw new Error(
    `expected image preset codex-core, claude-core, codex-rust, claude-rust, codex-go, claude-go, or fake; got ${value}`
  );
}

function parsePreset(preset: ImagePreset): { harness: string; toolchain: string } {
  if (preset === "fake") return { harness: "fake", toolchain: "core" };
  const [harness, toolchain] = preset.split("-");
  return { harness, toolchain };
}

function dockerfilePath(): string {
  return join(skillRoot(), "container", "Dockerfile");
}

function skillRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}
