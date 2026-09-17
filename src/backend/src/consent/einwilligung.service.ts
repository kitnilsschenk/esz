import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { IdentityEndkundePiiRepository } from '../stammdaten/persistence/identity/identity-endkunde-pii.repository';
import { IdentityAnschlussnutzerPiiRepository } from '../stammdaten/persistence/identity/identity-anschlussnutzer-pii.repository';
import { ConsentRepository } from './persistence/consent.repository';
import { pruefeErfassungsweg, pruefeErklaerungszeitpunkt } from './erklaerung.policy';
import type {
  EinwilligungItem,
  EinwilligungWiderrufItem,
  Erfassungsweg,
  SubjektConsentStand,
  SubjektTyp,
  SubjektZweckStand,
  TextVersionItem,
  WiderrufWirkung,
  ZweckItem,
} from './consent.types';

export interface EinwilligungErteilenInput {
  readonly subjektTyp: SubjektTyp;
  readonly subjektId: string;
  readonly zweckCode: string;
  // KEINE `rechtsgrundlage` mehr (A12-1): Sie wird aus der Matrix BESTIMMT.
  // Eine Rechtsgrundlage, die ein Sachbearbeiter aus einem Dropdown waehlt,
  // ist von der falschen Stelle gewaehlt.
  readonly erfassungsweg: Erfassungsweg;
  /**
   * Zeitpunkt der ERKLAERUNG (A12-27). Pflicht — nicht `now()`: Eine im Maerz
   * unterschriebene, im September erfasste Einwilligung wuerde sonst den
   * falschen Tag belegen und den Zeitraum dazwischen als ohne
   * Rechtsgrundlage verarbeitet erscheinen lassen.
   */
  readonly erteiltAt: string;
  /** Fundstelle des Dokuments (A12-28). Pflicht auf allen nicht-digitalen Wegen. */
  readonly quelleRef: string;
}

export interface EinwilligungWiderrufenInput {
  /**
   * Zeitpunkt, zu dem der Widerruf ERKLAERT wurde (A12-27/A12-29). Hier
   * wiegt der Fehler schwerer als bei der Erteilung: Ein am 1. brieflich
   * erklaerter, am 20. erfasster Widerruf liesse sonst neunzehn Tage
   * rechtswidriger Verarbeitung rechtmaessig aussehen — zulasten der
   * betroffenen Person.
   */
  readonly widerrufenAt: string;
  readonly erfassungsweg: Erfassungsweg;
  readonly quelleRef: string;
}

export interface TextVersionVeroeffentlichenInput {
  readonly zweckCode: string;
  readonly fassung: string;
  readonly wortlaut: string;
}

const PG_UNIQUE_VERLETZUNG = '23505';
const PG_EXCLUDE_VERLETZUNG = '23P01';
const PG_CHECK_VERLETZUNG = '23514';

/**
 * Die beiden Grenzen aus V0046: Eine Erklaerung darf nicht NACH ihrer eigenen
 * Erfassung im System liegen (`erteilt_at <= created_at`,
 * `widerrufen_at <= updated_at`).
 *
 * **Warum das eine eigene Uebersetzung braucht und nicht die Node-seitige
 * Pruefung genuegt.** `pruefeErklaerungszeitpunkt` vergleicht gegen
 * `Date.now()` im Node-Prozess; die Constraint vergleicht gegen `now()` in
 * Postgres — und das ist die TRANSAKTIONS-Startzeit, also ein FRUEHERER
 * Zeitpunkt. Zwischen beiden liegt das Fenster von Transaktionsbeginn bis zur
 * Pruefung: wenige Millisekunden, unter Last mehr. Ein Zeitpunkt in diesem
 * Fenster passiert den Service und zerschellt an der Datenbank — und ohne
 * diese Uebersetzung als rohes 500, das dem Aufrufer nichts sagt.
 */
const ERKLAERUNG_NACH_ERFASSUNG = new Set([
  'ck_einwilligung_erteilt_nicht_nach_erfassung',
  'ck_einwilligung_widerruf_nicht_nach_erfassung',
]);

