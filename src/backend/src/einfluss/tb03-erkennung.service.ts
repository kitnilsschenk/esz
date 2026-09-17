import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { SyntheticOnlyConfigService } from '../stammdaten/synthetic/synthetic-only.config';
import { Tb03BezugRepository } from './persistence/tb03-bezug.repository';
import { Tb03EinflussRepository } from './persistence/tb03-einfluss.repository';
import { Tb03BefundRepository } from './persistence/tb03-befund.repository';
import { erkenneTb03 } from './domain/tb03-erkennung';
import type { Tb03Befundkandidat, Tb03SkipGrund } from './domain/tb03-erkennung';

/**
 * Der TB-03-Schwellwert-Erkennungslauf (Projektdokumentation Teil II, E-9 —
 * ERKENNUNGS-Hälfte).
 *
 * Er stellt fest, ob sich eine Einflussgröße gegenüber dem Stand am Ende des
 * Baseline-Erhebungszeitraums so verändert hat, dass das Merkblatt Technik
 * eine Anzeige an die Bewilligungsbehörde verlangt — und schreibt das
 * Ergebnis als `einfluss.befund`.
 *
 * WAS ER AUSDRÜCKLICH NICHT TUT (ADR-0006:54, A15): Er erzeugt keinen
 * Vorgang, setzt keine Frist und rührt `anzeige_status` nicht an. Ein Befund
 * ist die Datengrundlage für eine Anzeige, nicht die Anzeige. Wer aus einem
 * Befund eine Frist ableiten will, braucht dafür den Anzeige-Workflow — den
 * gibt es noch nicht, und diese Klasse tut nicht so, als gäbe es ihn.
 *
 * WARUM EIN LAUF UND KEIN HAKEN AM SCHREIBPFAD: Die TB-03-Regeln haben eine
 * Mindestdauer („über ein halbes Jahr", „ab sechs Monaten"). Ein offenes
 * Intervall überschreitet sie, ohne dass irgendjemand etwas schreibt — ein
 * Hook am Erfassen sähe genau die Fälle nie, auf die es ankommt.
 */

export type Tb03LaufModus = 'probelauf' | 'ausgefuehrt';

export interface Tb03LaufErgebnis {
  readonly modus: Tb03LaufModus;
  readonly laufMonat: string;
  readonly gepruefteSysteme: number;
  readonly kandidaten: number;
  readonly geschrieben: number;
  readonly bereitsVorhanden: number;
  /** A18 — Systeme gesperrter, geschredderter oder gelöschter Endkunden. */
  readonly uebersprungenNichtAktiv: number;
  /** A16 — Systeme ohne Baseline-Periode: kein Anker, kein Befund. */
  readonly uebersprungenOhneAnker: number;
  /** A25 — Katalog-Größen ohne Schwellwert: NICHT MASCHINELL ÜBERWACHT. */
  readonly nichtUeberwachteGroessen: readonly string[];
  /** Fachliche Aussetzer je System/Größe (fehlender Ausgangswert o. ä.). */
  readonly skips: readonly { readonly systemId: string; readonly groesseCode: string; readonly grund: Tb03SkipGrund }[];
}

