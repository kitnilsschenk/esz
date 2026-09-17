/**
 * ADR-0009 §2.1/§5/§8 — Verfallsfenster für offene Shred-Anträge
 * (`gueltig_bis = beantragt_am + Frist`). PROVISORISCHER v1-Wert (analog
 * `MAX_FENSTER_TAGE`, `auth/policy/break-glass.constants.ts`): der ADR nennt
 * "Vorschlag 7 Tage" (kompatibel mit der Art.-12(3)-Monatsfrist für
 * Betroffenenanträge) — finale Bestätigung durch `security-lead`/
 * `compliance-director` steht laut ADR-0009 §8 noch aus.
 */
export const SHRED_ANTRAG_GUELTIGKEIT_TAGE = 7;

const MS_PRO_TAG = 24 * 60 * 60 * 1000;

export function berechneGueltigBis(beantragtAm: Date): Date {
  return new Date(beantragtAm.getTime() + SHRED_ANTRAG_GUELTIGKEIT_TAGE * MS_PRO_TAG);
}

/**
 * ADR-0009 §2.1/§8 (compliance-director-Auflage 4, §5) — PROVISORISCHE
 * v1-Ablehnungsgrund-Whitelist. Finale Bestätigung durch
 * `access-control-engineer`/`compliance-director` steht laut ADR-0009 §8
 * noch aus. Kein Freitext (rote Linie 2) — DB speichert `text`, App-seitig
 * ausschließlich diese vier Werte.
 */
export const SHRED_ABLEHNUNGSGRUND_WERTE = [
  'kein_rechtsgrund',
  'endkunde_widerspruch',
  'fehlbedienung',
  'sonstiges',
] as const;

export type ShredAblehnungsgrund = (typeof SHRED_ABLEHNUNGSGRUND_WERTE)[number];
