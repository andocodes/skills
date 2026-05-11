import { describe, expect, test } from "bun:test";
import { extractFinalHandoff, parseHandoff } from "../src/handoff.ts";

describe("handoff parsing", () => {
  test("extracts final worker handoff", () => {
    const handoff = extractFinalHandoff(`Some prose

## Status
success

## Branch
\`swarm/root/task\`
`);
    const parsed = parseHandoff(handoff);
    expect(parsed.hasStructuredHandoff).toBe(true);
    expect(parsed.status).toBe("success");
    expect(parsed.branch).toBe("swarm/root/task");
  });

  test("parses verifier handoff", () => {
    const parsed = parseHandoff(`## Verification
passed

## Branch
\`swarm/root/verify\`
`);
    expect(parsed.kind).toBe("verifier");
    expect(parsed.status).toBe("passed");
  });
});
