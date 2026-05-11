import { describe, expect, test } from "bun:test";
import { requireApiKey } from "../src/auth.ts";
import { SwarmValidationError } from "../src/schemas.ts";

describe("auth helpers", () => {
  test("requireApiKey rejects missing keys", () => {
    const previous = process.env.CURSOR_API_KEY;
    delete process.env.CURSOR_API_KEY;
    try {
      expect(() => requireApiKey()).toThrow(SwarmValidationError);
    } finally {
      if (previous === undefined) delete process.env.CURSOR_API_KEY;
      else process.env.CURSOR_API_KEY = previous;
    }
  });

  test("requireApiKey trims keys", () => {
    const previous = process.env.CURSOR_API_KEY;
    process.env.CURSOR_API_KEY = "  cursor_test_key  ";
    try {
      expect(requireApiKey()).toBe("cursor_test_key");
    } finally {
      if (previous === undefined) delete process.env.CURSOR_API_KEY;
      else process.env.CURSOR_API_KEY = previous;
    }
  });
});
