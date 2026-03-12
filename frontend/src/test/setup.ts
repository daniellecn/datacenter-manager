/**
 * Vitest global test setup.
 * Runs before every test file.
 */
import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./handlers";

// Start MSW before all tests
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));

// Reset handlers after each test (avoids state bleed between tests)
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

// Stop MSW after all tests
afterAll(() => server.close());
