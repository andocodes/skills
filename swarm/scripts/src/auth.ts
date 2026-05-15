import { Cursor } from "@cursor/sdk";
import { SwarmValidationError } from "./schemas.ts";

export interface AuthDoctorResult {
  ok: boolean;
  keyPresent: boolean;
  keyPreview: string | null;
  apiKeyName?: string;
  userEmail?: string;
  models?: string[];
  error?: string;
}

export function requireApiKey(): string {
  const key = process.env.CURSOR_API_KEY?.trim();
  if (!key) {
    throw new SwarmValidationError(
      "CURSOR_API_KEY is required for Cursor SDK local runtime. Create a user API key in Cursor Dashboard > Integrations and export it in this shell."
    );
  }
  return key;
}

export async function authDoctor(): Promise<AuthDoctorResult> {
  const key = process.env.CURSOR_API_KEY?.trim();
  if (!key) {
    return {
      ok: false,
      keyPresent: false,
      keyPreview: null,
      error: "CURSOR_API_KEY is not set in this process.",
    };
  }
  try {
    const me = await Cursor.me({ apiKey: key });
    const models = await Cursor.models.list({ apiKey: key });
    return {
      ok: true,
      keyPresent: true,
      keyPreview: previewKey(key),
      apiKeyName: me.apiKeyName,
      userEmail: me.userEmail,
      models: models.map(model => model.id),
    };
  } catch (error) {
    return {
      ok: false,
      keyPresent: true,
      keyPreview: previewKey(key),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function previewKey(key: string): string {
  if (key.length <= 12) return `${key.slice(0, 3)}...`;
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}
