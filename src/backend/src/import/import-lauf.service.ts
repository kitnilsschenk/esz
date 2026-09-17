import { Logger } from '@nestjs/common';
import { Propagation, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import type { SecurityContext } from '../common/security/security-context';
import type { EndkundeService } from '../stammdaten/endkunde/endkunde.service';
import type { SystemService } from '../stammdaten/system/system.service';
import type { ZaehlerService } from '../stammdaten/zaehler/zaehler.service';
import type { MesskanalService } from '../stammdaten/messkanal/messkanal.service';
import type { ImportStammdatenRepository } from './persistence/import-stammdaten.repository';
import type { ImportMesswertRepository, ImportQualitaet } from './persistence/import-messwert.repository';
import { QUALITAET_STANDARD } from './persistence/import-messwert.repository';
import type { ImportMessgroesse, Messmappe } from './messreihe/messreihe.types';

export interface ImportDienste {
  readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>;
  readonly endkunde: EndkundeService;
  readonly system: SystemService;
  readonly zaehler: ZaehlerService;
  readonly messkanal: MesskanalService;
  readonly stammdaten: ImportStammdatenRepository;
  readonly messwerte: ImportMesswertRepository;
}

export interface ImportOptionen {
  /**
   * Der Bestandsschlüssel — Präfix aller Systembezeichnungen dieses Imports
   * (z. B. `Pilotbestand A`). Er entscheidet, ob ein zweiter Lauf denselben
   * Bestand trifft oder einen neuen anlegt.
   */
  readonly kennung: string;
  /** An diesen Endkunden hängen. Fehlt er, wird der Bestand über die Kennung gesucht und sonst angelegt. */
  readonly endkundeId?: string;
  /** Zeitzone, in der ein Tageswert seinen Kalendertag hat. */
  readonly zeitzone: string;
  /**
   * Wie die Werte einzustufen sind. Default `geschaetzt`.
   *
   * Keine Formalie: Die Abdeckung eines Monats zählt ausschließlich GEMESSENE
   * Tage; ein als `geschaetzt` importiertes Jahr hat damit 0 % Abdeckung und
   * ist `nicht_ausweisbar`. Wer Ablesungen aus einem Altsystem übernimmt,
   * setzt hier `gemessen` — wer eine gerechnete Reihe übernimmt, lässt es.
   */
  readonly qualitaet?: ImportQualitaet;
  /** Ohne dies wird nur gelesen und geprüft. */
  readonly ausfuehren: boolean;
}

export interface ImportKanalBilanz {
  readonly system: string;
  readonly messgroesse: ImportMessgroesse;
  readonly tage: number;
  readonly vonTag: string;
  readonly bisTag: string;
  readonly summeKwh: number;
  /** Werte, die im Zeitraum schon auf dem Kanal lagen — im Probelauf die wichtigste Zahl. */
  readonly vorhanden: number;
  readonly geschrieben: number;
  readonly neuAngelegt: boolean;
}

export interface ImportBilanz {
  readonly modus: 'probelauf' | 'ausfuehrung';
  readonly qualitaet: ImportQualitaet;
  readonly endkundeId: string | undefined;
  readonly endkundeNeu: boolean;
  readonly kanaele: readonly ImportKanalBilanz[];
  readonly tageGesamt: number;
  readonly geschriebenGesamt: number;
}

/** Messgröße -> Energieträger des Zählers, der sie misst. */
const ENERGIETRAEGER: Readonly<Record<ImportMessgroesse, 'strom' | 'waerme'>> = {
  wirkarbeit: 'strom',
  thermische_energie: 'waerme',
};

/**
 * Der Gerätetyp importierter Zähler.
 *
 * Bewusst sprechend und bewusst KEIN echter Typ aus dem Dekoder-Katalog: An
 * diesem Zähler hängt kein Gerät, das je einen Uplink schickt. Wer den
 * Bestand später ansieht, soll auf den ersten Blick erkennen, dass die Werte
 * aus einer Übernahme stammen und nicht aus einer Messstrecke.
 */
const GERAETETYP_IMPORT = 'import-messreihe';

/**
 * Übernimmt Messreihen-Mappen in den Bestand — Stammdaten und Tageswerte.
 *
 * **Probelauf ist der Standard.** Ohne `ausfuehren` wird gelesen, geprüft und
 * bilanziert, aber nichts geschrieben. Die Zahl, wegen der man ihn macht,
 * ist `vorhanden`: Sie sagt, ob auf einem Kanal schon Werte liegen — und
 * damit, ob dieser Lauf etwas ergänzt oder etwas wiederholt. Dieselbe Linie
 * wie beim Nachlauf und beim Retention-Runner.
 *
 * **Wiederholung ist unschädlich.** Systeme, Zähler und Kanäle werden über
 * ihren fachlichen Schlüssel gesucht, bevor sie angelegt werden; die
 * Messwerte selbst sind über `ON CONFLICT` idempotent. Ein zweiter Lauf über
 * dieselben Dateien ändert nichts — der Regelfall bei einem Import, den
 * jemand zur Sicherheit noch einmal startet.
 *
 * **Was der Import NICHT tut.** Er legt kein Messkonzept an, keine Baseline
 * und kein Förderjahr. Das sind fachliche Festlegungen mit Nachweiswirkung
 * (TB-01, TB-02) — sie gehören einem Menschen in die Hand, nicht einem
 * Ladewerkzeug. Der Import stellt die Messdaten bereit, auf denen sie dann
 * aufsetzen.
 */
export class ImportLaufService {
  private readonly logger = new Logger('Import');

  constructor(private readonly dienste: ImportDienste) {}

  /** Der Betriebs-Kontext, unter dem der Import schreibt. */
  private readonly subject: SecurityContext = {
    sub: 'import-messreihe',
    actorTyp: 'benutzer',
    roles: ['betrieb'],
    azp: 'edms-bff',
  };

  async importiere(mappen: readonly Messmappe[], optionen: ImportOptionen): Promise<ImportBilanz> {
    const kanaele: ImportKanalBilanz[] = [];
    let endkundeId = optionen.endkundeId;
    let endkundeNeu = false;

    if (endkundeId === undefined) {
      endkundeId = await this.inTransaktion(() =>
        this.dienste.stammdaten.findeEndkundeNachSystemPraefix(`${optionen.kennung} `),
      );
      if (endkundeId !== undefined) {
        this.logger.log(`Bestand '${optionen.kennung}' gehoert zu Endkunde ${endkundeId} — daran wird angehaengt.`);
      }
    }

    if (endkundeId === undefined && optionen.ausfuehren) {
      endkundeId = await this.legeEndkundeAn(optionen.kennung);
      endkundeNeu = true;
    }

    for (const mappe of mappen) {
      const bezeichnung = this.systemBezeichnung(optionen.kennung, mappe.anlage);
      const istUntermessung = mappe.anlage !== undefined;

      for (const messgroesse of this.messgroessenDer(mappe)) {
        const werte = this.werteDer(mappe, messgroesse);
        if (werte.length === 0) {
          continue;
        }

        const vonTag = werte[0]?.tag ?? '';
        const bisTag = werte.at(-1)?.tag ?? '';
        const summeKwh = werte.reduce((s, w) => s + w.kwh, 0);

        if (!optionen.ausfuehren) {
          // Im Probelauf kann der Kanal noch fehlen — dann gibt es auch
          // nichts, was schon dalaege.
          const vorhandenerKanal = await this.inTransaktion(async () => {
            const system = await this.dienste.stammdaten.findeSystemNachBezeichnung(bezeichnung);
            if (system === undefined) {
              return undefined;
            }
            const zaehlerId = await this.dienste.stammdaten.findeZaehler(system.id, ENERGIETRAEGER[messgroesse]);
            return zaehlerId === undefined
              ? undefined
              : await this.dienste.stammdaten.findeMesskanal(zaehlerId, messgroesse);
          });

          kanaele.push({
            system: bezeichnung,
            messgroesse,
            tage: werte.length,
            vonTag,
            bisTag,
            summeKwh,
            vorhanden:
              vorhandenerKanal === undefined
                ? 0
                : await this.dienste.messwerte.zaehleVorhandene(
                    vorhandenerKanal.kanalKey,
                    vonTag,
                    bisTag,
                    optionen.zeitzone,
                  ),
            geschrieben: 0,
            neuAngelegt: vorhandenerKanal === undefined,
          });
          continue;
        }

        if (endkundeId === undefined) {
          throw new Error('Kein Endkunde bestimmt — der Import kann nicht ausgefuehrt werden.');
        }

        const kanal = await this.stelleKanalBereit(endkundeId, bezeichnung, messgroesse, istUntermessung);
        const vorhanden = await this.dienste.messwerte.zaehleVorhandene(
          kanal.kanalKey,
          vonTag,
          bisTag,
          optionen.zeitzone,
        );
        const geschrieben = await this.dienste.messwerte.schreibe(
          kanal.kanalKey,
          optionen.zeitzone,
          werte,
          optionen.qualitaet ?? QUALITAET_STANDARD,
        );

        kanaele.push({
          system: bezeichnung,
          messgroesse,
          tage: werte.length,
          vonTag,
          bisTag,
          summeKwh,
          vorhanden,
          geschrieben,
          neuAngelegt: kanal.neuAngelegt,
        });
      }
    }

    return {
      modus: optionen.ausfuehren ? 'ausfuehrung' : 'probelauf',
      qualitaet: optionen.qualitaet ?? QUALITAET_STANDARD,
      endkundeId,
      endkundeNeu,
      kanaele,
      tageGesamt: kanaele.reduce((s, k) => s + k.tage, 0),
      geschriebenGesamt: kanaele.reduce((s, k) => s + k.geschrieben, 0),
    };
  }

  /**
   * Die Bezeichnung, unter der eine Mappe im Bestand steht.
   *
   * Sie ist zugleich der Wiedererkennungsschlüssel des Imports (s.
   * `ImportStammdatenRepository`) — deshalb steht die Kennung vorn und wird
   * nicht etwa hinten angehängt.
   */
  private systemBezeichnung(kennung: string, anlage: string | undefined): string {
    return `${kennung} — ${anlage ?? 'Hauptzaehler'}`;
  }

  private messgroessenDer(mappe: Messmappe): readonly ImportMessgroesse[] {
    const gesehen = new Set<ImportMessgroesse>();
    for (const blatt of mappe.blaetter) {
      for (const reihe of blatt.reihen) {
        gesehen.add(reihe.messgroesse);
      }
    }
    return [...gesehen];
  }

  /** Alle Tageswerte einer Messgröße über alle Förderjahre, aufsteigend. */
  private werteDer(mappe: Messmappe, messgroesse: ImportMessgroesse): readonly { tag: string; kwh: number }[] {
    return mappe.blaetter
      .flatMap((blatt) => blatt.reihen.filter((r) => r.messgroesse === messgroesse).flatMap((r) => r.werte))
      .sort((a, b) => a.tag.localeCompare(b.tag));
  }

  private async legeEndkundeAn(kennung: string): Promise<string> {
    const angelegt = await this.inTransaktion(() =>
      this.dienste.endkunde.anlegen(
        {
          stammdatenPii: {
            name: kennung,
            // Der Import kennt keine Anschrift — die Mappen führen keine, und
            // eine erfundene waere schlimmer als eine fehlende. Der Betrieb
            // ergaenzt sie in der Oberflaeche.
            anschrift: 'Aus Messreihen-Import uebernommen, Anschrift nachzutragen',
          },
        },
        this.subject,
      ),
    );
    this.logger.log(`Endkunde ${angelegt.id} fuer '${kennung}' angelegt.`);
    return angelegt.id;
  }

  /**
   * Sucht System, Zähler und Kanal — und legt an, was fehlt.
   *
   * Jede Ebene wird einzeln geprüft: Ein Bestand, bei dem das System schon
   * steht und nur der Wärmezähler fehlt, ist der Normalfall beim zweiten
   * Import einer Liegenschaft.
   */
  private async stelleKanalBereit(
    endkundeId: string,
    bezeichnung: string,
    messgroesse: ImportMessgroesse,
    istUntermessung: boolean,
  ): Promise<{ readonly kanalKey: number; readonly neuAngelegt: boolean }> {
    return this.inTransaktion(async () => {
      const vorhandenesSystem = await this.dienste.stammdaten.findeSystemNachBezeichnung(bezeichnung);
      const systemId =
        vorhandenesSystem?.id ??
        (
          await this.dienste.system.anlegen({
            endkundeId,
            bezeichnung,
            systemgrenze: bezeichnung,
            systembeschreibung:
              'Aus einer Messreihen-Mappe uebernommen (Tageswerte). Die Werte sind als geschaetzt ' +
              'eingestuft und tragen die Herkunft import_altsystem.',
          })
        ).id;

      const energietraeger = ENERGIETRAEGER[messgroesse];
      const zaehlerId =
        (await this.dienste.stammdaten.findeZaehler(systemId, energietraeger)) ??
        (
          await this.dienste.zaehler.anlegen({
            systemId,
            geraetetyp: GERAETETYP_IMPORT,
            energietraeger,
          })
        ).id;

      const vorhandenerKanal = await this.dienste.stammdaten.findeMesskanal(zaehlerId, messgroesse);
      if (vorhandenerKanal !== undefined) {
        if (vorhandenerKanal.art !== 'intervall_verbrauch') {
          // Tageswerte in einen kumulativen Kanal zu schreiben hiesse, dass
          // die Verdichtung sie als Zaehlerstaende differenziert — der
          // Verbrauch waere danach die Differenz zweier Tagesverbraeuche.
          throw new Error(
            `Messkanal ${vorhandenerKanal.id} ist als '${vorhandenerKanal.art}' angelegt, der Import liefert ` +
              'aber Tagesverbraeuche (intervall_verbrauch). Ein Import in diesen Kanal wuerde die Werte verfaelschen.',
          );
        }
        return { kanalKey: vorhandenerKanal.kanalKey, neuAngelegt: false };
      }

      const kanal = await this.dienste.messkanal.anlegen(zaehlerId, {
        messgroesse,
        einheit: 'kWh',
        art: 'intervall_verbrauch',
        istUntermessung,
      });
      return { kanalKey: await this.dienste.stammdaten.kanalKey(kanal.id), neuAngelegt: true };
    });
  }

  private inTransaktion<T>(fn: () => Promise<T>): Promise<T> {
    return this.dienste.txHost.withTransaction(Propagation.Required, fn);
  }
}