export function alsErklaerungNachErfassung(
  pg: { readonly code?: string; readonly constraint?: string } | undefined,
  feld: string,
): BadRequestException | undefined {
  if (pg?.code !== PG_CHECK_VERLETZUNG || pg.constraint === undefined) {
    return undefined;
  }
  if (!ERKLAERUNG_NACH_ERFASSUNG.has(pg.constraint)) {
    return undefined;
  }
  return new BadRequestException(
    `${feld} liegt nach der eigenen Erfassung im System. Erfasst wird eine BEREITS abgegebene ` +
      'Erklaerung — geben Sie den Zeitpunkt an, zu dem sie erklaert wurde, nicht den des Erfassens. ' +
      'Ein Zeitpunkt aus der letzten Sekunde kann daran ebenfalls scheitern.',
  );
}

interface PostgresFehler {
  readonly code?: string;
  readonly constraint?: string;
}

function alsPostgresFehler(error: unknown): PostgresFehler | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const kandidat = error as { code?: unknown; constraint?: unknown };
  if (typeof kandidat.code !== 'string') {
    return undefined;
  }
  return {
    code: kandidat.code,
    ...(typeof kandidat.constraint === 'string' ? { constraint: kandidat.constraint } : {}),
  };
}

/**
 * Einwilligungsverwaltung (ADR-0012 B1).
 *
 * **Was dieser Service NICHT tut: irgendetwas durchsetzen.** Er verwaltet
 * Einwilligungen und macht ihren Stand abfragbar. Die WIRKUNG auf den
 * Schreibpfad — kein Ingest ohne Einwilligung — ist ADR-0012 E5/Stufe C und
 * ausdrücklich nicht freigegeben. Wer diesen Service liest und erwartet,
 * dass hier schon etwas blockiert wird, irrt.
 */
@Injectable()
export class EinwilligungService {
  private readonly logger = new Logger(EinwilligungService.name);

  constructor(
    private readonly repository: ConsentRepository,
    private readonly endkundePiiRepository: IdentityEndkundePiiRepository,
    private readonly anschlussnutzerPiiRepository: IdentityAnschlussnutzerPiiRepository,
  ) {}

  @Transactional(Propagation.Nested)
  async zwecke(): Promise<readonly ZweckItem[]> {
    return this.repository.findZwecke();
  }

  @Transactional(Propagation.Nested)
  async textVersionen(zweckCode?: string): Promise<readonly TextVersionItem[]> {
    return this.repository.findTextVersionen(zweckCode);
  }

  /**
   * Veröffentlicht eine neue Fassung und schließt die bisherige GENAU an
   * diesem Zeitpunkt — zwei Zeitscheiben ohne Lücke, ohne Overlap. Ohne das
   * Schließen schlüge die EXCLUDE-Constraint aus V0044 zu.
   */
  @Transactional(Propagation.Nested)
  async veroeffentlicheTextVersion(input: TextVersionVeroeffentlichenInput): Promise<TextVersionItem> {
    const zwecke = await this.repository.findZwecke();
    if (!zwecke.some((zweck) => zweck.code === input.zweckCode)) {
      throw new BadRequestException(`Unbekannter Zweck: ${input.zweckCode}`);
    }

    const jetzt = new Date();
    await this.repository.schliesseOffeneTextVersion(input.zweckCode, jetzt);

    try {
      return await this.repository.insertTextVersion({
        id: randomUUID(),
        zweckCode: input.zweckCode,
        fassung: input.fassung,
        wortlaut: input.wortlaut,
        // Der Hash wird HIER gebildet, nicht vom Aufrufer entgegengenommen:
        // Ein mitgelieferter Hash wäre eine Behauptung über den Text, keine
        // Prüfung desselben.
        wortlautSha256: createHash('sha256').update(input.wortlaut, 'utf8').digest(),
        gueltigAb: jetzt,
      });
    } catch (error: unknown) {
      const pg = alsPostgresFehler(error);
      if (pg?.code === PG_UNIQUE_VERLETZUNG && pg.constraint === 'ux_text_version_zweck_fassung') {
        throw new ConflictException(
          `Fuer den Zweck "${input.zweckCode}" existiert bereits eine Fassung "${input.fassung}". ` +
            'Fassungen sind unveraenderlich — waehlen Sie eine neue Nummer.',
        );
      }
      if (pg?.code === PG_EXCLUDE_VERLETZUNG) {
        throw new ConflictException(
          'Es gibt bereits eine Fassung mit ueberlappender Gueltigkeit fuer diesen Zweck.',
        );
      }
      throw error instanceof Error ? error : new Error('Unbekannter Fehler beim Veroeffentlichen der Fassung.');
    }
  }

