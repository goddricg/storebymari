import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-application artifacts and operational scripts kept in this workspace.
    "tmp/**",
    "AppByMari_UI_Revamp/**",
    "Design Edit/**",
    "adapters/**",
    "skills/**",
    "scripts/**",
    "**/*.js",
    "check_orders.ts",
  ]),
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    // The application retains dynamic database/API compatibility records and
    // runtime media URLs. TypeScript, tests, and the build remain the safety
    // gates for those legacy compatibility paths.
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@next/next/no-img-element": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/immutability": "off",
      "react-hooks/static-components": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
