// Root ESLint Flat Config (ESLint 9) für das gesamte pnpm-Workspace.
//
// ADR-0001, Abschnitt 10.2: typescript-eslint im "type-checked"-Modus,
// `@typescript-eslint/no-explicit-any` als Fehler, Prettier per
// `eslint-config-prettier` entkoppelt (kein Format-vs-Lint-Konflikt).
//
// Wird von jedem Workspace-Paket automatisch gefunden — ESLint (Flat Config)
// sucht ausgehend vom cwd nach oben im Verzeichnisbaum, bis eine
// eslint.config.* gefunden wird. Jedes Paket ruft daher einfach `eslint .`
// in seinem "lint"-Script auf (siehe src/*/package.json).
//
// Scope AP1 (Projekt-Skelett): nur TS/TSX-Dateien werden typ-bewusst gelintet.
// Reine JS/MJS-Konfigdateien (z. B. diese Datei) sind bewusst nicht Teil des
// Lint-Laufs eines Pakets; wird bei Bedarf in AP4/AP5 um @eslint/js für
// Config-Dateien ergänzt.

import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Tooling-Configs (Vitest/Vite-Workspace-Dateien) liegen außerhalb der
    // Paket-tsconfig-`include`-Bereiche — ohne diesen Block stolpert der
    // projectService über sie (AP6-Finding). Sie werden ohne Typ-Information
    // gelintet; das genügt für reine Konfigurationsdateien.
    files: [
      '**/*.config.ts',
      '**/vitest.workspace.ts',
      '**/vitest.setup.ts',
      '**/vitest.integration.config.ts',
    ],
    extends: [tseslint.configs.disableTypeChecked],
  },
  eslintConfigPrettier,
);
