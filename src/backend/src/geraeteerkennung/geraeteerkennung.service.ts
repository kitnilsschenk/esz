import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { GeraeteerkennungRepository } from './persistence/geraeteerkennung.repository';
import { NachweisFoerderjahrRepository } from '../nachweis/persistence/nachweis-foerderjahr.repository';
import type {
  EntbehrlichkeitItem,
  Erkennungsmethode,
  GeraetegruppeItem,
  GruppenAnteil,
  ZuordnungItem,
  ZuordnungsQuote,
} from './geraeteerkennung.types';

/**
 * Die Sollquote je Projektjahr — [Q3] Kap. 5, wörtlich:
 * Jahr 1: 20 %, 2: 25 %, 3: 30 %, 4: 35 %, 5: 40 %.
 *
 * **Nicht kumulativ.** Das Merkblatt sagt es ausdrücklich: „in Jahr 5 sind
 * insgesamt nicht 100 sondern mindestens 40 Prozent des Energieverbrauchs
 * Geräten zuzuordnen." Wer die Quoten addiert, kommt auf 150 % und baut eine
 * Anforderung, die niemand erfüllen kann.
 *
 * Jenseits von Jahr 5 bleibt es bei 40: Das Merkblatt führt fünf Jahre; eine
 * Fortschreibung nach oben wäre erfunden.
 */
export function sollQuotePct(projektjahr: number): number {
  if (!Number.isInteger(projektjahr) || projektjahr < 1) {
    throw new BadRequestException(
      `Projektjahr ${String(projektjahr)} ist ungueltig — die Quote ist erst ab Jahr 1 definiert.`,
    );
  }
  return Math.min(20 + (projektjahr - 1) * 5, 40);
}

export interface ZuordnungAnlegenEingabe {
  readonly geraetegruppeId: string;
  readonly messkanalId: string;
  readonly methode: Erkennungsmethode;
  readonly genauigkeitPct?: number;
  readonly anteilProzent?: number;
  readonly gueltigVon: string;
}

/**
 * Identifikation von Geräte- und Anlagengruppen (TB-05, [Q3] Kap. 5).
 *
 * WAS DIE AUFLAGE VERLANGT
 * ------------------------
 * Ein Anteil des Gesamtenergieverbrauchs je Energieträger und Endkunde muss
 * Geräte- oder Anlagengruppen zugeordnet werden können — 20 % im ersten
 * Projektjahr, ansteigend auf 40 % im fünften, **nicht kumulativ**. Anzugeben
 * ist ausserdem, **wie** zugeordnet wird (Direktmessung, Algorithmus,
 * Vorschaltgerät, sonstige) und **mit welcher Genauigkeit**.
 *
 * DIE QUOTE IST EINE RECHNUNG, KEINE WERTUNG
 * ------------------------------------------
 * Dieser Dienst rechnet aus, welcher Anteil zugeordnet IST. Ob die Auflage
 * damit erfüllt ist, entscheidet er nicht — dafür gibt es die
 * Entbehrlichkeits-Feststellung aus Kap. 5 („Systeme, die nur ein Gerät
 * umfassen"), und die steht **neben** der Zahl statt in ihr. Eine Quote, die
 * sich durch ein Häkchen von 12 % auf „erfüllt" hebt, wäre genau die Zahl,
 * der niemand mehr trauen kann.
 *
 * WORAUF DIE QUOTE RECHNET
 * ------------------------
 * Auf `measurement.messwert_tag`, dem Stufe-B-Bestand — demselben, auf dem
 * der Nachweis rechnet (DE-02/TB-09 verlangen Tagesgranularität). Das hat
 * eine Voraussetzung, die benannt gehört: **Die Verdichtung muss für den
 * Zeitraum gelaufen sein.** Liegen keine Tageswerte vor, ist die Quote nicht
 * „0 %", sondern unbekannt — und die Antwort sagt das (`ohneTageswerte`).
 * Eine 0 wäre hier die gefährlichere Antwort: Sie sieht aus wie ein Ergebnis.
 */
@Injectable()
export class GeraeteerkennungService {
  constructor(
    private readonly repository: GeraeteerkennungRepository,
    private readonly foerderjahrRepository: NachweisFoerderjahrRepository,
  ) {}

  async findeGruppen(endkundeId: string): Promise<GeraetegruppeItem[]> {
    return this.repository.findGruppen(endkundeId);
  }

  async findeZuordnungen(endkundeId: string): Promise<ZuordnungItem[]> {
    return this.repository.findZuordnungen(endkundeId);
  }

  @Transactional(Propagation.Nested)
  async legeGruppeAn(input: {
    readonly endkundeId: string;
    readonly bezeichnung: string;
    readonly beschreibung?: string;
  }): Promise<GeraetegruppeItem> {
    const id = randomUUID();
    await this.repository.insertGruppe({
      id,
      endkundeId: input.endkundeId,
      bezeichnung: input.bezeichnung,
      beschreibung: input.beschreibung,
    });

    const gruppen = await this.repository.findGruppen(input.endkundeId);
    const angelegt = gruppen.find((gruppe) => gruppe.id === id);
    if (angelegt === undefined) {
      throw new Error('Geraetegruppe wurde geschrieben, ist aber nicht lesbar — unerwarteter DB-Zustand.');
    }
    return angelegt;
  }

