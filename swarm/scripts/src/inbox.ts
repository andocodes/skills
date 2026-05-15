import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type InboxAudience = "planner" | "task" | "all";
export type InboxPriority = "info" | "blocked" | "decision";

export interface InboxMessage {
  id: string;
  createdAt: string;
  from: string;
  audience: InboxAudience;
  task?: string;
  priority: InboxPriority;
  body: string;
}

export interface InboxWriteInput {
  from: string;
  audience?: InboxAudience;
  task?: string;
  priority?: InboxPriority;
  body: string;
}

export function inboxPath(workspace: string): string {
  return join(workspace, "messages", "inbox.jsonl");
}

export function appendInboxMessage(workspace: string, input: InboxWriteInput): InboxMessage {
  const path = inboxPath(workspace);
  mkdirSync(dirname(path), { recursive: true });
  const message: InboxMessage = {
    id: `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    from: input.from,
    audience: input.audience ?? (input.task ? "task" : "planner"),
    task: input.task,
    priority: input.priority ?? "info",
    body: input.body.trim(),
  };
  writeFileSync(path, `${JSON.stringify(message)}\n`, { flag: "a" });
  return message;
}

export function readInboxMessages(workspace: string): InboxMessage[] {
  const path = inboxPath(workspace);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line) as InboxMessage);
}

export function formatInbox(messages: InboxMessage[]): string {
  if (messages.length === 0) return "(inbox empty)";
  return messages
    .map(message => {
      const target = message.task ? ` task=${message.task}` : "";
      return `${message.createdAt} [${message.priority}] from=${message.from} audience=${message.audience}${target}\n${message.body}`;
    })
    .join("\n\n---\n\n");
}

export function messagesForTask(messages: InboxMessage[], taskName: string): InboxMessage[] {
  return messages.filter(
    message =>
      message.audience === "all" ||
      (message.audience === "task" && message.task === taskName)
  );
}
