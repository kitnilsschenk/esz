import { describe, expect, it } from 'vitest';
import { pruefeIngestFreigabe } from './ingest-freigabe-regel';
import type { IngestFreigabeStand } from './ingest-freigabe.repository';

const FINGERABDRUCK = 'a'.repeat(64);
const ANDERER_FINGERABDRUCK = 'b'.repeat(64);

function stand(ueberschreibungen: Partial<IngestFreigabeStand> = {}): IngestFreigabeStand {
  return {
    wirksam: true,
    art: 'freigabe',
    aktenstandFingerabdruck: FINGERABDRUCK,
    freigabeRef: 'AZ-2026-001',
    attestiertDurch: 'geschaeftsfuehrung',
    erklaertAt: new Date('2026-09-17T10:00:00.000Z'),
    ...ueberschreibungen,
  };
}

describe('Ingest-Gate-Marker (ADR-0008 §22)', () => {
  it('laesst einen Start zu, wenn die Freigabe wirksam ist und der Nachweis-Stand passt', () => {
    expect(() => {
      pruefeIngestFreigabe(stand(), FINGERABDRUCK);
    }).not.toThrow();
  });

  it('verweigert den Start, wenn nie eine Erklaerung abgegeben wurde', () => {
    // Der Normalzustand einer frischen Installation. Ein Gate, das ohne jede
    // Erklaerung oeffnet, waere kein Gate.
    expect(() => {
      pruefeIngestFreigabe(undefined, FINGERABDRUCK);
    }).toThrow(/keine Erklaerung/);
  });

  it('verweigert den Start nach einem Widerruf', () => {
    // Ein Widerruf ist eine neue Zeile, keine Aenderung der alten -- im
    // Streitfall zaehlt, AB WANN etwas galt. Er muss deshalb auch wirken.
    expect(() => {
      pruefeIngestFreigabe(stand({ wirksam: false, art: 'widerruf' }), FINGERABDRUCK);
    }).toThrow(/widerruf/);
  });

  it('verweigert den Start, wenn der Deploy keinen Fingerabdruck mitgibt', () => {
    expect(() => {
      pruefeIngestFreigabe(stand(), undefined);
    }).toThrow(/EDMS_INGEST_FREIGABE_FINGERABDRUCK/);
  });

  it('nimmt einen leeren Fingerabdruck nicht als gesetzt hin', () => {
    // Eine leere Umgebungsvariable ist in der Praxis haeufiger als eine
    // fehlende -- und `''` gegen `null` zu vergleichen waere still
    // fehlgeschlagen.
    expect(() => {
      pruefeIngestFreigabe(stand(), '   ');
    }).toThrow(/EDMS_INGEST_FREIGABE_FINGERABDRUCK/);
  });

  it('verweigert den Start, wenn sich der Nachweis-Stand seit der Freigabe geaendert hat', () => {
    // Der eigentliche Gewinn gegenueber einem blossen Ja/Nein: Eine Freigabe
    // gilt fuer EINEN Stand der Nachweise. Wird spaeter eine DSFA
    // ueberarbeitet, gilt sie nicht stillschweigend weiter.
    expect(() => {
      pruefeIngestFreigabe(stand(), ANDERER_FINGERABDRUCK);
    }).toThrow(/Nachweis-Stand hat sich seit der Freigabe geaendert/);
  });

  it('verweigert den Start, wenn die Freigabe gegen gar keinen Stand erklaert wurde', () => {
    // Der CHECK in V0083 schliesst das beim Schreiben aus; hier steht es
    // trotzdem, weil diese Regel nicht darauf bauen soll, dass die Tabelle
    // heute so aussieht wie heute.
    expect(() => {
      pruefeIngestFreigabe(stand({ aktenstandFingerabdruck: null }), FINGERABDRUCK);
    }).toThrow(/Nachweis-Stand/);
  });
});
