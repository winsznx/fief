import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Copy guard, layer 2 (handoff §3).
 *
 * `scripts/copy-guard.mjs` is the authoritative check; these rules give
 * in-editor feedback while typing. Both exist because `lib/copy.ts` can only
 * validate strings routed through it, and a forbidden claim is most likely to
 * be written directly into JSX.
 */
const FORBIDDEN_COPY = "trustless|unextractable|impossible to fake|guaranteed profit";

const FORBIDDEN_COPY_MESSAGE =
  "Forbidden copy (handoff §3). Never ship 'trustless', 'unextractable', 'impossible to fake' or 'guaranteed profit'. Use an APPROVED phrase from lib/copy.ts.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `Literal[value=/${FORBIDDEN_COPY}/i]`,
          message: FORBIDDEN_COPY_MESSAGE,
        },
        {
          selector: `TemplateElement[value.raw=/${FORBIDDEN_COPY}/i]`,
          message: FORBIDDEN_COPY_MESSAGE,
        },
        {
          selector: `JSXText[value=/${FORBIDDEN_COPY}/i]`,
          message: FORBIDDEN_COPY_MESSAGE,
        },
      ],
    },
  },
  {
    // These files necessarily contain the words they forbid.
    files: ["lib/copy.ts", "scripts/copy-guard.mjs", "eslint.config.mjs"],
    rules: { "no-restricted-syntax": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