function monatsErster(zeitpunkt: Date): string {
  return new Date(Date.UTC(zeitpunkt.getUTCFullYear(), zeitpunkt.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

@Injectable()
export class Tb03ErkennungService {
  constructor(
    private readonly bezugRepository: Tb03BezugRepository,
    private readonly einflussRepository: Tb03EinflussRepository,
    private readonly befundRepository: Tb03BefundRepository,
    private readonly syntheticOnlyConfig: SyntheticOnlyConfigService,
  ) {}

  /** Zählt und meldet, schreibt aber nichts — der Standardfall (A24). */
  async probelauf(): Promise<Tb03LaufErgebnis> {
    return this.lauf(false);
  }

  async fuehreAus(): Promise<Tb03LaufErgebnis> {
    return this.lauf(true);
  }

  /**
   * `@Transactional()` klammert AUSSCHLIESSLICH die `energy`-Lesungen auf der
   * App-Verbindung. Die Befunde und ihre Audit-Ereignisse laufen über die
   * Erkennungs-Verbindung und tragen ihre eigene, dort geöffnete Transaktion
   * (`Tb03BefundRepository`) — eine Transaktion kann nicht über zwei
   * Verbindungen reichen, und A19(b) verlangt Befund und Ereignis gemeinsam,
   * nicht Befund und Stammdatenlesung.
   */
  @Transactional()
  private async lauf(schreiben: boolean): Promise<Tb03LaufErgebnis> {
    const laufMonat = monatsErster(new Date());

    const { bezuege, ohneAnker } = await this.bezugRepository.ladeSystemBezuege();
    const uebersprungenNichtAktiv = await this.bezugRepository.zaehleSystemeNichtAktiverEndkunden();
    const { regeln, uebersprungen: nichtUeberwachteGroessen } = await this.einflussRepository.ladeRegeln();

    const systemIds = bezuege.map((b) => b.systemId);
    const ankerJeSystem = new Map(bezuege.map((b) => [b.systemId, b.ankerMonat]));

    // A19(a) — EIN Einsicht-Ereignis je Lauf, VOR der Auswertung und
    // unabhängig von ihrem Ergebnis. Auch im Probelauf: Er liest denselben
    // Klartext. Auch bei null gelesenen Sätzen: Dass nichts zu lesen war,
    // ist selbst eine protokollwürdige Aussage über den Lauf.
    const anzahlSaetze = await this.einflussRepository.zaehleGeleseneSaetze(
      systemIds,
      regeln.map((r) => r.groesseCode),
    );
    await this.befundRepository.protokolliereEinsicht(anzahlSaetze, this.syntheticOnlyConfig.syntheticOnly);

    const kandidatenJeSystem = new Map<string, Tb03Befundkandidat[]>();
    const skips: { systemId: string; groesseCode: string; grund: Tb03SkipGrund }[] = [];

    for (const regel of regeln) {
      const jeSystem = await this.einflussRepository.ladeIntervalle(systemIds, regel.groesseCode);

      for (const eintrag of jeSystem) {
        const ankerMonat = ankerJeSystem.get(eintrag.systemId);
        if (ankerMonat === undefined) {
          continue;
        }

        const ergebnis = erkenneTb03({
          regel,
          ankerMonat,
          intervalle: eintrag.intervalle,
          laufMonat,
        });

        if (ergebnis.skipGrund !== undefined) {
          skips.push({ systemId: eintrag.systemId, groesseCode: regel.groesseCode, grund: ergebnis.skipGrund });
        }

        if (ergebnis.kandidaten.length > 0) {
          const liste = kandidatenJeSystem.get(eintrag.systemId) ?? [];
          liste.push(...ergebnis.kandidaten);
          kandidatenJeSystem.set(eintrag.systemId, liste);
        }
      }
    }

    const kandidaten = [...kandidatenJeSystem.values()].reduce((summe, liste) => summe + liste.length, 0);

    if (!schreiben) {
      return {
        modus: 'probelauf',
        laufMonat,
        gepruefteSysteme: systemIds.length,
        kandidaten,
        geschrieben: 0,
        bereitsVorhanden: 0,
        uebersprungenNichtAktiv,
        uebersprungenOhneAnker: ohneAnker.length,
        nichtUeberwachteGroessen,
        skips,
      };
    }

    let geschrieben = 0;
    let bereitsVorhanden = 0;

    for (const [systemId, liste] of kandidatenJeSystem) {
      const ergebnis = await this.befundRepository.schreibeBefunde(
        systemId,
        liste,
        this.syntheticOnlyConfig.syntheticOnly,
      );
      geschrieben += ergebnis.geschrieben;
      bereitsVorhanden += ergebnis.bereitsVorhanden;
    }

    return {
      modus: 'ausgefuehrt',
      laufMonat,
      gepruefteSysteme: systemIds.length,
      kandidaten,
      geschrieben,
      bereitsVorhanden,
      uebersprungenNichtAktiv,
      uebersprungenOhneAnker: ohneAnker.length,
      nichtUeberwachteGroessen,
      skips,
    };
  }
}
