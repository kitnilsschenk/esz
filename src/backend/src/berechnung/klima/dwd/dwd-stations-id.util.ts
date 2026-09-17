export class DwdStationsIdFehler extends Error {}

const MIT_PRAEFIX = /^(?:DWD)[-_]?(\d{1,5})$/i;
const NUR_ZIFFERN = /^(\d{1,5})$/;

/**
 * Löst die laufeigene `stationRef` in eine DWD-Stationsnummer auf.
 *
 * `stationRef` ist im Datenmodell bewusst ein freies, EINGEFRORENES Feld
 * (ADR-0006 D4/O-B5: keine Laufzeit-Auflösung über
 * `energy.standort.klimareferenz`) — es kann also auch `DEMO-STATION-…`
 * enthalten. Der DWD-Adapter braucht daraus eine fünfstellige Stationsnummer
 * und akzeptiert dafür genau zwei Schreibweisen:
 *
 *   `01420` · `1420`  →  `01420`
 *   `DWD-1420` · `DWD_01420` · `dwd1420`  →  `01420`
 *
 * Alles andere wird abgewiesen. Das ist die zweite, hier entscheidende
 * Schutzlinie: die Nummer wird in einen Dateinamen auf `opendata.dwd.de`
 * eingesetzt. Das DTO whitelistet bereits `[A-Za-z0-9_-]` gegen
 * Path-Traversal (M2, `security-auditor`), aber die Whitelist allein ließe
 * `..` zwar nicht durch, wohl aber jeden anderen Namen — und ein Abruf mit
 * geratenem Namen wäre bestenfalls ein 404, schlimmstenfalls ein Wert von
 * der falschen Station. Nach dieser Funktion besteht die Referenz aus fünf
 * Ziffern, mehr kann strukturell nicht in die URL gelangen.
 */
export function toDwdStationsId(stationRef: string): string {
  const roh = stationRef.trim();
  const treffer = NUR_ZIFFERN.exec(roh) ?? MIT_PRAEFIX.exec(roh);
  const ziffern = treffer?.[1];

  if (ziffern === undefined) {
    throw new DwdStationsIdFehler(
      `stationRef '${stationRef}' ist keine DWD-Stationsnummer. Erwartet werden fünf Ziffern (z. B. '01420') oder die Form 'DWD-01420'. ` +
        `Für Läufe ohne DWD-Bezug ist EDMS_KLIMA_QUELLE=synthetic zu verwenden.`,
    );
  }

  return ziffern.padStart(5, '0');
}
