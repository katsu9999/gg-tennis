module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module", project: "./tsconfig.json" },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    "no-restricted-imports": ["error", { patterns: ["http://*", "https://fonts.googleapis.com/*", "https://fonts.gstatic.com/*"] }],
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
  ignorePatterns: ["dist", "node_modules", "*.cjs"],
};
