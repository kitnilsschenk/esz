import { randomUUID } from 'node:crypto';

/**
 * Erzeugt synthetische, eindeutige Testdaten für die E2E-Läufe — niemals
 * Prod-Daten (`.claude/rules/tests.md`), und niemals an vorhandene Zeilen
 * angehängt: Jeder Lauf legt an, was er braucht, mit einer Kennzeichnung, die
 * kein zweiter Lauf zufällig trifft. Das hält die Tests wiederholbar, ohne
 * dass ein Aufräumlauf sie rot werden lässt (`AUFTRAG`: „Aufräumen nach dem
 * Test, oder von vornherein so anlegen, dass Wiederholung funktioniert").
 *
 * Bewusst ohne `@faker-js/faker`: Kein bestehendes Frontend-Paket dieses
 * Projekts führt die Abhängigkeit, und `node:crypto`s `randomUUID` liefert
 * dieselbe Eindeutigkeit ohne eine neue Lizenzprüfung
 * (`.claude/rules/dependencies.md`) auszulösen — Muster analog
 * `src/backend/src/e2e/energiekette.e2e.integration.spec.ts`.
 */
function kennzeichen(): string {
  return randomUUID().slice(0, 8);
}

/** `praefix` + eindeutiges Kennzeichen — für frei lesbare Felder (Namen, Aktenzeichen, Anschriften). */
export function eindeutig(praefix: string): string {
  return `${praefix} ${kennzeichen()}`;
}

/**
 * Wie `eindeutig`, aber nur Großbuchstaben/Ziffern/Bindestrich — für
 * Kennungs-Felder mit eingeschränktem Zeichenvorrat (z. B. der
 * Förderjahr-Code, der gegen `^[A-Za-z0-9_-]+$` geprüft wird).
 */
export function eindeutigeKennung(praefix: string): string {
  return `${praefix}-${kennzeichen().toUpperCase()}`;
}

/**
 * Ein synthetisches Einmal-Passwort für Portal-E2E-Läufe — mindestens zwölf
 * Zeichen (Serverregel, s. `portal-passwort.util.ts` und
 * `PASSWORT_MINDESTLAENGE` in `PortalAnmeldeSeite.tsx`), ohne Leerzeichen
 * (anders als `eindeutig()`, das für frei lesbare Textfelder gedacht ist).
 * Gilt nur für die Dauer des jeweiligen Testlaufs — kein Bezug zu einem
 * echten Zugang.
 */
export function eindeutigesPasswort(): string {
  return `E2E-Testpasswort-${kennzeichen()}!`;
}

/** Der erste Tag des laufenden Kalendermonats, als `YYYY-MM-01` (UTC). */
export function ersterTagDiesesMonats(): string {
  const jetzt = new Date();
  const jahr = jetzt.getUTCFullYear();
  const monat = String(jetzt.getUTCMonth() + 1).padStart(2, '0');
  return `${String(jahr)}-${monat}-01`;
}
