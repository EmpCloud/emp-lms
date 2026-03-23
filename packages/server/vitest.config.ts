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
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/__tests__/**",
        "src/index.ts",
        "src/db/migrations/**",
        "src/db/seeds/**",
        "src/types/**",
      ],
      thresholds: {
        statements: 40,
        branches: 60,
        functions: 70,
        lines: 40,
      },
    },
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
