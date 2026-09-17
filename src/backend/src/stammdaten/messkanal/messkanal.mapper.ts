import type { Messkanal } from '../persistence/energy/energy-messkanal.repository';
import type { MesskanalDetail, MesskanalListItem } from './messkanal.types';

export function mapMesskanalListItem(messkanal: Messkanal): MesskanalListItem {
  return {
    id: messkanal.id,
    zaehlerId: messkanal.zaehlerId,
    messgroesse: messkanal.messgroesse,
    einheit: messkanal.einheit,
    art: messkanal.art,
    status: messkanal.status,
    obisKennzahl: messkanal.obisKennzahl,
    // Beide Angaben waren bis V0074 schreibbar, aber NICHT lesbar — die
    // Antwort liess sie weg. Wer `istUntermessung` gesetzt hatte, konnte es
    // nirgends nachpruefen, obwohl ein falscher Wert die Einsparung
    // verfaelscht (V0058: −18 154 kWh an einem realen Bestand).
    istUntermessung: messkanal.istUntermessung,
    richtung: messkanal.richtung,
    createdAt: messkanal.createdAt,
  };
}

export function mapMesskanalDetail(messkanal: Messkanal): MesskanalDetail {
  return {
    id: messkanal.id,
    zaehlerId: messkanal.zaehlerId,
    messgroesse: messkanal.messgroesse,
    einheit: messkanal.einheit,
    art: messkanal.art,
    status: messkanal.status,
    obisKennzahl: messkanal.obisKennzahl,
    istUntermessung: messkanal.istUntermessung,
    richtung: messkanal.richtung,
    createdAt: messkanal.createdAt,
    updatedAt: messkanal.updatedAt,
  };
}