  /**
   * Ordnet einen Messkanal einer Gruppe zu.
   *
   * Die beiden Angaben, die das Merkblatt ausdrücklich verlangt — Methode und
   * Genauigkeit —, werden hier geprüft, obwohl die Datenbank sie ebenfalls
   * erzwingt (V0056). Nicht als Redundanz: Ein Constraint-Name ist keine
   * Auskunft für jemanden, der ein Formular ausfüllt.
   */
  @Transactional(Propagation.Nested)
  async legeZuordnungAn(eingabe: ZuordnungAnlegenEingabe): Promise<ZuordnungItem> {
    if (eingabe.methode !== 'direktmessung' && eingabe.genauigkeitPct === undefined) {
      throw new BadRequestException(
        'Fuer eine Zuordnung, die nicht direkt gemessen wird, ist die erwartete Genauigkeit anzugeben ' +
          '(Technisches Merkblatt Kap. 5). Bei einer Direktmessung ist sie die des Messgeraets und steht ' +
          'am Zaehler.',
      );
    }

    // Der Exclusion-Constraint schlaegt IN der Transaktion zu. Ohne den
    // Savepoint aus `Propagation.Nested` (ADR-0002 §18) waere danach die
    // GESAMTE Request-Transaktion abgebrochen — auch der Audit-Schreibpfad
    // des Interceptors — und aus dem 409 wuerde ein 500 („current
    // transaction is aborted"). Genau so ist es im Integrationstest passiert.
    try {
      await this.repository.insertZuordnung({
        geraetegruppeId: eingabe.geraetegruppeId,
        messkanalId: eingabe.messkanalId,
        methode: eingabe.methode,
        genauigkeitPct: eingabe.genauigkeitPct,
        anteilProzent: eingabe.anteilProzent ?? 100,
        gueltigVon: eingabe.gueltigVon,
      });
    } catch (error: unknown) {
      // Der Exclusion-Constraint aus V0056: Ein Kanal gehoert zu einem
      // Zeitpunkt hoechstens EINER Gruppe. Waere es anders, ginge sein
      // Verbrauch doppelt in den Zaehler der Quote.
      if (this.istUeberlappung(error)) {
        throw new ConflictException(
          'Dieser Messkanal ist im angegebenen Zeitraum bereits einer Geraetegruppe zugeordnet. Ein Kanal ' +
            'kann zu einem Zeitpunkt nur zu EINER Gruppe gehoeren — sonst zaehlte sein Verbrauch doppelt. ' +
            'Beenden Sie zuerst die bestehende Zuordnung.',
        );
      }
      throw error instanceof Error ? error : new Error('Unbekannter Fehler beim Anlegen der Zuordnung.');
    }

    const zuordnungen = await this.repository.findZuordnungen(await this.endkundeZurGruppe(eingabe.geraetegruppeId));
    const angelegt = zuordnungen.find(
      (zuordnung) =>
        zuordnung.geraetegruppeId === eingabe.geraetegruppeId &&
        zuordnung.messkanalId === eingabe.messkanalId &&
        zuordnung.gueltigVon === eingabe.gueltigVon,
    );
    if (angelegt === undefined) {
      throw new Error('Zuordnung wurde geschrieben, ist aber nicht lesbar — unerwarteter DB-Zustand.');
    }
    return angelegt;
  }

  /**
   * Beendet eine Zuordnung — mit Grund.
   *
   * Der Grund ist Pflicht, weil der Vorgang die Quote SENKT. Von den beiden
   * Richtungen ist die senkende die, die später erklärt werden muss.
   */
  @Transactional(Propagation.Nested)
  async beendeZuordnung(input: {
    readonly geraetegruppeId: string;
    readonly messkanalId: string;
    readonly gueltigBis: string;
    readonly grund: string;
  }): Promise<ZuordnungItem> {
    const erfolgreich = await this.repository.beendeZuordnung(input);
    if (!erfolgreich) {
      throw new NotFoundException(
        'Zu diesem Messkanal besteht in dieser Gruppe keine wirksame Zuordnung. Eine bereits beendete wird ' +
          'nicht erneut beendet — sonst verschoebe sich der Zeitpunkt, ab dem ihr Verbrauch nicht mehr zaehlt.',
      );
    }

    const endkundeId = await this.endkundeZurGruppe(input.geraetegruppeId);
    const zuordnungen = await this.repository.findZuordnungen(endkundeId);
    const beendet = zuordnungen.find(
      (zuordnung) =>
        zuordnung.geraetegruppeId === input.geraetegruppeId &&
        zuordnung.messkanalId === input.messkanalId &&
        zuordnung.gueltigBis === input.gueltigBis,
    );
    if (beendet === undefined) {
      throw new Error('Zuordnung wurde beendet, ist aber nicht lesbar — unerwarteter DB-Zustand.');
    }
    return beendet;
  }

