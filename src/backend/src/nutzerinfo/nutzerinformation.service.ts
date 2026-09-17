import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { NutzerinfoRepository } from './persistence/nutzerinfo.repository';
import { AnalyticsLaufLookupRepository } from '../nachweis/persistence/analytics-lauf-lookup.repository';
import { loeseBindungAuf } from '../nachweis/domain/bindung-resolver';
import { GeraeteerkennungRepository } from '../geraeteerkennung/persistence/geraeteerkennung.repository';
import type {
  BerichtGruppe,
  NutzerinfoBericht,
  NutzerinfoLaufErgebnis,
  NutzerinfoMonatsstand,
  NutzerinfoSammelZustellung,
  NutzerinformationItem,
  Zustellweg,
} from './nutzerinfo.types';
import { AuditService } from '../audit/audit.service';
import { NUTZERINFO_EVENT_CODES } from './audit/nutzerinfo-audit-events';
import type { SecurityContext } from '../common/security/security-context';

/**
 * Verarbeitungs-Status, in denen ein Endkunde informiert werden darf.
 *
 * `gesperrt` ist eine Einschränkung nach Art. 18 DSGVO: Die Daten dürfen
 * aufbewahrt, aber nicht mehr verarbeitet werden. Eine Nutzerinformation zu
 * erzeugen und zu versenden wäre eine Verarbeitung — der Kunde bekommt sie
 * deshalb nicht, und das ist kein Auflagenverstoß, sondern dessen Auflösung
 * zugunsten des stärkeren Rechts.
 */
const INFORMIERBARE_STATUS = new Set(['aktiv']);

const MONAT_FORM = /^\d{4}-\d{2}-01$/;

