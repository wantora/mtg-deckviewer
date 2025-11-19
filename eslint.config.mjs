import js from "@eslint/js";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.commonjs,
      },
    },
    rules: {
      // eslint:recommended
      "no-unused-vars": ["error", {args: "none"}],

      // Possible Problems
      "array-callback-return": "error",
      "no-constant-binary-expression": "error",
      "no-self-compare": "error",
      "no-template-curly-in-string": "error",
      "no-unmodified-loop-condition": "error",
      "no-unreachable-loop": "error",
      "require-atomic-updates": "error",

      // Suggestions
      camelcase: "error",
      "consistent-return": "error",
      curly: "error",
      eqeqeq: "error",
      "func-name-matching": "error",
      "guard-for-in": "error",
      "no-caller": "error",
      "no-console": ["warn", {allow: ["info", "warn", "error"]}],
      "no-div-regex": "error",
      "no-duplicate-imports": "error",
      "no-empty-function": "error",
      "no-eval": "error",
      "no-extend-native": "error",
      "no-implied-eval": "error",
      "no-invalid-this": "error",
      "no-iterator": "error",
      "no-label-var": "error",
      "no-loop-func": "error",
      "no-new-func": "error",
      "no-new-wrappers": "error",
      "no-octal-escape": "error",
      "no-param-reassign": "error",
      "no-proto": "error",
      "no-script-url": "error",
      "no-sequences": "error",
      "no-shadow": ["error", {builtinGlobals: true, allow: ["name", "event"]}],
      "no-throw-literal": "error",
      "no-undef-init": "error",
      "no-unneeded-ternary": "error",
      "no-unused-expressions": "error",
      "no-var": "error",
      "no-warning-comments": "warn",
      "prefer-arrow-callback": "error",
      "prefer-promise-reject-errors": "error",
      radix: "error",
      strict: ["error", "global"],
      "symbol-description": "error",

      // Layout & Formatting
      "unicode-bom": "error",
    },
  },
  {
    files: ["scripts/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
    },
  },
];
