/** @type {import('@types/eslint').Linter.BaseConfig} */
module.exports = {
  root: true,
  extends: [
    "@remix-run/eslint-config",
    "@remix-run/eslint-config/node",
    "@remix-run/eslint-config/jest-testing-library",
    "prettier",
  ],
  globals: {
    shopify: "readonly"
  },
  rules: {
    // Reduce noise from unused vars in generated or optional code paths
    "@typescript-eslint/no-unused-vars": "off",
    "no-unused-vars": "off",
  }
};