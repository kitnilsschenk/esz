import { isEinschraenkungGrundCode, type EinschraenkungGrundCode } from '../../nachweis/domain/paar-einschraenkung';
import type { Anschlussnutzer } from '../persistence/energy/energy-anschlussnutzer.repository';
import type { AnschlussnutzerDetail, AnschlussnutzerListItem, AnschlussnutzerPiiResponse } from './anschlussnutzer.types';

/**
 * Spaltentyp ist `text` (Wertemenge sichert `ck_anschlussnutzer_einschraenkung_
 * grund_code`, V0024) — statt blind zu casten wird gegen die geschlossene
 * Liste geprueft. Fail-closed: lieber kein Grund angezeigt als ein erfundener.
 */
function toEinschraenkungGrundCode(wert: string | null | undefined): EinschraenkungGrundCode | null {
  return typeof wert === 'string' && isEinschraenkungGrundCode(wert) ? wert : null;
}

export function mapAnschlussnutzerListItem(anschlussnutzer: Anschlussnutzer): AnschlussnutzerListItem {
  return {
    id: anschlussnutzer.id,
    endkundeId: anschlussnutzer.endkundeId,
    verarbeitungsStatus: anschlussnutzer.verarbeitungsStatus,
    createdAt: anschlussnutzer.createdAt,
  };
}

export function mapAnschlussnutzerDetail(
  anschlussnutzer: Anschlussnutzer,
  stammdatenPii: AnschlussnutzerPiiResponse | null,
): AnschlussnutzerDetail {
  return {
    id: anschlussnutzer.id,
    endkundeId: anschlussnutzer.endkundeId,
    verarbeitungsStatus: anschlussnutzer.verarbeitungsStatus,
    createdAt: anschlussnutzer.createdAt,
    updatedAt: anschlussnutzer.updatedAt,
    einschraenkungGrundCode: toEinschraenkungGrundCode(anschlussnutzer.einschraenkungGrundCode),
    neuerhebungFortsetzen: anschlussnutzer.neuerhebungFortsetzen ?? null,
    gesperrtSeit: anschlussnutzer.gesperrtSeit ?? null,
    stammdatenPii,
  };
}
