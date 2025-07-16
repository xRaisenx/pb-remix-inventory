import { authenticate } from "../shopify.server";
import { describe, test, expect } from "vitest";

describe("app._index", () => {
  test("should redirect to auth if no session", async () => {
    const request = new Request("https://test.com/app");
    try {
      await authenticate.admin(request);
    } catch (response) {
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/auth/login");
    }
  });
});
