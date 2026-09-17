import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import {
  IngestBetriebRepository,
  type IngestQuarantaeneGrund,
} from '../persistence/ingest/ingest-betrieb.repository';
import { toSeite, type Seite } from '../common/seite.dto';
import type { IngestQuarantaeneItem, IngestQuelle, IngestStatus } from './ingest-betrieb.types';

/**
 * Ab wann ein Herzschlag als veraltet gilt: das Vierfache des
 * Worker-Takts (30 s). Ein einzelner verzögerter Schlag — Lastspitze,
 * kurzer Netzhänger — soll noch nicht als Ausfall gelten; zwei Minuten
 * Stille bei einem 30-Sekunden-Takt sind dagegen eindeutig.
 *
 * Der Wert steht hier und NICHT im Schema: Ein Schwellenwert in einem
 * DB-Constraint wäre ohne Migration nicht korrigierbar.
 */
export const HERZSCHLAG_VERALTET_MS = 120_000;

/**
 * Fenster des Verwurfszaehlers in Tagen (Auflage C-6).
 *
 * 14 Tage, weil die Betriebssicht eine ARBEITSSICHT ist und kein Archiv: Sie
 * soll zeigen, ob gerade etwas schiefgeht, und einen Wochenrhythmus samt
 * Vergleichswoche abdecken. Wer weiter zurueckschauen will, fragt die
 * Tabelle direkt — sie wird nicht geloescht (kein DELETE-Recht, V0085).
 *
 * OFFEN (R-0008, Behandlungsschritt): Ein SCHWELLWERT, ab dem automatisch
 * alarmiert wird, und der Empfaenger dieses Alarms sind NICHT festgelegt.
 * Diese Zahlen hier machen den Verwurf sichtbar — mehr nicht. Solange
 * niemand benannt ist, der hinsieht, bleibt die Kontrolle gebaut und
 * unwirksam; das ist eine betriebliche Entscheidung (devops-lead mit
 * compliance-director), keine technische.
 */
export const VERWURF_FENSTER_TAGE = 14;

/**
 * Betriebssicht auf die Messdaten-Aufnahme (ADR-0011 A2) — der Blick, den
 * jemand braucht, der gerade einen Zähler anschließt: kommt etwas an, und was
 * bleibt liegen?
 */
@Injectable()
export class IngestBetriebService {
  constructor(private readonly repository: IngestBetriebRepository) {}

  @Transactional()
  async status(): Promise<IngestStatus> {
    const [aktivitaet, gesamt, jeGrund, quellenZeilen, verwurfTage] = await Promise.all([
      this.repository.findAktivitaet(),
      this.repository.countQuarantaene(),
      this.repository.countQuarantaeneJeGrund(),
      this.repository.findQuellen(),
      this.repository.findVerwurfTage(VERWURF_FENSTER_TAGE),
    ]);

    const jetzt = Date.now();
    const quellen: IngestQuelle[] = quellenZeilen.map((zeile) => ({
      quelleCode: zeile.quelleCode,
      brokerHost: zeile.brokerHost,
      topic: zeile.topic,
      clientId: zeile.clientId,
      verbunden: zeile.verbunden,
      // BEIDE Bedingungen — s. `IngestQuelle`-Dok.
      lebendig: zeile.verbunden && jetzt - Date.parse(zeile.letzterHerzschlagAt) <= HERZSCHLAG_VERALTET_MS,
      letzteVerbindungAt: zeile.letzteVerbindungAt,
      letzterHerzschlagAt: zeile.letzterHerzschlagAt,
      gepflegt: zeile.gepflegt,
      gepflegtInaktiv: zeile.gepflegtInaktiv,
      abweichendeFelder: zeile.abweichendeFelder,
    }));

    return {
      quellen,
      letzterMesswertAt: aktivitaet.letzterMesswertAt,
      letzteSchreibungAt: aktivitaet.letzteSchreibungAt,
      letzteQuarantaeneAt: aktivitaet.letzteQuarantaeneAt,
      quarantaeneGesamt: gesamt,
      quarantaeneJeGrund: jeGrund,
      verwurfTage,
      // Summe als Zeichenkette wie die uebrigen Zaehler: Die Spalte ist
      // `bigint`, und eine Zahl, die in JavaScript stillschweigend ungenau
      // wird, ist in einem Nachweis-Kontext die falsche Sparsamkeit.
      verwurfSumme: verwurfTage
        .reduce((summe, tag) => summe + BigInt(tag.anzahl), 0n)
        .toString(),
    };
  }

  @Transactional()
  async quarantaene(options: {
    readonly grund?: IngestQuarantaeneGrund;
    readonly quelleCode?: string;
    readonly cursor?: string;
    readonly limit: number;
  }): Promise<Seite<IngestQuarantaeneItem>> {
    const { daten, naechsterCursor } = await this.repository.listQuarantaenePage(options);

    // `createdAt` trägt nur den Cursor und verlässt den Service nicht — die
    // fachlich richtige Zeitangabe ist `empfangenAt`.
    const items: IngestQuarantaeneItem[] = daten.map((zeile) => ({
      id: zeile.id,
      grund: zeile.grund,
      zaehlerId: zeile.zaehlerId,
      messkanalKey: zeile.messkanalKey,
      fPort: zeile.fPort,
      quelleCode: zeile.quelleCode,
      chirpstackTenantId: zeile.chirpstackTenantId,
      chirpstackApplicationId: zeile.chirpstackApplicationId,
      topicRedacted: zeile.topicRedacted,
      empfangenAt: zeile.empfangenAt,
      zaehlerMessgroessen: zeile.zaehlerMessgroessen,
    }));

    return toSeite(items, naechsterCursor, options.limit);
  }
}
