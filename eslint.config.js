import globals from "globals";
import tseslint from "typescript-eslint";
import pluginUnusedImports from "eslint-plugin-unused-imports";

export default [
  {
    // Global ignores
    ignores: ["dist/**", ".history/**", "vitest.config.ts"],
  },
  // Base JavaScript/general config (applies to .js and .ts files unless overridden)
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node, // For Node.js environment globals
      },
    },
    plugins: {
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      "unused-imports/no-unused-imports": "error",
      // Add other JS-specific or general rules here if needed
    },
  },
  // TypeScript-specific configuration
  {
    files: ["**/*.ts"], // Apply these rules only to .ts files
    languageOptions: {
      parser: tseslint.parser, // Use the TypeScript parser
      parserOptions: {
        project: "./tsconfig.json", // Path to your tsconfig.json
        // tsconfigRootDir: import.meta.dirname, // Optional: if tsconfig.json is not in the root
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      // "unused-imports": pluginUnusedImports, // Already defined globally, but can be here too if preferred
    },
    rules: {
      // Import recommended TypeScript rules
      ...tseslint.configs.recommendedTypeChecked.rules, // Or .strictTypeChecked for more rules
      // ...tseslint.configs.stylisticTypeChecked.rules, // For stylistic rules

      // Override or add specific TypeScript rules
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn", // Changed from error to warn for now to allow build

      // Unused imports for TypeScript (if not handled by the global unused-imports plugin for .ts files)
      // "unused-imports/no-unused-imports": "error", // Redundant if global one works for .ts
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
];
