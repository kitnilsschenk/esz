import type { BetriebsStatus, MessgroesseArt, Messrichtung } from '../persistence/energy/energy-messkanal.repository';

export interface MesskanalListItem {
  readonly id: string;
  readonly zaehlerId: string;
  readonly messgroesse: string;
  readonly einheit: string;
  readonly art: MessgroesseArt;
  readonly status: BetriebsStatus;
  readonly obisKennzahl: string | null;
  readonly istUntermessung: boolean;
  readonly richtung: Messrichtung;
  readonly createdAt: string;
}

export interface MesskanalDetail {
  readonly id: string;
  readonly zaehlerId: string;
  readonly messgroesse: string;
  readonly einheit: string;
  readonly art: MessgroesseArt;
  readonly status: BetriebsStatus;
  readonly obisKennzahl: string | null;
  readonly istUntermessung: boolean;
  readonly richtung: Messrichtung;
  readonly createdAt: string;
  readonly updatedAt: string;
}
