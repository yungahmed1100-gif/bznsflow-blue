import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';

// Deliberately narrow.
//
// This repo had no linter at all, so the useful setting is not "every rule ESLint
// ships" — it is the smallest set that catches the class of bug this codebase has
// actually produced, while staying green on the first run. A config that reports
// 400 stylistic complaints on day one gets switched off in week one.
//
// What is in here catches: a symbol that does not exist (the `sent is not
// defined` that made tests/lead.test.mjs fail silently for months because no
// script ran it), an import that no longer resolves to anything, unreachable
// code, and a React hook called conditionally.
//
// What is NOT in here: anything about formatting. Prettier was declined, and
// several Layla files are written in a deliberately dense style that a style
// rule would fight. See docs/technical-debt.md.

const shared = {
  'no-unused-vars': ['error', {
    args: 'none',                       // handlers legitimately ignore trailing args
    varsIgnorePattern: '^_',
    caughtErrors: 'none',               // `catch {}` and unused `catch (e)` are both idiomatic here
    ignoreRestSiblings: true,           // `const { a, ...rest } = x` to omit a key
  }],
  'no-undef': 'error',
  'no-unreachable': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-class-members': 'error',
  'no-duplicate-case': 'error',
  'no-self-compare': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  // An unawaited promise in a handler is a request that answers before its work
  // is done — the failure mode is silence, which is the worst kind here.
  'require-atomic-updates': 'off',      // too noisy on the CAS-style code in _lib/layla
};

export default [
  {
    ignores: [
      'dist/**', 'node_modules/**', 'work/**', '.convex/**', '.claude/**',
      'convex/_generated/**',
      // Generated: fix the generator, not the output.
      'src/lib/sector-prefill.generated.js', 'api/_lib/kb.generated.js',
    ],
  },

  // Browser code.
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, react },
    rules: {
      ...shared,
      // Without these two, base no-unused-vars cannot see JSX and reports every
      // component import — and `React` itself — as unused. That is 140+ false
      // positives, i.e. a linter nobody would keep. They mark identifiers used
      // in JSX as used; they report nothing themselves.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'react-hooks/rules-of-hooks': 'error',
      // Not `error`: the existing components have deliberate, working effects
      // with partial dependency lists, and changing them is a behaviour change,
      // not a lint fix.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Server code, build scripts and tests.
  {
    files: ['api/**/*.js', 'scripts/**/*.mjs', 'tests/**/*.mjs', 'ops/**/*.js', 'config/**/*.js', 'convex/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: shared,
  },

  // Playwright drivers. These are Node scripts, but the bodies they hand to
  // page.evaluate() are serialised and run inside the browser, so `document` and
  // `window` in them are real and correct rather than undefined.
  {
    files: ['tests/*-browser.mjs', 'scripts/a11y.mjs', 'scripts/shoot.mjs', 'scripts/seo/collect.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
