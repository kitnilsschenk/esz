import type { MessgroesseArt } from '../stammdaten/persistence/energy/energy-messkanal.repository';

/** V0002/V0013/V0014-Kanon, LESERICHTUNG (numerischer DB-Code -> sprechendes Label, NIEMALS umgekehrt geraten). */
export type MesswertQualitaet = 'gemessen' | 'geschaetzt' | 'korrigiert' | 'ersatzwert';
export type MesswertHerkunft = 'ingest_live' | 'backfill' | 'manuell' | 'import_altsystem';

/** EIN roher Messwert — inkl. `qualitaet`/`herkunft` (Detailansicht, `read:verbrauch_detail`, break-glass). */
export interface MesswertRohPunkt {
  readonly ts: string;
  readonly wert: number;
  readonly qualitaet: MesswertQualitaet;
  readonly herkunft: MesswertHerkunft;
}

/**
 * `GET /messwerte/messkanaele/{messkanalId}` — Roh-Zeitreihe EINES Kanals.
 * Trägt `messgroesse`/`einheit`/`art` als Kontext (Kanal-Metadaten, damit ein
 * Konsument die Rohwerte nicht ohne Einheiten-/Art-Angabe interpretieren
 * muss) — bewusst KEINE Differenzbildung/Aggregation (das leistet
 * `VerbrauchAggregatAntwort`).
 */
export interface MesswertZeitreiheAntwort {
  readonly messkanalId: string;
  readonly messgroesse: string;
  readonly einheit: string;
  readonly art: MessgroesseArt;
  readonly werte: readonly MesswertRohPunkt[];
}