  /**
   * Der Stand eines Subjekts über ALLE Zwecke — auch über die, zu denen nie
   * eingewilligt wurde. Genau das beantwortet eine Auskunft nach Art. 15
   * DSGVO: Eine Liste, die nur Erteiltes zeigt, sagt nichts über das
   * Nicht-Erteilte.
   */
  @Transactional(Propagation.Nested)
  async standFuerSubjekt(subjektTyp: SubjektTyp, subjektId: string): Promise<SubjektConsentStand> {
    const [zwecke, matrix, einwilligungen] = await Promise.all([
      this.repository.findZwecke(),
      this.repository.findMatrixFuerSubjektTyp(subjektTyp),
      this.repository.findEinwilligungenFuerSubjekt(subjektTyp, subjektId),
    ]);

    const zweckStaende: SubjektZweckStand[] = zwecke.flatMap((zweck) => {
      const regel = matrix.find((r) => r.zweckCode === zweck.code);
      if (regel === undefined) {
        // Ein Zweck ohne Matrix-Zeile fuer diese Subjektart ist fuer sie
        // schlicht nicht vorgesehen. Ihn ohne Rechtsgrundlage anzuzeigen
        // waere eine Einladung, ihn trotzdem zu erfassen.
        return [];
      }
      const verlauf = einwilligungen.filter((e) => e.zweckCode === zweck.code);
      return [
        {
          zweckCode: zweck.code,
          bezeichnung: zweck.bezeichnung,
          verweigerbar: regel.verweigerbar,
          rechtsgrundlage: regel.rechtsgrundlage,
          erlaubnismodus: regel.erlaubnismodus,
          begruendung: regel.begruendung,
          wirksameEinwilligung: verlauf.find((e) => e.wirksam) ?? null,
          verlauf,
        },
      ];
    });

    return { subjektTyp, subjektId, zwecke: zweckStaende };
  }

