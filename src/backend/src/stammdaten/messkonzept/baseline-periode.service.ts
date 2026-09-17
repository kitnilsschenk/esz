import { Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { AuditService } from '../../audit/audit.service';
import type { SecurityContext } from '../../common/security/security-context';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { EnergyBaselinePeriodeRepository } from '../persistence/energy/energy-baseline-periode.repository';
import type { BaselinePeriodeEingabe } from '../persistence/energy/energy-baseline-periode.repository';
import { nichtGefunden, ungueltigeEingabe } from '../common/problem.util';

/** Ein Kalendertag als ISO `YYYY-MM-DD` → Millisekunden seit Epoche (UTC-Mitternacht). */
function tagAlsZahl(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

const MS_PRO_TAG = 24 * 60 * 60 * 1000;

/**
 * Ab wann die Länge einer Periode auffällt.
 *
 * GTZ_base ist der ARITHMETISCHE Mittelwert der Gradtagzahl-Summen je
 * Periode — nicht der auf ein Jahr normierte. Eine Halbjahres-Periode
 * schleppt deshalb eine halbe Jahressumme in den Mittelwert und zieht ihn
 * nach unten; die ausgewiesene Einsparung steigt entsprechend. Der Rechenweg
 * gleicht das NICHT aus.
 *
 * Deshalb ein Hinweis und keine Ablehnung: Ein unterjähriger
 * Abrechnungszeitraum (Einzug, Versorgerwechsel) ist ein echter Fall, den
 * jemand erfassen können muss. Er soll ihn nur nicht unbemerkt erfassen.
 */
const JAHR_TAGE = 365;
const LAENGE_TOLERANZ_TAGE = 40;

/** Eine Periode, wie die Route sie ausgibt. */
export interface BaselinePeriodeAnsicht {
  readonly id: string;
  readonly von: string;
  /** AUSSCHLIESSLICH. */
  readonly bis: string;
  /** Wie viele Kalendertage die Periode umfasst. */
  readonly tage: number;
  /**
   * Der letzte Tag, der noch DAZUGEHÖRT (`bis` minus ein Tag).
   *
   * Steht mit in der Antwort, weil `bis` ausschließlich ist und genau dieser
   * Unterschied sich sonst erst in der Einsparzahl zeigt.
   */
  readonly letzterTag: string;
  /** `true`, wenn die Länge deutlich von einem Jahr abweicht — s. `LAENGE_TOLERANZ_TAGE`. */
  readonly laengeAuffaellig: boolean;
  readonly menge: number | null;
  readonly einheit: string | null;
}

export interface BaselinePeriodenAntwort {
  readonly mvetId: string;
  readonly energietraeger: string;
  readonly perioden: readonly BaselinePeriodeAnsicht[];
  /** Die Baseline, gegen die diese Perioden belegen sollen. */
  readonly baselineWert: number | null;
  readonly baselineEinheit: string | null;
  /** TB-02 (V0065): die an der mvet DEKLARIERTE Zahl der Jahresabrechnungen. */
  readonly abrechnungenAnzahlDeklariert: number | null;
  /**
   * `true`, wenn die deklarierte Zahl nicht zur Zahl der erfassten Perioden
   * passt. Beides beschreibt dieselben Abrechnungen — weichen sie ab, ist
   * eine der beiden Angaben falsch.
   */
  readonly anzahlWeichtAb: boolean;
  /**
   * `true`, wenn GTZ_base aus diesen Perioden hergeleitet werden kann.
   *
   * Ist es `false`, weist der Berechnungslauf mit
   * `GTZ_BASE_NICHT_ERMITTELBAR` ab — es sei denn, jemand setzt einen
   * `gtzBaseOverride` oder rechnet mit Grundlastanteil 1 (keine
   * Witterungsbereinigung).
   */
  readonly gtzBaseErmittelbar: boolean;
  /**
   * Mittelwert der erfassten Mengen — aber NUR, wenn alle Perioden eine Menge
   * in derselben Einheit tragen wie die Baseline. Sonst `null`.
   *
   * Der Zweck ist der Abgleich: TB-02 verlangt den Mittelwert der letzten
   * Jahresabrechnungen als Baseline. Steht hier eine andere Zahl als in
   * `baselineWert`, stimmt eines von beiden nicht.
   */
  readonly mengeMittel: number | null;
}

/**
 * Die Baseline-Bezugszeiträume eines Messkonzept-Energieträgers.
 *
 * **Warum das eine eigene Bedienhandlung ist.** Aus diesen Zeiträumen bildet
 * der Berechnungslauf GTZ_base als Mittelwert der Gradtagzahl-Summen je
 * Periode — den Nenner der Witterungsbereinigung. Bis hierher waren sie nur
 * per SQL zu setzen; wer das nicht konnte, musste GTZ_base über
 * `gtzBaseOverride` von Hand angeben. Eine geratene Gradtagzahl macht jede
 * Einsparzahl falsch, ohne dass irgendwo ein Fehler erscheint.
 *
 * Der Dienst nimmt die Perioden deshalb nicht nur entgegen, sondern rechnet
 * zurück, was sie bedeuten: Tage je Periode, letzter enthaltener Tag,
 * Abweichung von der TB-02-Deklaration, Mittelwert der Mengen gegen die
 * Baseline. Das sind genau die Größen, an denen eine Fehleingabe auffällt,
 * solange sie noch billig zu korrigieren ist.
 */
@Injectable()
export class BaselinePeriodeService {
  constructor(
    private readonly repository: EnergyBaselinePeriodeRepository,
    private readonly auditService: AuditService,
  ) {}

  @Transactional(Propagation.Required)
  async lesen(mvetId: string): Promise<BaselinePeriodenAntwort> {
    const kopf = await this.repository.findeKopf(mvetId);
    if (kopf === undefined) {
      throw nichtGefunden('Messkonzept-Version-Energietraeger');
    }

    const zeilen = await this.repository.listeFuerMvet(mvetId);
    const perioden = zeilen.map((zeile) => {
      const tage = Math.round((tagAlsZahl(zeile.bis) - tagAlsZahl(zeile.von)) / MS_PRO_TAG);
      return {
        id: zeile.id,
        von: zeile.von,
        bis: zeile.bis,
        tage,
        letzterTag: new Date(tagAlsZahl(zeile.bis) - MS_PRO_TAG).toISOString().slice(0, 10),
        laengeAuffaellig: Math.abs(tage - JAHR_TAGE) > LAENGE_TOLERANZ_TAGE,
        menge: zeile.menge,
        einheit: zeile.einheit,
      };
    });

    return {
      mvetId,
      energietraeger: kopf.energietraeger,
      perioden,
      baselineWert: kopf.baselineWert,
      baselineEinheit: kopf.baselineEinheit,
      abrechnungenAnzahlDeklariert: kopf.abrechnungenAnzahl,
      anzahlWeichtAb: kopf.abrechnungenAnzahl !== null && kopf.abrechnungenAnzahl !== perioden.length,
      gtzBaseErmittelbar: perioden.length > 0,
      mengeMittel: mengeMittelwert(perioden, kopf.baselineEinheit),
    };
  }

  /**
   * Setzt die Perioden auf genau diese Menge.
   *
   * Abgewiesen wird, was GTZ_base nachweislich verfälschen würde:
   * `bis <= von` (die Tabelle prüft es auch, aber als 500 statt als erklärter
   * Fehler) und ÜBERSCHNEIDUNGEN. Überschneidende Zeiträume zählen die Tage
   * im Überlappungsbereich doppelt in den Mittelwert — und zwei
   * Jahresabrechnungen desselben Versorgers überschneiden sich nicht, so ein
   * Eintrag ist immer ein Fehler.
   *
   * NICHT abgewiesen wird eine ungewöhnliche Länge: Ein unterjähriger
   * Abrechnungszeitraum ist ein echter Fall. Er wird über
   * `laengeAuffaellig` ausgewiesen.
   */
  @Transactional(Propagation.Required)
  async setzen(
    mvetId: string,
    eingaben: readonly BaselinePeriodeEingabe[],
    subject: SecurityContext,
    synthetic: boolean,
  ): Promise<BaselinePeriodenAntwort> {
    const kopf = await this.repository.findeKopf(mvetId);
    if (kopf === undefined) {
      throw nichtGefunden('Messkonzept-Version-Energietraeger');
    }

    for (const [index, periode] of eingaben.entries()) {
      if (tagAlsZahl(periode.bis) <= tagAlsZahl(periode.von)) {
        throw ungueltigeEingabe(
          `Periode ${String(index + 1)}: 'bis' muss NACH 'von' liegen. 'bis' ist ausschliesslich — ` +
            'eine Abrechnung ueber das Kalenderjahr 2023 wird als von=2023-01-01, bis=2024-01-01 erfasst.',
        );
      }
    }

    // Auf einer Kopie sortieren — die Reihenfolge des Aufrufers bleibt
    // unangetastet, und benachbarte Zeitraeume genuegen fuer den Test.
    const sortiert = [...eingaben].sort((a, b) => tagAlsZahl(a.von) - tagAlsZahl(b.von));
    for (let i = 1; i < sortiert.length; i += 1) {
      const vorige = sortiert[i - 1];
      const aktuelle = sortiert[i];
      if (vorige === undefined || aktuelle === undefined) {
        continue;
      }
      if (tagAlsZahl(aktuelle.von) < tagAlsZahl(vorige.bis)) {
        throw ungueltigeEingabe(
          `Die Zeitraeume ${vorige.von}–${vorige.bis} und ${aktuelle.von}–${aktuelle.bis} ueberschneiden sich. ` +
            'GTZ_base ist der Mittelwert ueber die Perioden — ueberschneidende Tage zaehlen doppelt. ' +
            "Beachten Sie, dass 'bis' ausschliesslich ist: Ein Folgezeitraum beginnt AM Tag des vorigen 'bis'.",
        );
      }
    }

    const vorher = await this.repository.setze(mvetId, eingaben);
    const antwort = await this.lesen(mvetId);

    // Das Ereignis wird HIER emittiert und nicht ueber `@AuditAction`: Der
    // Eintrag traegt die Anzahl VORHER, und die steht nicht in der Antwort
    // (dieselbe Linie wie bei der Systemgrenze und beim Portal-Zugang).
    await this.auditService.append({
      eventTyp: STAMMDATEN_EVENT_CODES.MESSKONZEPT_BASELINE_PERIODE_ERFASST,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: mvetId,
      kontext: {
        synthetic,
        energietraeger: antwort.energietraeger,
        perioden_anzahl: antwort.perioden.length,
        vorher_anzahl: vorher,
      },
    });

    return antwort;
  }
}

/**
 * Mittelwert der Mengen — nur wenn ALLE Perioden eine Menge tragen und alle
 * dieselbe Einheit wie die Baseline führen.
 *
 * Sonst `null`: Ein Mittelwert über drei von fünf Abrechnungen ist nicht die
 * Baseline, und ein Mittelwert über m³ und kWh ist gar nichts. Lieber keine
 * Zahl als eine, der jemand glaubt.
 */
function mengeMittelwert(
  perioden: readonly BaselinePeriodeAnsicht[],
  baselineEinheit: string | null,
): number | null {
  if (perioden.length === 0 || baselineEinheit === null) {
    return null;
  }
  const mengen: number[] = [];
  for (const periode of perioden) {
    if (periode.menge === null || periode.einheit !== baselineEinheit) {
      return null;
    }
    mengen.push(periode.menge);
  }
  return mengen.reduce((summe, wert) => summe + wert, 0) / mengen.length;
}
