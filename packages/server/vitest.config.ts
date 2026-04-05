import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@emp-lms/shared": resolve(__dirname, "../shared/src"),
      "@emp-lms/shared/validators": resolve(__dirname, "../shared/src/validators"),
      "@emp-lms/shared/types": resolve(__dirname, "../shared/src/types"),
      "@emp-lms/shared/constants": resolve(__dirname, "../shared/src/constants"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    pool: "forks",
    include: ["src/**/*.test.ts", "src/__tests__/**/*.test.ts"],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      all: true,
      reportOnFailure: true,
      include: ["src/services/**/*.ts", "src/utils/**/*.ts", "src/api/middleware/**/*.ts"],
      exclude: ["src/__tests__/**", "tests/**", "src/db/migrations/**", "src/db/seeds/**"],
      reporter: ["text", "text-summary", "json"],
      reportsDirectory: "./coverage",
    },
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
