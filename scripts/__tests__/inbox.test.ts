import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  appendInboxMessage,
  formatInbox,
  messagesForTask,
  readInboxMessages,
} from "../src/inbox.ts";

describe("swarm inbox", () => {
  test("appends and reads jsonl messages", () => {
    const workspace = mkdtempSync(join(tmpdir(), "swarm-inbox-"));
    appendInboxMessage(workspace, {
      from: "operator",
      task: "platform-ui",
      priority: "blocked",
      body: "Need a contract decision",
    });

    const messages = readInboxMessages(workspace);
    expect(messages).toHaveLength(1);
    expect(messages[0].audience).toBe("task");
    expect(messages[0].task).toBe("platform-ui");
    expect(formatInbox(messages)).toContain("Need a contract decision");
  });

  test("filters messages for a task", () => {
    const messages = [
      {
        id: "1",
        createdAt: new Date(0).toISOString(),
        from: "operator",
        audience: "task" as const,
        task: "one",
        priority: "info" as const,
        body: "task one",
      },
      {
        id: "2",
        createdAt: new Date(0).toISOString(),
        from: "operator",
        audience: "all" as const,
        priority: "decision" as const,
        body: "broadcast",
      },
    ];

    expect(messagesForTask(messages, "one").map(message => message.body)).toEqual([
      "task one",
      "broadcast",
    ]);
  });
});
