import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      // 브라우저/에디터(CodeMirror) 의존이 큰 UI 컴포넌트는 별도 E2E 영역으로 두고,
      // 로직 계층(lib + store)을 단위 테스트로 검증한다.
      include: ["src/lib/**/*.ts", "src/store.ts"],
      exclude: ["src/**/*.test.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 90,
      },
    },
  },
});
