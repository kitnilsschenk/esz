import type { BerechnungslaufRow, LaufergebnisRow } from './persistence/analytics-berechnungslauf.repository';
import type { BerechnungslaufAntwort, LaufergebnisAntwort } from './berechnungslauf.types';

function mapErgebnis(row: LaufergebnisRow): LaufergebnisAntwort {
  return {
    monat: row.monat,
    referenzKwh: row.referenzKwh,
    istKwh: row.istKwh,
    gtzIst: row.gtzIst,
    tageGesamt: row.tageGesamt,
    tageGemessen: row.tageGemessen,
    tageGeschaetzt: row.tageGeschaetzt,
    tageErsatz: row.tageErsatz,
    tageFehlend: row.tageFehlend,
    abdeckungPct: row.abdeckungPct,
    qualitaetsStufe: row.qualitaetsStufe,
  };
}

export function mapBerechnungslaufAntwort(
  lauf: BerechnungslaufRow,
  ergebnisse: readonly LaufergebnisRow[],
  ersetztDurchLaufId: string | null = null,
): BerechnungslaufAntwort {
  return {
    id: lauf.id,
    endkundeId: lauf.endkundeId,
    energietraeger: lauf.energietraeger,
    mvetId: lauf.mvetId,
    verfahrenCode: lauf.verfahrenCode,
    verfahrenVersion: lauf.verfahrenVersion,
    periodeVon: lauf.periodeVon,
    periodeBis: lauf.periodeBis,
    baselineWertKwh: lauf.baselineWertKwh,
    grundlastAnteil: lauf.grundlastAnteil,
    gtzBase: lauf.gtzBase,
    gtzNorm: lauf.gtzNorm,
    baselineNormKwh: lauf.baselineNormKwh,
    messkonzeptTyp: lauf.messkonzeptTyp,
    // Die vier Guetemasse gehoeren zusammen (DB-CHECK erzwingt das) — steht
    // R2, stehen auch die uebrigen. Deshalb genuegt EINE Fallunterscheidung.
    modellguete:
      lauf.gueteR2 === null || lauf.gueteCvRmsePct === null || lauf.gueteNmbePct === null || lauf.guetePunkte === null
        ? null
        : {
            bestimmtheitsmass: lauf.gueteR2,
            cvRmsePct: lauf.gueteCvRmsePct,
            nmbePct: lauf.gueteNmbePct,
            punkte: lauf.guetePunkte,
            baselineAbweichungPct: lauf.baselineAbweichungPct,
          },
    qualitaetsStufeMin: lauf.qualitaetsStufeMin,
    ausloeser: lauf.ausloeser,
    ersetztLaufId: lauf.ersetztLaufId,
    ersetztDurchLaufId,
    erstelltAt: lauf.erstelltAt,
    ergebnisse: ergebnisse.map(mapErgebnis),
  };
}
