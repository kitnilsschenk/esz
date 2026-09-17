import { describe, expect, it, vi } from 'vitest';
import { IngestMetricsService } from '../ingest-flow/ingest-metrics.service';
import type { IngestFlowService } from '../ingest-flow/ingest-flow.service';
import { NachlaufService } from './nachlauf.service';

/** Gültiger ChirpStack-Envelope — synthetisch, ohne echte DevEUI. */
function envelopeZeile(devEui = '0102030405060708'): string {
  return JSON.stringify({
    deviceInfo: { devEui },
    fPort: 1,
    data: Buffer.from([0x00]).toString('base64'),
    time: '2026-01-15T10:00:00.000Z',
  });
}

/** Die Zeilen als `AsyncIterable` — dieselbe Form, in der `readline` sie liefert. */
function zeilenAus(...zeilen: readonly string[]): AsyncIterable<string> {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await -- Der Vertrag ist async; es gibt hier nur nichts zu erwarten.
    async *[Symbol.asyncIterator]() {
      yield* zeilen;
    },
  };
}

/**
 * Die Pipeline wird gemockt: Was sie tut, prueft ihr eigener Test. Hier geht
 * es darum, WAS der Nachlauf ihr uebergibt und was er aus den Metriken
 * bilanziert. Der Mock bekommt die Metrik-Instanz, damit ein Test das
 * Verhalten der Pipeline (Messwert geschrieben / Quarantaene) nachstellen kann.
 */
function baue(
  verhalten?: (metrics: IngestMetricsService) => void,
): {
  service: NachlaufService;
  metrics: IngestMetricsService;
  verarbeiteUplink: ReturnType<typeof vi.fn>;
} {
  const metrics = new IngestMetricsService();
  const verarbeiteUplink = vi.fn(() => {
    verhalten?.(metrics);
    return Promise.resolve();
  });
  const flow = { verarbeiteUplink } as unknown as IngestFlowService;
  return { service: new NachlaufService(flow, metrics), metrics, verarbeiteUplink };
}

