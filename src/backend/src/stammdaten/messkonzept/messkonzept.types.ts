import type { Energietraeger } from '../persistence/energy/energy-zaehler.repository';
import type { MesskonzeptTyp } from '../persistence/energy/energy-messkonzept.repository';

export interface MesskonzeptVersionListItem {
  readonly versionNr: number;
  readonly typ: MesskonzeptTyp;
  readonly gueltigVon: string;
  readonly gueltigBis: string | null;
  readonly createdAt: string;
}

export interface EnergietraegerBaseline {
  /** Kennung dieses Energietraeger-Eintrags — Schluessel fuer Berechnungslauf und Systemgrenze. */
  readonly mvetId: string;
  readonly energietraeger: Energietraeger;
  readonly baselineWert: number | null;
  readonly baselineEinheit: string | null;
  readonly baselineMethode: string | null;
  readonly baselineBegruendung: string | null;
  readonly baselineBelegRef: string | null;
  /** TB-02 (V0065) — externer Belegverweis, s. `EnergietraegerBaselineDto`-Kommentar. */
  readonly baselineAbrechnungenAnzahl: number | null;
  readonly baselineBelegAktenzeichen: string | null;
  readonly baselineBelegAblageort: string | null;
  /** ADR-0007 B13.4/B14/O-B3b (V0029) — s. `EnergietraegerBaselineDto`-Kommentar. */
  readonly energietraegerSubstitution: boolean;
}

export interface MesskonzeptVersionDetail {
  readonly versionNr: number;
  readonly typ: MesskonzeptTyp;
  readonly systemgrenze: string;
  readonly systembeschreibung: string;
  readonly bereinigungsverfahren: string;
  readonly messgeraeteWahl: string;
  readonly geraeteerkennungsVerfahren: string;
  readonly aenderungsgrund: string | null;
  readonly gueltigVon: string;
  readonly gueltigBis: string | null;
  readonly energietraeger: readonly EnergietraegerBaseline[];
  readonly createdAt: string;
}
