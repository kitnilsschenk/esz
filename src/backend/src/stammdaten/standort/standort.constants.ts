import { STANDORT_TYP_WERTE } from '../persistence/energy/energy-standort.repository';
import type { StandortTyp } from '../persistence/energy/energy-standort.repository';

export { STANDORT_TYP_WERTE };
export type { StandortTyp };

/**
 * Feldnamen-Konstanten für `FieldCipherService`-AAD (ADR-0010 D4, ZENTRALE
 * Sicherheitsauflage — s. `standort.service.ts`-Klassen-Dok für die
 * `subjektId`-Bindung).
 */
export const FELD_BEZEICHNUNG = 'bezeichnung';
export const FELD_ANSCHRIFT = 'anschrift';
export const FELD_GEO = 'geo';

/**
 * PROVISORISCHE v1-Whitelist für `POST .../standorte/{id}/stilllegen` (ADR-0010
 * §5: "grund (whitelisted)" — der ADR nennt keine konkreten Werte). Analog
 * `ShredAblehnungsgrund` (`shred-antrag.constants.ts`): kein Freitext (Linie 2),
 * finale Bestätigung/Erweiterung nach Review `access-control-engineer`/
 * `compliance-director`.
 */
export const STANDORT_STILLLEGEN_GRUND_WERTE = [
  'fehlanlage_korrektur',
  'gebaeude_ausser_betrieb',
  'nutzung_beendet',
  'sonstige',
] as const;
export type StandortStilllegenGrund = (typeof STANDORT_STILLLEGEN_GRUND_WERTE)[number];

/**
 * D4 (ADR-0010) — Adress-Zulässigkeit je Ebene: Pflicht auf Wurzelknoten,
 * optional auf `gebaeude`, verboten sonst. Angewendet in `StandortService.
 * anlegen()`/`aendernPii()`.
 */
export function istWurzelknoten(parentId: string | null): boolean {
  return parentId === null;
}

export function istAdresseZulaessig(typ: StandortTyp, parentId: string | null): boolean {
  return istWurzelknoten(parentId) || typ === 'gebaeude';
}

export function istAdressePflicht(parentId: string | null): boolean {
  return istWurzelknoten(parentId);
}

/**
 * `hatAdresse` in der `read:standort`-Baum-Antwort (ADR-0010 §5) ist bewusst
 * STRUKTURELL berechnet (`typ`/`parentId`, D4-Adressfähigkeit) — NICHT die
 * tatsächliche Präsenz einer hinterlegten Adresse. Ein echter Presence-Check
 * würde `identity.standort_pii.anschrift_enc IS NOT NULL` erfordern —
 * genau der `identity`-Zugriff, den der kritische Punkt des Arbeitsauftrags
 * für DIESE Lesestufe ausdrücklich ausschließt ("Diese Antwort muss ohne
 * jeden identity-Zugriff zustande kommen"). Feld-Semantik daher:
 * "adressfähig nach D4", nicht "Adresse hinterlegt". Offener Punkt (s.
 * finale Antwort dieses Arbeitspakets): sollte echte Presence-Information
 * gebraucht werden, bräuchte es eine service-gepflegte, PII-freie
 * `energy.standort`-Spalte (neue Migration, außerhalb dieses Arbeitspakets).
 */
export function hatAdresseStrukturell(typ: StandortTyp, parentId: string | null): boolean {
  return istAdresseZulaessig(typ, parentId);
}