describe('NachlaufService (ADR-0005 §21 D9 — herkunft=backfill als Betriebsweg)', () => {
  describe('Probelauf', () => {
    it('schreibt nichts — er sagt nur, ob die Datei taugt', async () => {
      const { service, verarbeiteUplink } = baue();

      const bilanz = await service.verarbeiteDatei(zeilenAus(envelopeZeile(), envelopeZeile()), false);

      expect(verarbeiteUplink).not.toHaveBeenCalled();
      expect(bilanz.modus).toBe('probelauf');
      expect(bilanz.zeilenGelesen).toBe(2);
      expect(bilanz.zeilenUnlesbar).toBe(0);
    });

    it('zählt unlesbare Zeilen und nennt ihre Nummern', async () => {
      // Die Zeilennummer ist der einzige Weg, die Stelle in einer Datei mit
      // zehntausend Zeilen wiederzufinden.
      const { service } = baue();

      const bilanz = await service.verarbeiteDatei(
        zeilenAus(envelopeZeile(), '{kaputt', envelopeZeile(), 'auch kaputt'),
        false,
      );

      expect(bilanz.zeilenUnlesbar).toBe(2);
      expect(bilanz.ersteUnlesbareZeilen).toEqual([2, 4]);
    });

    it('übergeht Leerzeilen, statt sie als Fehler zu zählen', async () => {
      const { service } = baue();

      const bilanz = await service.verarbeiteDatei(zeilenAus(envelopeZeile(), '', '   ', envelopeZeile()), false);

      expect(bilanz.zeilenLeer).toBe(2);
      expect(bilanz.zeilenUnlesbar).toBe(0);
    });

    it('deckelt die Liste der gemeldeten Zeilennummern — sie soll eine Liste bleiben, keine zweite Datei', async () => {
      const { service } = baue();
      const kaputte = Array.from({ length: 50 }, () => '{kaputt');

      const bilanz = await service.verarbeiteDatei(zeilenAus(...kaputte), false);

      expect(bilanz.zeilenUnlesbar).toBe(50);
      expect(bilanz.ersteUnlesbareZeilen).toHaveLength(20);
    });
  });

  describe('Ausführung', () => {
    it('schickt jede Zeile mit herkunft=backfill durch dieselbe Pipeline wie ein Live-Uplink', async () => {
      // Ein eigener Schreibpfad wäre die zweite Wahrheit, die irgendwann
      // abweicht — und `backfill` ist genau die Angabe, wegen der die
      // Plausibilitätsprüfung das Zeitfenster nur nach vorn anlegt.
      const { service, verarbeiteUplink } = baue();

      await service.verarbeiteDatei(zeilenAus(envelopeZeile()), true);

      expect(verarbeiteUplink).toHaveBeenCalledTimes(1);
      expect(verarbeiteUplink.mock.calls[0]?.[0]).toMatchObject({ herkunft: 'backfill' });
    });

    it('trägt die Zeilennummer in den Topic, aber NICHT den Dateinamen', async () => {
      // Der Dateiname ist frei gewählt und könnte einen Kundennamen tragen
      // (RL-2). Die Zeilennummer trägt keinen Personenbezug und ist der
      // einzige Hinweis, mit dem sich eine Quarantäne-Zeile wiederfinden lässt.
      const { service, verarbeiteUplink } = baue();

      await service.verarbeiteDatei(zeilenAus(envelopeZeile(), envelopeZeile()), true);

      expect(verarbeiteUplink.mock.calls[1]?.[0]).toMatchObject({ topicRedacted: 'nachlauf/zeile-2' });
    });

    it('bilanziert geschriebene Messwerte und Quarantäne getrennt je Grund', async () => {
      // „300 in Quarantäne" allein sagt nicht, ob ein Zähler unbekannt ist
      // oder die Werte unplausibel sind.
      let aufruf = 0;
      const { service } = baue((metrics) => {
        aufruf += 1;
        if (aufruf === 1) {
          metrics.messwertGeschrieben();
        } else {
          metrics.quarantaene('devEUI_unbekannt');
        }
      });

      const bilanz = await service.verarbeiteDatei(zeilenAus(envelopeZeile(), envelopeZeile()), true);

      expect(bilanz.messwerteGeschrieben).toBe(1);
      expect(bilanz.quarantaene).toBe(1);
      expect(bilanz.quarantaeneJeGrund.get('devEUI_unbekannt')).toBe(1);
    });

    it('zählt nur die Wirkung DIESES Laufs, nicht den Zählerstand des Prozesses', async () => {
      // Der Runner läuft in einem eigenen Prozess; die Zähler beginnen dort
      // bei null. Der Test hält trotzdem fest, dass die Bilanz eine DIFFERENZ
      // ist — sonst zeigte ein zweiter Lauf im selben Prozess zu viel an.
      const { metrics } = baue();
      metrics.messwertGeschrieben();
      metrics.messwertGeschrieben();

      const service = new NachlaufService(
        { verarbeiteUplink: () => Promise.resolve() } as unknown as IngestFlowService,
        metrics,
      );

      const bilanz = await service.verarbeiteDatei(zeilenAus(envelopeZeile()), true);

      expect(bilanz.messwerteGeschrieben).toBe(0);
    });

    it('überlässt einen Infrastrukturfehler dem Aufrufer, statt ihn zu verschlucken', async () => {
      // Die Pipeline behandelt Fachfehler selbst und wirft NUR bei einem
      // echten Infrastrukturfehler (§23). Ein Nachlauf, der über eine
      // verlorene DB-Verbindung hinwegliefe, meldete am Ende eine Bilanz,
      // die nichts bedeutet.
      const { service } = baue(() => {
        throw new Error('DB-Verbindung verloren');
      });

      await expect(service.verarbeiteDatei(zeilenAus(envelopeZeile()), true)).rejects.toThrow(
        /DB-Verbindung verloren/,
      );
    });
  });
});
