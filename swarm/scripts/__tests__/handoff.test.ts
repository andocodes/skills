import { describe, expect, test } from "bun:test";
import { classifyHandoffStatus, extractFinalHandoff, parseHandoff } from "../src/handoff.ts";

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

  test("worker with both Status and Verification reads from Status (L4 regression)", () => {
    const parsed = parseHandoff(`## Status
success

## Branch
\`swarm/walk/l3b\`

## Verification
- \`bun install\`: failed as expected with proto-package link

## Risks
- (none)
`);
    expect(parsed.kind).toBe("worker");
    expect(parsed.status).toBe("success");
  });

  test("worker without Status falls through to verifier classification", () => {
    const parsed = parseHandoff(`## Verification
passed
`);
    expect(parsed.kind).toBe("verifier");
  });
});

describe("classifyHandoffStatus", () => {
  test("accepts worker with success", () => {
    const parsed = parseHandoff(`## Status\nsuccess\n`);
    const verdict = classifyHandoffStatus(parsed);
    expect(verdict.accepted).toBe(true);
  });

  test("rejects worker with off-canonical status (ready)", () => {
    const parsed = parseHandoff(`## Status\nready\n`);
    const verdict = classifyHandoffStatus(parsed);
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain("\"ready\"");
  });

  test("rejects worker with blocked", () => {
    const parsed = parseHandoff(`## Status\nblocked\n`);
    const verdict = classifyHandoffStatus(parsed);
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain("\"blocked\"");
  });

  test("rejects worker with failed", () => {
    const parsed = parseHandoff(`## Status\nfailed\n`);
    const verdict = classifyHandoffStatus(parsed);
    expect(verdict.accepted).toBe(false);
  });

  test("accepts verifier with passed", () => {
    const parsed = parseHandoff(`## Verification\npassed\n`);
    const verdict = classifyHandoffStatus(parsed);
    expect(verdict.accepted).toBe(true);
  });

  test("rejects verifier with failed", () => {
    const parsed = parseHandoff(`## Verification\nfailed\n`);
    const verdict = classifyHandoffStatus(parsed);
    expect(verdict.accepted).toBe(false);
  });

  test("worker status is matched case-insensitively against the literal", () => {
    const parsed = parseHandoff(`## Status\nSuccess\n`);
    const verdict = classifyHandoffStatus(parsed);
    expect(verdict.accepted).toBe(true);
  });
});
