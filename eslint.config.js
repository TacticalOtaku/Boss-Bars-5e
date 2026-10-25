import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-console": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Pure core: runs in plain Node, knows nothing about Foundry or the DOM.
    files: ["src/core/**/*.ts"],
    languageOptions: { globals: {} },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ regex: "(^|/)(foundry|ui|apps|integrations)(/|$)", message: "core/ must stay pure" }],
        },
      ],
    },
  },
  {
    // The logger is the only console user.
    files: ["src/logger.ts"],
    rules: { "no-console": "off" },
  },
  {
    // Tests and the stand query markup they own.
    files: ["tests/**/*.ts", "stand/**/*.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  {
    files: ["tools/**/*.mjs", "*.config.*"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-console": "off" },
  },
);
