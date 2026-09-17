// Typ-Augmentation der jest-dom-Matcher (toBeInTheDocument, …) für Vitests
// `expect`. Liegt bewusst INNERHALB von src/, damit tsc (`include: ["src"]`)
// und der ESLint-projectService die Augmentation sehen — die Laufzeit-
// Registrierung passiert separat in vitest.setup.ts.
import '@testing-library/jest-dom/vitest';