  /** Der aktuelle Stand der Entbehrlichkeits-Feststellung eines Systems. */
  async findeEntbehrlichkeit(systemId: string): Promise<EntbehrlichkeitItem> {
    const stand = await this.repository.findEntbehrlich(systemId);
    if (stand === null) {
      throw new NotFoundException(`System ${systemId} existiert nicht.`);
    }
    return { systemId, entbehrlich: stand.entbehrlich, grund: stand.grund };
  }

  /** Vermerkt die Entbehrlichkeit nach Kap. 5 — mit Pflicht-Begründung. */
  @Transactional(Propagation.Nested)
  async vermerkeEntbehrlich(systemId: string, entbehrlich: boolean, grund?: string): Promise<void> {
    if (entbehrlich && (grund === undefined || grund.trim() === '')) {
      throw new BadRequestException(
        'Fuer die Feststellung „Geraeteerkennung nicht sinnvoll" ist eine Begruendung anzugeben. ' +
          '„Pauschal erfuellt" ohne Begruendung ist gegenueber der Bewilligungsbehoerde keine Feststellung, ' +
          'sondern eine Behauptung.',
      );
    }

    const gefunden = await this.repository.setzeEntbehrlich(systemId, entbehrlich, grund);
    if (!gefunden) {
      throw new NotFoundException(`System ${systemId} existiert nicht.`);
    }
  }

  /** Die Zuordnungsquote eines Endkunden für ein Förderjahr. */
  async quote(input: {
    readonly endkundeId: string;
    readonly energietraeger: string;
    readonly foerderjahrId: string;
  }): Promise<ZuordnungsQuote> {
    const foerderjahr = await this.foerderjahrRepository.findById(input.foerderjahrId);
    if (foerderjahr === undefined) {
      throw new NotFoundException(`Foerderjahr ${input.foerderjahrId} existiert nicht.`);
    }

    // `bisMonat` ist der LETZTE Monat des Foerderjahres (einschliesslich) —
    // das Fenster der Tageswerte endet also am Ersten des Folgemonats.
    const vonTag = foerderjahr.vonMonat;
    const bisTag = this.monatDanach(foerderjahr.bisMonat);

    const [summen, jeGruppe, systeme] = await Promise.all([
      this.repository.summiereVerbrauch(input.endkundeId, input.energietraeger, vonTag, bisTag),
      this.repository.summiereJeGruppe(input.endkundeId, input.energietraeger, vonTag, bisTag),
      this.repository.zaehleSysteme(input.endkundeId),
    ]);

    const ohneTageswerte = summen.tageMitWerten === 0;
    // Eine Quote ohne Nenner ist keine 0, sondern unbekannt. Eine 0 sieht aus
    // wie ein Ergebnis und wird als eines gelesen.
    const quotePct =
      ohneTageswerte || summen.gesamtKwh <= 0
        ? null
        : Math.round((summen.zugeordnetKwh / summen.gesamtKwh) * 10000) / 100;

    const soll = sollQuotePct(foerderjahr.nummer);
    const gruppen: GruppenAnteil[] = jeGruppe.map((gruppe) => ({
      geraetegruppeId: gruppe.geraetegruppeId,
      bezeichnung: gruppe.bezeichnung,
      zugeordnetKwh: Math.round(gruppe.kwh * 1000) / 1000,
      anteilPct:
        summen.gesamtKwh <= 0 ? 0 : Math.round((gruppe.kwh / summen.gesamtKwh) * 10000) / 100,
    }));

    return {
      foerderjahrCode: foerderjahr.code,
      foerderjahrNummer: foerderjahr.nummer,
      vonMonat: foerderjahr.vonMonat,
      bisMonat: foerderjahr.bisMonat,
      endkundeId: input.endkundeId,
      energietraeger: input.energietraeger,
      gesamtKwh: Math.round(summen.gesamtKwh * 1000) / 1000,
      zugeordnetKwh: Math.round(summen.zugeordnetKwh * 1000) / 1000,
      quotePct,
      sollQuotePct: soll,
      erreicht: quotePct === null ? null : quotePct >= soll,
      gruppen,
      systemeGesamt: systeme.gesamt,
      systemeEntbehrlich: systeme.entbehrlich,
      alleSystemeEntbehrlich: systeme.gesamt > 0 && systeme.gesamt === systeme.entbehrlich,
      ohneTageswerte,
    };
  }

  private monatDanach(monatIso: string): string {
    const [jahr, monat] = monatIso.split('-');
    const datum = new Date(Date.UTC(Number(jahr), Number(monat), 1));
    return `${String(datum.getUTCFullYear())}-${String(datum.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }

  private async endkundeZurGruppe(geraetegruppeId: string): Promise<string> {
    const gruppen = await this.repository.findGruppeById(geraetegruppeId);
    if (gruppen === undefined) {
      throw new NotFoundException(`Geraetegruppe ${geraetegruppeId} existiert nicht.`);
    }
    return gruppen.endkundeId;
  }

  private istUeberlappung(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }
    const kandidat = error as { code?: unknown; constraint?: unknown };
    return kandidat.code === '23P01' && kandidat.constraint === 'ex_geraetegruppe_kanal_ein_kanal_eine_gruppe';
  }
}
