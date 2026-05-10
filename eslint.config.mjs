import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // React recommended rules (jsx-a11y + react-hooks already come from Next config).
  {
    files: ["**/*.{jsx,tsx}"],
    ...react.configs.flat.recommended,
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.flat.recommended.rules,
      // Next.js doesn't need React in scope for JSX (new JSX transform).
      "react/react-in-jsx-scope": "off",
      // TypeScript covers these — turn off the runtime-only checks.
      "react/prop-types": "off",
    },
  },
  // Strict, type-aware TypeScript rules. Scoped to TS/TSX only so JS/MJS files
  // aren't forced through the type checker.
  ...tseslint.configs.strictTypeChecked.map((c) => ({
    ...c,
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ...(c.languageOptions ?? {}),
      parserOptions: {
        ...(c.languageOptions?.parserOptions ?? {}),
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  })),
  // Tune strict rules to mute pedantic stylistic ones; keep the safety-critical
  // catches (no-floating-promises, no-misused-promises, unsafe-any, etc.).
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scripts/**",
  ]),
]);

export default eslintConfig;