  @Transactional(Propagation.Nested)
  async erteile(input: EinwilligungErteilenInput): Promise<EinwilligungItem> {
    pruefeErfassungsweg(
      input.erfassungsweg,
      // s. `erklaerung.policy.ts` — die einzige hier verfuegbare IP waere die
      // des Mitarbeiters.
      'Ein digitales Opt-in kann ueber die Betriebssicht nicht erfasst werden: Die dabei zu ' +
        'protokollierende IP-Adresse waere die des Bearbeiters, nicht die der betroffenen Person — ' +
        'der Nachweis waere unrichtig. Erfassen Sie eine schriftlich erteilte Einwilligung als ' +
        '"vertrag_schriftlich".',
    );

    // A12-1: Die Rechtsgrundlage kommt aus der Matrix, nicht vom Aufrufer.
    const matrix = await this.repository.findMatrixFuerSubjektTyp(input.subjektTyp);
    const regel = matrix.find((r) => r.zweckCode === input.zweckCode);
    if (regel === undefined) {
      throw new BadRequestException(
        `Fuer "${input.zweckCode}" ist bei einem ${input.subjektTyp} keine Rechtsgrundlage hinterlegt. ` +
          'Dieser Zweck ist fuer diese Subjektart nicht vorgesehen.',
      );
    }

    if (regel.erlaubnismodus !== 'opt_in') {
      // Eine vertragliche oder Opt-out-Grundlage wird nicht ERKLAERT. Sie zu
      // erfassen hiesse, eine Einwilligung zu dokumentieren, die es nicht
      // gibt — und dem Betroffenen eine Widerrufbarkeit zuzuschreiben, die
      // ihm nicht zusteht (bei `vertraglich`) bzw. den Default umzukehren
      // (bei `opt_out`, TB-06).
      throw new BadRequestException(
        `"${regel.zweckCode}" beruht bei einem ${input.subjektTyp} nicht auf einer Einwilligung ` +
          `(${regel.erlaubnismodus}). ${regel.begruendung}`,
      );
    }

    const cryptoKeyId = await this.findeSubjektSchluessel(input.subjektTyp, input.subjektId);

    const jetzt = new Date();
    const erteiltAt = pruefeErklaerungszeitpunkt(input.erteiltAt, jetzt, 'erteiltAt');

    // Die Fassung wird zum ERKLAERUNGSZEITPUNKT gesucht, nicht zum
    // Erfassungszeitpunkt: Zugestimmt wurde dem Wortlaut, der damals galt.
    // Waere es anders, bekaeme eine nachgetragene Alt-Einwilligung
    // rueckwirkend eine Fassung untergeschoben, die es bei ihrer Erklaerung
    // noch gar nicht gab.
    const textVersion = await this.repository.findGueltigeTextVersion(input.zweckCode, erteiltAt);
    if (textVersion === undefined) {
      // Man kann nicht einer Erklaerung zustimmen, die es nicht gibt.
      throw new BadRequestException(
        `Fuer den Zweck "${input.zweckCode}" ist derzeit keine Einwilligungserklaerung veroeffentlicht. ` +
          'Veroeffentlichen Sie zuerst eine Fassung.',
      );
    }

    const einwilligungId = randomUUID();
    try {
      await this.repository.insertEinwilligung({
        id: einwilligungId,
        subjektTyp: input.subjektTyp,
        subjektId: input.subjektId,
        zweckCode: input.zweckCode,
        textVersionId: textVersion.id,
        rechtsgrundlage: regel.rechtsgrundlage,
        erteiltAt,
      });
    } catch (error: unknown) {
      const pg = alsPostgresFehler(error);
      const nachErfassung = alsErklaerungNachErfassung(pg, 'erteiltAt');
      if (nachErfassung !== undefined) {
        throw nachErfassung;
      }
      if (pg?.code === PG_UNIQUE_VERLETZUNG && pg.constraint?.startsWith('ux_einwilligung_wirksam')) {
        throw new ConflictException(
          `Zu diesem Zweck besteht bereits eine wirksame Einwilligung. Widerrufen Sie sie zuerst, ` +
            'wenn eine neue erfasst werden soll.',
        );
      }
      throw error instanceof Error ? error : new Error('Unbekannter Fehler beim Erfassen der Einwilligung.');
    }

    // Fachzeile und Beleg entstehen in DERSELBEN Transaktion (@Transactional):
    // eine Einwilligung ohne Nachweis waere nach Art. 7 Abs. 1 DSGVO wertlos.
    // Kein `ipEnc`: Auf diesem Weg gibt es keinen digitalen Vorgang, und die
    // DB-Constraint aus V0044 verbietet eine IP hier ausdruecklich.
    await this.repository.insertBeleg({
      id: randomUUID(),
      einwilligungId,
      cryptoKeyId,
      art: 'erteilung',
      erfassungsweg: input.erfassungsweg,
      erfasstAt: jetzt,
      quelleRef: input.quelleRef,
      ipEnc: undefined,
      userAgentEnc: undefined,
    });

    const erfasst = await this.repository.findEinwilligungById(einwilligungId);
    if (erfasst === undefined) {
      throw new Error('Einwilligung wurde geschrieben, ist aber nicht lesbar — unerwarteter DB-Zustand.');
    }
    return erfasst;
  }

