import { describe, expect, test } from "bun:test";
import { buildImage, defaultImageTag, parseImagePreset } from "../src/images.ts";

describe("image build plans", () => {
  test("uses versioned swarm-agent tags", () => {
    expect(defaultImageTag("codex-rust")).toBe("swarm-agent:0.1.0-codex-rust");
  });

  test("builds dry-run docker command for a preset", () => {
    const result = buildImage({ preset: "claude-go", dryRun: true });
    expect(result.tag).toBe("swarm-agent:0.1.0-claude-go");
    expect(result.command).toContain("SWARM_AGENT_HARNESS=claude");
    expect(result.command).toContain("SWARM_AGENT_TOOLCHAIN=go");
  });

  test("builds Pi image presets", () => {
    const result = buildImage({ preset: "pi-rust", dryRun: true });
    expect(result.tag).toBe("swarm-agent:0.1.0-pi-rust");
    expect(result.command).toContain("SWARM_AGENT_HARNESS=pi");
    expect(result.command).toContain("SWARM_AGENT_TOOLCHAIN=rust");
  });

  test("rejects unknown presets", () => {
    expect(() => parseImagePreset("node-party")).toThrow();
  });
});
