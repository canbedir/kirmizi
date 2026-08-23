import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Wrangler's own build output. It's generated, it isn't committed, and
    // its unused-variable warnings were most of what lint had to say — which
    // is the whole problem with them: a report nobody reads is a report that
    // hides the one line that matters.
    "**/.wrangler/**",
  ]),
]);

export default eslintConfig;
