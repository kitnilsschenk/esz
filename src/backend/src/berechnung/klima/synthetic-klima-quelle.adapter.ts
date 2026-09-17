import { Injectable } from '@nestjs/common';
import type { KlimaAbruf, KlimaQuellePort, KlimaTagRohwert } from './klima-quelle.port';

/** Wandert nach `analytics.klima_tag.quelle` (s. Spaltenkommentar V0063). */
export const SYNTHETIC_QUELLE_KENNUNG = 'synthetic_dev';

const MS_JE_TAG = 24 * 60 * 60 * 1000;
const TAGE_JE_JAHR_NAEHERUNG = 365;
/** Grob mitteleuropäisches Jahresprofil: kalter Januar, warmer Juli — rein deterministisch, KEIN Zufall. */
const JAHRESMITTEL_C = 9;
const AMPLITUDE_C = 9;
/** Kältestes Tagesmittel ~15. Januar (Tag-des-Jahres ~15) — Kosinus-Phasenverschiebung. */
const KAELTESTER_TAG_DES_JAHRES = 15;

/**
 * Deterministische, rein rechnerische Klimaquelle für Dev/Test
 * (`EDMS_SYNTHETIC_ONLY=true`, Ingest-Gate ZU laut Arbeitsauftrag) —
 * **KEIN** Fremd-Rohdatum, **KEIN** DWD-Zugriff (s. `KlimaQuellePort`-Doc,
 * der reale Adapter ist NICHT Teil dieses Pakets). Liefert für JEDEN
 * Kalendertag denselben Wert bei wiederholtem Aufruf (reine Funktion des
 * Kalendertags, `stationRef` fließt bewusst NICHT in die Formel ein — es
 * gibt in v1 keine synthetische Stationsdifferenzierung, nur EIN
 * einheitliches synthetisches Jahresprofil für alle `stationRef`-Werte).
 *
 * Formel: `t_mittel(d) = JAHRESMITTEL - AMPLITUDE · cos(2π·(d - d_kalt)/365)`
 * — ein einfaches Kosinus-Jahresprofil, kalt im Januar, warm im Juli, immer
 * reproduzierbar aus dem Kalenderdatum (kein `Math.random()`, kein
 * State/Seed nötig — Wiederholbarkeit F6/D1 ist damit strukturell
 * garantiert, nicht nur durch Snapshot-Content-Addressing).
 *
 * BEWUSST OHNE `DWD_QUELLENVERMERK`-Referenz — diese Werte sind KEINE
 * DWD-Daten, eine Attribution wäre hier sachlich falsch (s. dortiger
 * Datei-Kopf-Kommentar). Aus demselben Grund trägt die zurückgegebene
 * `KlimaHerkunft` weder Dateiversion noch Lizenzkennung: beide sind hier
 * `null`, nicht leer-gefüllt.
 */
@Injectable()
export class SyntheticKlimaQuelleAdapter implements KlimaQuellePort {
  holeTageswerte(_stationRef: string, von: string, bis: string): Promise<KlimaAbruf> {
    const start = new Date(`${von}T00:00:00.000Z`);
    const ende = new Date(`${bis}T00:00:00.000Z`);
    const werte: KlimaTagRohwert[] = [];

    for (let cursor = start; cursor.getTime() < ende.getTime(); cursor = new Date(cursor.getTime() + MS_JE_TAG)) {
      const tagDesJahres = this.tagDesJahres(cursor);
      const winkel = (2 * Math.PI * (tagDesJahres - KAELTESTER_TAG_DES_JAHRES)) / TAGE_JE_JAHR_NAEHERUNG;
      const tMittelC = JAHRESMITTEL_C - AMPLITUDE_C * Math.cos(winkel);
      werte.push({ tag: this.toIsoTag(cursor), tMittelC: Math.round(tMittelC * 100) / 100, qualitaetsNiveau: null });
    }

    return Promise.resolve({
      werte,
      herkunft: { quelle: SYNTHETIC_QUELLE_KENNUNG, dateiVersion: null, lizenzId: null },
    });
  }

  private tagDesJahres(datum: Date): number {
    const jahresanfang = Date.UTC(datum.getUTCFullYear(), 0, 1);
    return Math.floor((datum.getTime() - jahresanfang) / MS_JE_TAG) + 1;
  }

  private toIsoTag(datum: Date): string {
    const jahr = String(datum.getUTCFullYear()).padStart(4, '0');
    const monat = String(datum.getUTCMonth() + 1).padStart(2, '0');
    const tag = String(datum.getUTCDate()).padStart(2, '0');
    return `${jahr}-${monat}-${tag}`;
  }
}
