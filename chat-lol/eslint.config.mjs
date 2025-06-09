import nextPlugin from "@next/eslint-plugin";
import tsEslint from "typescript-eslint";
import reactRecommended from "eslint-plugin-react/configs/recommended.js";

/** @type {import('eslint').Linter.FlatConfig[]} */
const eslintConfig = [
  {
    ignores: [".next/**", "convex/.", "node_modules/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    ...reactRecommended,
    plugins: {
      "@next/next": nextPlugin,
      "@typescript-eslint": tsEslint.plugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
      "@next/next/no-img-element": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
  },
];
export default eslintConfig;