  @Transactional(Propagation.Nested)
  async widerrufe(id: string, input: EinwilligungWiderrufenInput): Promise<EinwilligungWiderrufItem> {
    pruefeErfassungsweg(
      input.erfassungsweg,
      'Ein digital erklaerter Widerruf kann ueber die Betriebssicht nicht erfasst werden — dieselbe ' +
        'Begruendung wie beim Erteilen: Die dabei zu protokollierende IP-Adresse waere die des ' +
        'Bearbeiters, nicht die der betroffenen Person.',
    );

    const vorher = await this.repository.findEinwilligungById(id);
    if (vorher === undefined) {
      throw new NotFoundException(`Einwilligung ${id} existiert nicht.`);
    }

    if (vorher.rechtsgrundlage === 'vertrag_art6_1b') {
      // A12-3: Ein Widerruf auf einer vertraglichen Grundlage erzeugte ein
      // Pflichtereignis im append-only Audit-Log ueber einen Vorgang, den es
      // rechtlich nicht gibt. Das Ende einer vertraglichen Grundlage ist die
      // Vertragsbeendigung — ein eigener Vorgang, kein Widerruf.
      throw new ConflictException(
        'Diese Verarbeitung beruht auf einem Vertrag, nicht auf einer Einwilligung — sie kann nicht ' +
          'widerrufen werden. Beendet wird sie durch Beendigung des Vertragsverhaeltnisses.',
      );
    }

    const jetzt = new Date();
    const widerrufenAt = pruefeErklaerungszeitpunkt(input.widerrufenAt, jetzt, 'widerrufenAt');

    if (widerrufenAt.getTime() < Date.parse(vorher.erteiltAt)) {
      throw new BadRequestException(
        'Der Widerruf kann nicht vor der Erteilung liegen. Pruefen Sie das Datum der Widerrufserklaerung.',
      );
    }

    // Auflage C-10, Messung 1 von 2: der Stand VOR dem UPDATE. Sie muss hier
    // stehen und nicht spaeter — nach dem UPDATE ist der Vorzustand innerhalb
    // derselben Transaktion nicht mehr abfragbar.
    const ohneGrundlageVorher = await this.messeZaehlerOhneGrundlage(vorher.subjektTyp, vorher.subjektId);

    let widerrufen: boolean;
    try {
      widerrufen = await this.repository.widerrufeEinwilligung(id, widerrufenAt);
    } catch (error: unknown) {
      const nachErfassung = alsErklaerungNachErfassung(alsPostgresFehler(error), 'widerrufenAt');
      if (nachErfassung !== undefined) {
        throw nachErfassung;
      }
      throw error instanceof Error ? error : new Error('Unbekannter Fehler beim Widerruf.');
    }
    if (!widerrufen) {
      // Kein Fehler im engeren Sinn, aber auch kein Erfolg: Ein zweiter
      // Widerruf darf den Zeitpunkt des ersten NICHT ueberschreiben — sonst
      // verschoebe sich die Aussage, ab wann die Verarbeitung ohne
      // Grundlage lief.
      throw new ConflictException(
        `Diese Einwilligung wurde bereits am ${vorher.widerrufenAt ?? 'unbekannten Zeitpunkt'} widerrufen. ` +
          'Der urspruengliche Zeitpunkt bleibt unveraendert.',
      );
    }

    // Der Widerruf bekommt einen EIGENEN Beleg (A12-29). Bis hierher war die
    // Erteilung dreifach belegt (Fachzeile, Beleg, Audit) und der Widerruf
    // einfach, ohne Kanalangabe — Art. 7 Abs. 3 S. 4 verlangt, dass der
    // Widerruf so einfach sein muss wie die Erteilung; dann muss er auch so
    // belegt sein. Die Asymmetrie ging zulasten der Person.
    const cryptoKeyId = await this.findeSubjektSchluessel(vorher.subjektTyp, vorher.subjektId);
    await this.repository.insertBeleg({
      id: randomUUID(),
      einwilligungId: id,
      cryptoKeyId,
      art: 'widerruf',
      erfassungsweg: input.erfassungsweg,
      erfasstAt: jetzt,
      quelleRef: input.quelleRef,
      ipEnc: undefined,
      userAgentEnc: undefined,
    });

    const nachher = await this.repository.findEinwilligungById(id);
    if (nachher === undefined) {
      throw new Error('Einwilligung nach dem Widerruf nicht lesbar — unerwarteter DB-Zustand.');
    }

    // Auflage C-10, Messung 2 von 2. Beide Messungen liegen in DERSELBEN
    // Transaktion wie das UPDATE: nur so beschreibt die Differenz die Wirkung
    // dieses Widerrufs und nicht die irgendeiner gleichzeitigen Aenderung.
    const ohneGrundlageNachher = await this.messeZaehlerOhneGrundlage(vorher.subjektTyp, vorher.subjektId);

    const wirkung: WiderrufWirkung | null =
      ohneGrundlageVorher === null || ohneGrundlageNachher === null
        ? null
        : {
            // `Math.max(0, …)`: die Differenz kann theoretisch negativ werden,
            // wenn zwischen den beiden Messungen etwas ANDERES eine Grundlage
            // schafft (ein paralleler Vertragsabschluss). Eine negative Zahl
            // „gestoppter Zaehler" waere in einem Audit-Log Unsinn; die
            // Gesamtzahl daneben zeigt den Stand dann korrekt.
            zaehlerGestoppt: Math.max(0, ohneGrundlageNachher - ohneGrundlageVorher),
            zaehlerOhneGrundlage: ohneGrundlageNachher,
          };

    return { ...nachher, wirkung };
  }

