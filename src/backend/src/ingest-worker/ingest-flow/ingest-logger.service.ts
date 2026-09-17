import { Injectable, Logger } from '@nestjs/common';
import type { IngestReasonCode } from './reason-code';

/**
 * ADR-0005 §22 (D10) — Feld-Whitelist analog `SecurityLoggerService`
 * (`common/logging/security-logger.service.ts`, dieselbe bewusste
 * Abweichung von der `backend-nestjs.md`-"pino-redact"-Formulierung: ein
 * minimaler eigener Structured-Logger statt einer neuen `pino`-Dependency —
 * funktional aequivalent fuer den hier benoetigten Umfang).
 *
 * Log-Zeilen zu einem Uplink enthalten AUSSCHLIESSLICH: `messkanalKey`
 * (Pseudonym-Surrogat), `zaehlerId` (Pseudonym-UUID), Dead-Letter-`grund`,
 * Zeitstempel — NIEMALS `wert` oder DevEUI (weder Klartext noch
 * Blind-Index, §22: "auch der Blind-Index bleibt ausserhalb normaler Logs").
 *
 * Ausnahme `consentVerworfen()` (ADR-0012 E5/Stufe C, Auflage C-5): TRAEGT
 * bewusst auch KEIN Pseudonym-Surrogat — s. dortiger Kommentar.
 */
@Injectable()
export class IngestLoggerService {
  private readonly logger = new Logger('IngestFlow');

  quarantaene = (input: {
    readonly grund: IngestReasonCode;
    readonly zaehlerId?: string;
    readonly messkanalKey?: number;
  }): void => {
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      grund: input.grund,
      ...(input.zaehlerId !== undefined ? { zaehlerId: input.zaehlerId } : {}),
      ...(input.messkanalKey !== undefined ? { messkanalKey: input.messkanalKey } : {}),
    };
    this.logger.warn(JSON.stringify(entry));
  };

  /**
   * ADR-0011 D4 — der Herkunfts-Widerspruch bekommt eine EIGENE Zeile neben
   * der allgemeinen `quarantaene()`-Zeile. Grund: Der Reason-Code allein sagt
   * nur DASS es einen Widerspruch gab; brauchbar wird er erst mit den beiden
   * Endkunden-Kennungen, die auseinanderlaufen. Ohne sie muesste ein
   * Betriebsmensch die Zuordnungstabelle und die Zaehler-Kette von Hand
   * nebeneinanderlegen, um ueberhaupt zu sehen, worin der Widerspruch besteht.
   *
   * Beide Kennungen sind EDMS-interne Pseudonym-UUIDs aus `energy.*` — dem
   * seit V0002 PII-freien Namensraum (rote Linie 1). Die ChirpStack-Kennung
   * steht bewusst NICHT hier: Sie landet ohnehin an der Quarantaene-Zeile
   * (V0041), und der Log braucht sie nicht doppelt.
   */
  herkunftWiderspruch = (input: {
    readonly zaehlerId: string;
    readonly erwarteterEndkundeId: string;
    readonly tatsaechlicherEndkundeId: string;
  }): void => {
    this.logger.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        ereignis: 'herkunft_widerspruechlich',
        zaehlerId: input.zaehlerId,
        erwarteterEndkundeId: input.erwarteterEndkundeId,
        tatsaechlicherEndkundeId: input.tatsaechlicherEndkundeId,
      }),
    );
  };

  /**
   * PE-7 (Phase-5-Performance-Review) — `debug`-Level (NICHT `log`/`info`):
   * diese Methode wird bei JEDEM erfolgreich geschriebenen Messwert
   * synchron aufgerufen (Hot Path, M3-Hochdurchsatz-Ziel). Ein `log`-Level-
   * Eintrag pro Messwert waere in Produktion bei hohem Durchsatz sowohl ein
   * spuerbarer Overhead (Serialisierung + Sink-I/O je Messwert) als auch
   * Log-Rauschen ohne Diagnosewert im Normalbetrieb — der `debug`-Level
   * bleibt fuer gezielte Fehlersuche verfuegbar (aktivierbar ueber die
   * Log-Level-Konfiguration), ohne den Normalbetrieb zu belasten. Fehler-/
   * Quarantaene-Logging (`quarantaene()` oben) bleibt UNVERAENDERT auf
   * `warn` — das sind seltene, diagnoserelevante Ereignisse.
   */
  messwertGeschrieben = (input: { readonly messkanalKey: number; readonly geschrieben: boolean }): void => {
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      messkanalKey: input.messkanalKey,
      geschrieben: input.geschrieben,
    };
    this.logger.debug(JSON.stringify(entry));
  };

  /**
   * ADR-0012 E5/Stufe C (A12-13/A12-14) — der Verwurf mangels
   * Rechtsgrundlage. BEWUSST kein DB-Schreibpfad (anders als
   * `quarantaene()`, das zusaetzlich `ingest.eingang_quarantaene` befuellt):
   * eine Zeile mit offener Loeschfrist wuerde die Wirkung eines Widerrufs
   * umkehren.
   *
   * **SUBJEKTFREI, AUCH OHNE `zaehlerId` (Auflage C-5, `compliance-director`-
   * Votum).** Die urspruengliche Fassung trug `zaehlerId` auf `warn` — ein
   * Widerspruch in sich: Sie vermied eine DB-Zeile mit offener Loeschfrist
   * und ersetzte sie durch einen subjektkorrelierten Log-Datensatz mit GAR
   * KEINER definierten Loeschfrist, in einer Senke (zentrales Log-
   * Aggregat/SIEM), die typischerweise laenger und breiter aufbewahrt wird
   * als eine einzelne Anwendungstabelle. Diese Klasse kann keine begrenzte,
   * dokumentierte Log-Aufbewahrung zusichern (das ist eine
   * Infrastruktur-/`devops-lead`-Entscheidung, kein Code-Artefakt) — deshalb
   * die restriktivere der beiden vom Votum angebotenen Optionen: KEIN
   * Korrelat, auch nicht auf `debug`. Der Metrik-Zaehler
   * (`IngestMetricsService.consentVerworfen()`) bleibt die Quelle fuer "wie
   * oft", diese Zeile bleibt die Quelle fuer "dass ueberhaupt" — beides ohne
   * ein Subjekt zu benennen.
   */
  consentVerworfen = (): void => {
    this.logger.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        ereignis: 'consent_rechtsgrundlage_fehlt',
      }),
    );
  };

  infraFehler = (kontext: string, error: unknown): void => {
    this.logger.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        kontext,
        fehler: error instanceof Error ? error.message : 'unbekannter Fehler',
      }),
    );
  };
}
