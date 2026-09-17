import { isEinschraenkungGrundCode, type EinschraenkungGrundCode } from '../../nachweis/domain/paar-einschraenkung';
import type { Endkunde } from '../persistence/energy/energy-endkunde.repository';
import type { EndkundeDetail, EndkundeListItem, EndkundePiiResponse } from './endkunde.types';

/**
 * Der Spaltentyp ist `text` (die Wertemenge sichert `ck_endkunde_einschraenkung_
 * grund_code`, V0024) — das Repository liefert daher `string | null`. Statt
 * blind zu casten wird gegen die geschlossene Liste geprueft; ein Wert, den
 * der CHECK theoretisch durchliesse, die Anwendung aber nicht kennt, wird zu
 * `null` (fail-closed: lieber kein Grund angezeigt als ein erfundener).
 */
function toEinschraenkungGrundCode(wert: string | null | undefined): EinschraenkungGrundCode | null {
  return typeof wert === 'string' && isEinschraenkungGrundCode(wert) ? wert : null;
}

/** mapRow-Konvention (ADR-0008 §20, A6) — Energy-Zeile -> Listen-Projektion (PII-frei, Linie 2). */
export function mapEndkundeListItem(endkunde: Endkunde): EndkundeListItem {
  return {
    id: endkunde.id,
    verarbeitungsStatus: endkunde.verarbeitungsStatus,
    consentStatus: endkunde.consentStatus,
    vonWissAuswertungAusgenommen: endkunde.vonWissAuswertungAusgenommen,
    endkundengruppe: endkunde.endkundengruppe,
    createdAt: endkunde.createdAt,
  };
}

/** mapRow-Konvention — Energy-Zeile + (ggf.) entschlüsselter PII-Block (D6-Ergebnis) -> Detail. */
export function mapEndkundeDetail(endkunde: Endkunde, stammdatenPii: EndkundePiiResponse | null): EndkundeDetail {
  return {
    id: endkunde.id,
    verarbeitungsStatus: endkunde.verarbeitungsStatus,
    consentStatus: endkunde.consentStatus,
    consentTextVersion: endkunde.consentTextVersion,
    vonWissAuswertungAusgenommen: endkunde.vonWissAuswertungAusgenommen,
    endkundengruppe: endkunde.endkundengruppe,
    createdAt: endkunde.createdAt,
    updatedAt: endkunde.updatedAt,
    // A11.4 — NICHT ueber `PiiProjektionsPolicy` gefiltert, s. `EndkundeDetail`-Dok.
    // `?? null` normalisiert `undefined` (optionale Repo-Felder) auf `null`.
    einschraenkungGrundCode: toEinschraenkungGrundCode(endkunde.einschraenkungGrundCode),
    neuerhebungFortsetzen: endkunde.neuerhebungFortsetzen ?? null,
    gesperrtSeit: endkunde.gesperrtSeit ?? null,
    stammdatenPii,
  };
}