/** Der letzte ABGESCHLOSSENE Monat in `Europe/Berlin`, als Monatserster. */
function letzterAbgeschlossenerMonat(jetzt: Date): string {
  const [jahr, monat] = laufenderMonat(jetzt).split('-');
  const datum = new Date(Date.UTC(Number(jahr), Number(monat) - 2, 1));
  return `${String(datum.getUTCFullYear())}-${String(datum.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** Der laufende Monat in `Europe/Berlin`, als Monatserster. */
function laufenderMonat(jetzt: Date): string {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(jetzt);
  return `${iso.slice(0, 7)}-01`;
}

function runde(wert: number): number {
  return Math.round(wert * 1000) / 1000;
}

/**
 * Die monatliche Nutzerinformation (TB-06, [Q3] Technisches Merkblatt Kap. 6).
 *
 * WAS DAS MERKBLATT VERLANGT
 * --------------------------
 * „Ein Endkunde ist mindestens monatlich über seinen Verbrauch und seine
 * Energieeinsparungen zu informieren, wenn dies nicht vom Kunden explizit
 * anders gewünscht wird (sog. Opt-Out)."
 *
 * Das ist eine Förderauflage mit einer Frist, keine Komfortfunktion. Bis
 * heute existierte sie im System nirgends — der Consent-Zweck stand im
 * Katalog, das Opt-out war seit V0052 dokumentierbar, aber es gab keine
 * Information, der man hätte widersprechen können.
 *
 * DIE TRAGENDE ENTSCHEIDUNG: NICHTS WIRD NEU GERECHNET
 * ----------------------------------------------------
 * Die Zahlen kommen aus einem `analytics.berechnungslauf`, gewählt über
 * **dieselbe** Auflösung, die auch der BAFA-Nachweis verwendet
 * (`findKandidatenFuerMonat` + `loeseBindungAuf`): der jüngste, selbst nicht
 * ersetzte Lauf, dessen Periode den Monat enthält.
 *
 * Der Grund wiegt schwer: Sähe der Kunde eine andere Einsparung als die
 * Bewilligungsbehörde, wäre jede Erklärung dafür schlechter als der Fehler.
 * Deshalb steht die `berechnungslaufId` in jeder Zeile — sie sagt, WELCHE
 * Rechnung er gesehen hat.
 *
 * **Widersprüchliche Kandidaten werden nicht aufgelöst.** Gibt es zwei
 * nicht-ersetzte Läufe mit verschiedenen Werten, bekommt der Kunde nichts.
 * „Nimm den ersten" ist nach ADR-0006 D4 verboten, und eine willkürlich
 * gewählte Zahl in einer Kundenmitteilung ist schlimmer als eine fehlende.
 *
 * DAS VORZEICHEN BLEIBT STEHEN
 * ----------------------------
 * `deltaKwh` ist positiv bei Einsparung und **negativ bei Mehrverbrauch** —
 * ohne die Vorzeichen-/Lückenregel des Nachweises. Kap. 6 verlangt
 * ausdrücklich „Einsparungen und/oder Mehrverbräuche"; einen Mehrverbrauch
 * gegenüber dem Kunden auf null zu setzen wäre eine Beschönigung.
 *
 * WAS DIESER DIENST NICHT TUT
 * ---------------------------
 * Er **informiert nicht**, er erzeugt. Es gibt weder ein Nutzerportal noch
 * einen Versandweg; `zugestelltAt` bleibt leer, und solange es leer ist, ist
 * die Auflage NICHT erfüllt. Das ist bewusst sichtbar gehalten statt
 * kaschiert — der Erzeugungslauf zählt die Lücke selbst mit.
 *
 * Er liefert außerdem **keine Gerätegruppen-Verbräuche**, die Kap. 6
 * ebenfalls verlangt: Die Geräteerkennung ist nicht gebaut. Eine leere
 * Gruppenliste wäre eine Zusage, die niemand einlöst.
 */
@Injectable()
export class NutzerinformationService {
  constructor(
    private readonly repository: NutzerinfoRepository,
    private readonly laufLookupRepository: AnalyticsLaufLookupRepository,
    // TB-05 liefert die Aufteilung, die Kap. 6 fuer den Bericht verlangt.
    // Sie hier zweitzurechnen hiesse, dieselbe Zuordnung an zwei Stellen zu
    // definieren -- und die zweite waere die, die irgendwann abweicht.
    private readonly geraeteerkennungRepository: GeraeteerkennungRepository,
    // Die Sammelzustellung emittiert je Information ein Audit-Ereignis und
    // kann das nicht dem `@AuditAction`-Decorator ueberlassen: der schreibt
    // EINE Zeile je Anfrage.
    private readonly auditService: AuditService,
  ) {}

  /** Zählt, was ein Lauf täte — und schreibt nichts. */
  @Transactional(Propagation.Nested)
  async probelauf(monat: string, jetzt: Date = new Date()): Promise<NutzerinfoLaufErgebnis> {
    return this.lauf(monat, jetzt, false);
  }

  @Transactional(Propagation.Nested)
  async fuehreAus(monat: string, jetzt: Date = new Date()): Promise<NutzerinfoLaufErgebnis> {
    return this.lauf(monat, jetzt, true);
  }

  /**
   * Der Stand eines Monats — „Ist der Monat durch?".
   *
   * Ohne Angabe wird der letzte ABGESCHLOSSENE Monat ausgewertet, und zwar
   * serverseitig: Welcher Monat gerade zaehlt, haengt an der Zeitzone und
   * soll nicht in jeder Oberflaeche neu ausgerechnet werden. Der ausgewertete
   * Monat steht deshalb in der Antwort — eine Zahl ohne ihren Monat ist keine
   * Auskunft.
   */
  async monatsstand(monat?: string, jetzt: Date = new Date()): Promise<NutzerinfoMonatsstand> {
    const ausgewertet = monat ?? letzterAbgeschlossenerMonat(jetzt);
    if (!MONAT_FORM.test(ausgewertet)) {
      throw new BadRequestException('monat muss ein Monatserster in der Form YYYY-MM-01 sein.');
    }

    const stand = await this.repository.zaehleMonatsstand(ausgewertet);
    return {
      monat: ausgewertet,
      anzahlErzeugt: stand.erzeugt,
      anzahlZugestellt: stand.zugestellt,
      anzahlOffen: stand.erzeugt - stand.zugestellt,
    };
  }

  async findeFuerEndkunde(endkundeId: string, limit: number): Promise<NutzerinformationItem[]> {
    return this.repository.findFuerEndkunde(endkundeId, limit);
  }

  async findeById(id: string): Promise<NutzerinformationItem> {
    const gefunden = await this.repository.findById(id);
    if (gefunden === undefined) {
      throw new NotFoundException(`Nutzerinformation ${id} existiert nicht.`);
    }
    return gefunden;
  }

  /**
   * Der Bericht zu EINER Information — das, was der Endkunde zu sehen bekommt
   * (TB-06, [Q3] Kap. 6).
   *
   * **Er rechnet die Einsparung nicht neu.** Sie kommt unveraendert aus der
   * eingefrorenen Zeile; saehe der Kunde eine andere Zahl als die
   * Bewilligungsbehoerde, waere jede Erklaerung dafuer schlechter als der
   * Fehler selbst.
   *
   * Ergaenzt wird, was Kap. 6 darueber hinaus verlangt: die Verbraeuche der
   * erkannten Geraetegruppen, getrennt nach Gruppen. Sie werden aus den
   * Zuordnungen gebildet, die IM BERICHTSMONAT galten — die Tages-Aufloesung
   * aus TB-05 leistet das bereits, und weil eine Zuordnung nur zum heutigen
   * Tag beendet werden kann, bleibt ein alter Monatsbericht reproduzierbar.
   */
  async bericht(id: string): Promise<NutzerinfoBericht> {
    const information = await this.findeById(id);
    const vonTag = information.monat;
    const bisTag = this.monatDanach(information.monat);

    const [summen, jeGruppe, vormonat] = await Promise.all([
      this.geraeteerkennungRepository.summiereVerbrauch(
        information.endkundeId,
        information.energietraeger,
        vonTag,
        bisTag,
      ),
      this.geraeteerkennungRepository.summiereJeGruppe(
        information.endkundeId,
        information.energietraeger,
        vonTag,
        bisTag,
      ),
      this.repository.findVormonat(information.endkundeId, information.energietraeger, information.monat),
    ]);

    const zugeordnetKwh = runde(summen.zugeordnetKwh);
    const gruppen: BerichtGruppe[] = jeGruppe.map((gruppe) => ({
      geraetegruppeId: gruppe.geraetegruppeId,
      bezeichnung: gruppe.bezeichnung,
      verbrauchKwh: runde(gruppe.kwh),
      // Bezugsgroesse ist der ERFASSTE Gesamtverbrauch des Monats, nicht der
      // zugeordnete: Sonst summierten sich die Anteile immer auf 100 %, auch
      // wenn nur ein Zehntel des Verbrauchs ueberhaupt zugeordnet ist.
      anteilPct: summen.gesamtKwh <= 0 ? 0 : Math.round((gruppe.kwh / summen.gesamtKwh) * 1000) / 10,
    }));

    return {
      information,
      vonTag,
      bisTag: this.letzterTag(bisTag),
      gruppen,
      zugeordnetKwh,
      nichtZugeordnetKwh: Math.max(runde(summen.gesamtKwh - summen.zugeordnetKwh), 0),
      ohneTageswerte: summen.tageMitWerten === 0,
      vormonatDeltaKwh: vormonat?.deltaKwh ?? null,
      vormonatIstKwh: vormonat?.istKwh ?? null,
    };
  }

  /** Erster des Folgemonats — die obere, AUSSCHLIESSENDE Fenstergrenze. */
  private monatDanach(monatIso: string): string {
    const [jahr, monat] = monatIso.split('-').map(Number) as [number, number, number];
    const naechster = monat === 12 ? { jahr: jahr + 1, monat: 1 } : { jahr, monat: monat + 1 };
    return `${String(naechster.jahr).padStart(4, '0')}-${String(naechster.monat).padStart(2, '0')}-01`;
  }

  /** Der letzte Tag des Berichtsmonats — fuer die Anzeige, nicht fuer die Abfrage. */
  private letzterTag(erstesDesFolgemonats: string): string {
    const tag = new Date(`${erstesDesFolgemonats}T00:00:00Z`);
    tag.setUTCDate(tag.getUTCDate() - 1);
    return tag.toISOString().slice(0, 10);
  }

  /**
   * Vermerkt, dass eine Information zugestellt bzw. bereitgestellt wurde —
   * der Nachweis, den TB-06 verlangt.
   *
   * Eine zweite Zustellung antwortet 409 und lässt den ersten Zeitpunkt
   * stehen: Er belegt, dass die Auflage in DIESEM Monat erfüllt wurde.
   */
  @Transactional(Propagation.Nested)
  async vermerkeZustellung(
    id: string,
    zustellweg: Zustellweg,
    zugestelltAtIso: string,
  ): Promise<NutzerinformationItem> {
    const vorher = await this.findeById(id);
    if (vorher.zugestelltAt !== null) {
      throw new ConflictException(
        `Diese Information wurde bereits am ${vorher.zugestelltAt} zugestellt (${vorher.zustellweg ?? '?'}). ` +
          'Der erste Zeitpunkt bleibt stehen — er ist der Nachweis, dass die Auflage in diesem Monat ' +
          'erfuellt wurde.',
      );
    }

    const zugestelltAt = this.pruefeZustellzeitpunkt(zugestelltAtIso);

    const erfolgreich = await this.repository.vermerkeZustellung(id, zugestelltAt, zustellweg);
    if (!erfolgreich) {
      throw new ConflictException('Diese Information wurde zwischenzeitlich zugestellt.');
    }

    return this.findeById(id);
  }

  /**
   * Vermerkt die Zustellung für einen GANZEN Monat.
   *
   * **Warum das kein Komfort ist.** Ein Monatslauf erzeugt eine Information
   * je Endkunde und Energieträger. Post läuft als Stapel: einmal drucken,
   * einmal kuvertieren, einmal einliefern. Müsste der Betrieb danach jede
   * Information einzeln anklicken, bliebe der Nachweis in der Praxis
   * unvollständig — und ein unvollständiger Versandnachweis ist gegenüber
   * der Bewilligungsbehörde dasselbe wie kein Versand.
   *
   * **Was der Vorgang NICHT tut:** bereits zugestellte Informationen
   * anfassen. Ihr erster Zeitpunkt bleibt stehen (dieselbe Regel wie
   * einzeln), sie werden gezählt und übergangen — kein Fehler, sondern der
   * Normalfall bei einem Nachzügler.
   *
   * **Ein Audit-Ereignis JE INFORMATION**, nicht eines für den Stapel: Die
   * Frage, auf die es später ankommt, ist immer eine über EINEN Kunden
   * („wurde Herr X im März informiert?"). Ein Sammelereignis könnte sie
   * nicht beantworten. Das entspricht dem Zuschnitt, den V0055 für
   * `nutzerinfo.information.zugestellt` ohnehin festlegt.
   */
  @Transactional(Propagation.Nested)
  async vermerkeSammelZustellung(
    monat: string,
    zustellweg: Zustellweg,
    zugestelltAtIso: string,
    subject: SecurityContext,
    synthetic: boolean,
  ): Promise<NutzerinfoSammelZustellung> {
    if (!MONAT_FORM.test(monat)) {
      throw new BadRequestException('monat muss ein Monatserster in der Form YYYY-MM-01 sein.');
    }
    const zugestelltAt = this.pruefeZustellzeitpunkt(zugestelltAtIso);

    const alle = await this.repository.findByMonat(monat);
    if (alle.length === 0) {
      throw new BadRequestException(
        `Für ${monat} ist keine Nutzerinformation erzeugt — es gibt nichts zu vermerken.`,
      );
    }

    const offene = alle.filter((information) => information.zugestelltAt === null);
    let vermerkt = 0;

    for (const information of offene) {
      const erfolgreich = await this.repository.vermerkeZustellung(information.id, zugestelltAt, zustellweg);
      if (!erfolgreich) {
        // Zwischenzeitlich einzeln zugestellt — kein Fehler, der erste
        // Zeitpunkt gilt. Der Stapel bricht deswegen nicht ab.
        continue;
      }
      vermerkt += 1;
      await this.auditService.append({
        eventTyp: NUTZERINFO_EVENT_CODES.ZUGESTELLT,
        actorTyp: subject.actorTyp,
        actorSub: subject.sub,
        ergebnis: 'ok',
        objektRef: information.id,
        kontext: { synthetic, monat, zustellweg },
      });
    }

    return {
      monat,
      zustellweg,
      zugestelltAt: zugestelltAt.toISOString(),
      anzahlGesamt: alle.length,
      anzahlVermerkt: vermerkt,
      anzahlBereitsZugestellt: alle.length - offene.length,
    };
  }

  /**
   * Ein Zustellzeitpunkt muss lesbar UND vergangen sein. Vermerkt wird, was
   * zugestellt WURDE — nicht, was geplant ist.
   */
  private pruefeZustellzeitpunkt(zugestelltAtIso: string): Date {
    const zugestelltAt = new Date(zugestelltAtIso);
    if (Number.isNaN(zugestelltAt.getTime())) {
      throw new BadRequestException('zugestelltAt ist kein gueltiger Zeitpunkt.');
    }
    if (zugestelltAt.getTime() > Date.now()) {
      throw new BadRequestException(
        'zugestelltAt liegt in der Zukunft. Vermerkt wird, was zugestellt WURDE — nicht, was geplant ist.',
      );
    }
    return zugestelltAt;
  }

  private async lauf(monat: string, jetzt: Date, schreibend: boolean): Promise<NutzerinfoLaufErgebnis> {
    if (!MONAT_FORM.test(monat)) {
      throw new BadRequestException('monat muss ein Monatserster in der Form YYYY-MM-01 sein.');
    }
    if (monat >= laufenderMonat(jetzt)) {
      // Ein laufender Monat ist nicht abgeschlossen. Eine Information darüber
      // wäre zu niedrig — und weil sie nach der Zustellung nicht mehr
      // korrigiert wird, bliebe sie es.
      throw new BadRequestException(
        `Der Monat ${monat} ist noch nicht abgeschlossen. Informiert wird ueber abgelaufene Monate; ` +
          'ein laufender ergaebe einen zu niedrigen Verbrauch, und nach der Zustellung wird nicht mehr ' +
          'korrigiert.',
      );
    }

    const paare = await this.repository.findKandidatenPaare(monat);

    let anzahlErzeugt = 0;
    let uebersprungenWiderspruch = 0;
    let uebersprungenGesperrt = 0;
    let ohneBerechnung = 0;

    for (const paar of paare) {
      if (paar.hatWiderspruch) {
        uebersprungenWiderspruch += 1;
        continue;
      }
      if (!INFORMIERBARE_STATUS.has(paar.verarbeitungsStatus)) {
        uebersprungenGesperrt += 1;
        continue;
      }

      const kandidaten = await this.laufLookupRepository.findKandidatenFuerMonat(
        paar.endkundeId,
        paar.energietraeger,
        monat,
      );
      const aufloesung = loeseBindungAuf(kandidaten);
      if (aufloesung.art !== 'ok') {
        // `kein_kandidat` oder `abweichend` — beides heisst: nicht
        // informierbar. Der Unterschied ist fuer den Betrieb wichtig (das
        // eine ist eine Luecke, das andere ein Widerspruch in der
        // Rechenhistorie) und steht im Log; fuer den Kunden ist er derselbe.
        ohneBerechnung += 1;
        continue;
      }

      const gewaehlt = aufloesung.gewaehlt;
      const guete = await this.repository.findGuete(gewaehlt.berechnungslaufId, monat);
      if (guete === undefined) {
        // Strukturell ausgeschlossen (der Kandidat kam aus einem Join ueber
        // genau diese Zeile) — aber ein `undefined`, das stillschweigend zu
        // einer 0 wuerde, waere eine erfundene Guete-Angabe.
        ohneBerechnung += 1;
        continue;
      }

      anzahlErzeugt += 1;
      if (!schreibend) {
        continue;
      }

      const referenzKwh = runde(gewaehlt.referenzKwh);
      const istKwh = runde(gewaehlt.istKwh);
      const deltaKwh = runde(gewaehlt.referenzKwh - gewaehlt.istKwh);

      await this.repository.schreibe({
        id: randomUUID(),
        endkundeId: paar.endkundeId,
        energietraeger: paar.energietraeger,
        monat,
        berechnungslaufId: gewaehlt.berechnungslaufId,
        referenzKwh,
        istKwh,
        deltaKwh,
        qualitaetsStufe: gewaehlt.qualitaetsStufe,
        abdeckungPct: guete.abdeckungPct,
        tageFehlend: guete.tageFehlend,
        kandidatenAnzahl: aufloesung.kandidatenAnzahl,
        inhaltHash: this.bildeInhaltHash({
          endkundeId: paar.endkundeId,
          energietraeger: paar.energietraeger,
          monat,
          berechnungslaufId: gewaehlt.berechnungslaufId,
          referenzKwh,
          istKwh,
          deltaKwh,
          qualitaetsStufe: gewaehlt.qualitaetsStufe,
        }),
      });
    }

    return {
      modus: schreibend ? 'ausfuehrung' : 'probelauf',
      monat,
      anzahlPaare: paare.length,
      anzahlErzeugt,
      uebersprungenWiderspruch,
      uebersprungenGesperrt,
      ohneBerechnung,
    };
  }

  /**
   * SHA-256 über den kanonisierten Inhalt.
   *
   * Kein Byte-Archiv, sondern deterministisches Re-Rendering plus
   * Hash-Vergleich — dasselbe Muster wie beim Nachweis-Export (ADR-0007 B14).
   * Er beantwortet die Frage, die im Streitfall gestellt wird: Stand das
   * damals wirklich so drin?
   *
   * Die Reihenfolge der Felder ist Teil des Vertrags: Wer sie ändert, ändert
   * jeden künftigen Hash und macht ihn mit den bestehenden unvergleichbar.
   */
  private bildeInhaltHash(inhalt: {
    readonly endkundeId: string;
    readonly energietraeger: string;
    readonly monat: string;
    readonly berechnungslaufId: string;
    readonly referenzKwh: number;
    readonly istKwh: number;
    readonly deltaKwh: number;
    readonly qualitaetsStufe: string;
  }): Buffer {
    const zeile = [
      inhalt.endkundeId,
      inhalt.energietraeger,
      inhalt.monat,
      inhalt.berechnungslaufId,
      inhalt.referenzKwh.toFixed(3),
      inhalt.istKwh.toFixed(3),
      inhalt.deltaKwh.toFixed(3),
      inhalt.qualitaetsStufe,
    ].join('|');

    return createHash('sha256').update(zeile, 'utf8').digest();
  }
}
