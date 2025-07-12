/** @type {import('@types/eslint').Linter.BaseConfig} */
module.exports = {
  root: true,
  extends: [
    "@remix-run/eslint-config",
    "@remix-run/eslint-config/node",
    "prettier",
  ],
  globals: {
    shopify: "readonly"
  },
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    // Allow unused variables that are intentionally kept for future use
    "@typescript-eslint/no-unused-vars": ["error", { 
      "argsIgnorePattern": "^_",
      "varsIgnorePattern": "^_",
      "caughtErrorsIgnorePattern": "^_"
    }],
    // Allow console.log in development
    "no-console": process.env.NODE_ENV === "production" ? "error" : "warn",
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
      env: {
        node: true,
        es2022: true,
      },
      plugins: ["vitest"],
      rules: {
        "vitest/expect-expect": "error",
        "vitest/no-disabled-tests": "warn",
        "vitest/no-focused-tests": "error",
        "vitest/no-identical-title": "error",
        "vitest/valid-expect": "error",
      },
    }
  ]
};