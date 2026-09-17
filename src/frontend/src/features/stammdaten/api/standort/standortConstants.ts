// Client-seitige Spiegelung der D4/D2.4/D2.5-Regeln aus
// `src/backend/src/stammdaten/standort/standort.constants.ts` (ADR-0010).
// Rein für UI-Komfort (Feld-Sichtbarkeit/-Hinweise, weiche Sortierungs-
// Warnung) — die Autorität bleibt beim Server (`StandortService`), der
// dieselben Regeln erneut prüft und bei Verstoß 400/409 liefert. Kein
// Duplizieren von Sicherheitslogik, nur von Formular-UX-Regeln.

import type { StandortTyp } from '@edms/shared';

/** `CHECK (typ IN (...))` (V0017) — additiv erweiterbare Whitelist. */
export const STANDORT_TYP_WERTE: readonly StandortTyp[] = ['liegenschaft', 'gebaeude', 'bauteil', 'etage', 'einheit', 'raum'];

/** D2.4 — nur diese beiden Typen dürfen `parentId === null` (Wurzelknoten) sein. */
export const STANDORT_WURZEL_TYPEN: readonly StandortTyp[] = ['liegenschaft', 'gebaeude'];

export function istWurzelTyp(typ: StandortTyp): boolean {
  return (STANDORT_WURZEL_TYPEN as readonly string[]).includes(typ);
}

/** D4 — Adresse ist auf Wurzelknoten und `gebaeude` zulässig, sonst verboten. */
export function istAdresseZulaessig(typ: StandortTyp, istWurzel: boolean): boolean {
  return istWurzel || typ === 'gebaeude';
}

/** D4 — Adresse ist auf Wurzelknoten PFLICHT, sonst optional (falls zulässig). */
export function istAdressePflicht(istWurzel: boolean): boolean {
  return istWurzel;
}

/**
 * D2.5 — kanonische Abfolge (NUR Vorschlag/weiche Warnung, KEIN Constraint:
 * "Ein Raum darf direkt unter einer Liegenschaft hängen"). Ein Kind-Knoten,
 * dessen Typ-Index NICHT größer ist als der des Eltern-Knotens (z. B. ein
 * `gebaeude`-Knoten unter einem `raum`-Knoten), gilt als ungewöhnlicher
 * Sprung — Anlage bleibt trotzdem möglich, die UI zeigt nur einen Hinweis.
 */
export function istUnueblicheAbfolge(elternTyp: StandortTyp, kindTyp: StandortTyp): boolean {
  const elternIndex = STANDORT_TYP_WERTE.indexOf(elternTyp);
  const kindIndex = STANDORT_TYP_WERTE.indexOf(kindTyp);
  return kindIndex <= elternIndex;
}

/** `POST .../stilllegen`-Body-Whitelist (`standort.constants.ts#STANDORT_STILLLEGEN_GRUND_WERTE`). */
export const STANDORT_STILLLEGEN_GRUND_WERTE = ['fehlanlage_korrektur', 'gebaeude_ausser_betrieb', 'nutzung_beendet', 'sonstige'] as const;

/** `POST .../standorte/labels`-Obergrenze je Aufruf (`standort-labels-anfrage.dto.ts#MAX_BATCH_GROESSE`). */
export const STANDORT_LABELS_MAX_BATCH_GROESSE = 500;