  /**
   * Auflage C-10 — fragt das Ingest-Gate, wie viele Zaehler des Subjekts
   * ohne Rechtsgrundlage sind. `null` heisst „nicht messbar".
   *
   * Warum der Fehler geschluckt wird: Art. 7 Abs. 3 S. 1 verlangt, dass der
   * Widerruf so einfach ist wie die Erteilung. Ihn scheitern zu lassen, weil
   * das EXECUTE-Recht auf `consent.ingest_rechtsgrundlage_wirksam()` fehlt
   * (Installation vor V0089, zurueckgebaute Migration), waere die falsche
   * Ausfallrichtung: die betroffene Person verloere ihr Recht, damit die
   * Berichterstattung darueber vollstaendig bleibt. Der Widerruf gilt, die
   * Wirkungsangabe fehlt — und die Warnung sagt, warum.
   *
   * Bewusst breit gefangen: die Ursache ist hier nicht zu unterscheiden
   * (fehlendes Recht, fehlende Funktion, Timeout), und die Reaktion waere in
   * allen Faellen dieselbe.
   */
  private async messeZaehlerOhneGrundlage(subjektTyp: SubjektTyp, subjektId: string): Promise<number | null> {
    try {
      return await this.repository.zaehleZaehlerOhneRechtsgrundlage(subjektTyp, subjektId);
    } catch (error: unknown) {
      this.logger.warn(
        `Wirkung des Widerrufs nicht messbar (Auflage C-10) — der Widerruf selbst bleibt wirksam. Ursache: ${
          error instanceof Error ? error.message : 'unbekannt'
        }`,
      );
      return null;
    }
  }

  /**
   * Ein Erklaerungszeitpunkt darf in der Vergangenheit liegen — das ist der
   * Regelfall beim Nachtragen — aber NICHT in der Zukunft.
   *
   * Die Datenbank haelt dieselbe Grenze (V0046), und das ist Absicht: Der
   * CHECK ist der Garant, diese Pruefung liefert die verstaendliche Antwort.
   * Ein `23514`-Fehler waere fuer den Bediener keine Auskunft.
   */
  /**
   * Der Beleg wird mit dem Schlüssel DER BETROFFENEN PERSON verschlüsselt —
   * nicht mit einem eigenen. Nur so erfasst ein Krypto-Shred (ADR-0009)
   * sämtliche Belege dieser Person in einem Zug.
   *
   * Ohne PII-Satz gibt es keinen Schlüssel. Das ist kein Randfall, sondern
   * die richtige Reihenfolge: Wer im System keine Person ist, kann nicht
   * einwilligen.
   */
  private async findeSubjektSchluessel(subjektTyp: SubjektTyp, subjektId: string): Promise<string> {
    const pii =
      subjektTyp === 'endkunde'
        ? await this.endkundePiiRepository.findByPseudonymId(subjektId)
        : await this.anschlussnutzerPiiRepository.findByPseudonymId(subjektId);

    if (pii === undefined) {
      throw new NotFoundException(
        `Zu ${subjektTyp} ${subjektId} existiert kein Stammdatensatz. Eine Einwilligung braucht eine Person, ` +
          'zu der sie gehoert.',
      );
    }

    return pii.cryptoKeyId;
  }
}
