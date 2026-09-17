import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { AuditService } from '../audit/audit.service';
import { ProblemDetailsException } from '../common/exceptions/problem-details.exception';
import { EnergyEndkundeRepository } from '../stammdaten/persistence/energy/energy-endkunde.repository';
import { PORTAL_ANMELDUNG_GRUENDE, PORTAL_EVENT_CODES } from './audit/portal-audit-events';
import type { PortalAnmeldungGrund } from './audit/portal-audit-events';
import { PortalCodeIndexService } from './crypto/portal-code-index.service';
import { istVeraltet, leiteAb, pruefe } from './crypto/portal-passwort.util';
import { PortalSitzungRepository } from './persistence/portal-sitzung.repository';
import type { PortalSitzungMitZugang } from './persistence/portal-sitzung.repository';
import { PortalZugangRepository } from './persistence/portal-zugang.repository';
import type { PortalZugang } from './persistence/portal-zugang.repository';

/** Nach so vielen Fehlversuchen wird für eine Weile gesperrt. */
const FEHLVERSUCH_GRENZE = 5;
/** 15 Minuten — lang genug, um Durchprobieren unwirtschaftlich zu machen, kurz genug für einen Vertipper. */
const SPERRDAUER_SEKUNDEN = 15 * 60;
/** Sitzungsdauer: 12 Stunden. Ein Portal, das man täglich neu aufschließt, wird nicht benutzt. */
const SITZUNG_STUNDEN = 12;
/** Mindestlänge des Passworts — BSI/OWASP-Linie: Länge vor Zeichenklassen-Akrobatik. */
const PASSWORT_MINDESTLAENGE = 12;
const PASSWORT_MAXLAENGE = 200;

export interface PortalSitzungErgebnis {
  readonly token: string;
  readonly laeuftAbAt: string;
  readonly kennung: string;
}

/**
 * Der Kunden-Weg: Code einlösen, anmelden, abmelden.
 *
 * **Eine einzige Fehlermeldung.** Ob eine Kennung existiert, ob das Passwort
 * falsch war, ob der Code abgelaufen ist — nach außen ist das alles derselbe
 * Satz. Jede Differenzierung wäre eine Auskunft an den, der gerade
 * durchprobiert: „diese Kennung gibt es" ist die halbe Arbeit. Im Audit-Log
 * steht der Grund sehr wohl (dort liest ihn der Betrieb, nicht der Angreifer).
 *
 * **Zeitkosten bleiben gleich.** Auch bei unbekannter Kennung wird eine
 * Passwortprüfung gerechnet. Ohne das verriete die Antwortzeit, welche
 * Kennungen existieren — der Timing-Kanal, den die einheitliche Meldung
 * gerade schließen soll.
 */
@Injectable()
export class PortalAnmeldungService {
  constructor(
    private readonly zugangRepository: PortalZugangRepository,
    private readonly sitzungRepository: PortalSitzungRepository,
    private readonly endkundeRepository: EnergyEndkundeRepository,
    private readonly codeIndex: PortalCodeIndexService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Löst einen Zugangscode ein und setzt das Passwort.
   *
   * Danach ist der Brief wertlos (`code_hash = NULL`), und der Kunde ist
   * angemeldet — ein zweiter Anmeldeschritt unmittelbar nach dem Setzen wäre
   * eine Hürde ohne Sicherheitsgewinn.
   */
  @Transactional(Propagation.Required)
  async loeseEin(code: string, passwort: string, synthetic: boolean): Promise<PortalSitzungErgebnis> {
    this.pruefePasswortRegeln(passwort);

    const codeHash = await this.codeIndex.berechne(code);
    const zugang = await this.zugangRepository.findByCodeIndex(codeHash);

    if (zugang === undefined) {
      await this.protokolliereFehlschlag(null, PORTAL_ANMELDUNG_GRUENDE.UNBEKANNT, synthetic);
      throw this.abweisung();
    }
    const grund = await this.pruefeZugangVerwendbar(zugang);
    if (grund !== null) {
      await this.zugangRepository.vermerkeFehlversuch(zugang.id, FEHLVERSUCH_GRENZE, SPERRDAUER_SEKUNDEN);
      await this.protokolliereFehlschlag(zugang.id, grund, synthetic);
      throw this.abweisung();
    }
    if (zugang.codeGueltigBis !== null && new Date(zugang.codeGueltigBis).getTime() <= Date.now()) {
      await this.protokolliereFehlschlag(zugang.id, PORTAL_ANMELDUNG_GRUENDE.ABGELAUFEN, synthetic);
      throw this.abweisung();
    }

    const ableitung = await leiteAb(passwort);
    const gesetzt = await this.zugangRepository.setzePasswort(zugang.id, ableitung);
    if (!gesetzt) {
      // Zwei Anfragen mit demselben Code gleichzeitig — die zweite findet den
      // Code bereits verbraucht. Kein Sonderfall, nur ein Rennen.
      await this.protokolliereFehlschlag(zugang.id, PORTAL_ANMELDUNG_GRUENDE.UNBEKANNT, synthetic);
      throw this.abweisung();
    }
    // Ein neues Passwort beendet alte Sitzungen: Wer den Zugang gerade neu in
    // die Hand genommen hat, soll niemanden angemeldet zurücklassen.
    await this.sitzungRepository.beendeAlleFuerZugang(zugang.id, 'passwort_neu');

    await this.auditService.append({
      eventTyp: PORTAL_EVENT_CODES.ZUGANG_EINGELOEST,
      actorTyp: 'endkunde',
      actorSub: zugang.id,
      ergebnis: 'ok',
      objektRef: zugang.id,
      kontext: { synthetic },
    });

    return this.eroeffneSitzung(zugang, synthetic);
  }

  /** Anmeldung mit Kennung und Passwort. */
  @Transactional(Propagation.Required)
  async meldeAn(kennung: string, passwort: string, synthetic: boolean): Promise<PortalSitzungErgebnis> {
    const zugang = await this.zugangRepository.findByKennung(kennung.trim().toUpperCase());

    if (zugang === undefined || zugang.passwortHash === null || zugang.passwortSalt === null || zugang.passwortAlgo === null) {
      // Zeitkosten angleichen: Ohne diese Ableitung antwortete eine
      // unbekannte Kennung messbar schneller als eine bekannte.
      await leiteAb(passwort);
      await this.protokolliereFehlschlag(zugang?.id ?? null, PORTAL_ANMELDUNG_GRUENDE.UNBEKANNT, synthetic);
      throw this.abweisung();
    }

    const grund = await this.pruefeZugangVerwendbar(zugang);
    if (grund !== null) {
      await this.protokolliereFehlschlag(zugang.id, grund, synthetic);
      throw this.abweisung();
    }

    const stimmt = await pruefe(passwort, zugang.passwortHash, zugang.passwortSalt, zugang.passwortAlgo);
    if (!stimmt) {
      await this.zugangRepository.vermerkeFehlversuch(zugang.id, FEHLVERSUCH_GRENZE, SPERRDAUER_SEKUNDEN);
      await this.protokolliereFehlschlag(zugang.id, PORTAL_ANMELDUNG_GRUENDE.PASSWORT_FALSCH, synthetic);
      throw this.abweisung();
    }

    await this.zugangRepository.setzeFehlversucheZurueck(zugang.id);
    // Gelegenheit zum Nachziehen: Wurden die scrypt-Parameter seit dem
    // Setzen erhöht, wird der Hash jetzt neu abgeleitet — im einzigen
    // Moment, in dem das Klartext-Passwort vorliegt.
    if (istVeraltet(zugang.passwortAlgo)) {
      await this.zugangRepository.aktualisierePasswort(zugang.id, await leiteAb(passwort));
    }

    return this.eroeffneSitzung(zugang, synthetic);
  }

  /** Löst ein Sitzungs-Token auf — der Guard fragt hier. */
  @Transactional(Propagation.Required)
  async findeSitzung(token: string): Promise<PortalSitzungMitZugang | undefined> {
    const sitzung = await this.sitzungRepository.findeOffene(this.tokenHash(token));
    if (sitzung === undefined) {
      return undefined;
    }
    // Der Endkunde kann nach der Anmeldung gesperrt worden sein. Die Sitzung
    // darf ihn dann nicht weitertragen — sonst überlebte der Zugriff die
    // Art.-18-Einschränkung.
    const endkunde = await this.endkundeRepository.findById(sitzung.endkundeId);
    return endkunde?.verarbeitungsStatus === 'aktiv' ? sitzung : undefined;
  }

  @Transactional(Propagation.Required)
  async meldeAb(token: string, synthetic: boolean): Promise<void> {
    const tokenHash = this.tokenHash(token);
    const sitzung = await this.sitzungRepository.findeOffene(tokenHash);
    await this.sitzungRepository.beende(tokenHash, 'abmeldung');

    if (sitzung !== undefined) {
      await this.auditService.append({
        eventTyp: PORTAL_EVENT_CODES.ABMELDUNG,
        actorTyp: 'endkunde',
        actorSub: sitzung.zugangId,
        ergebnis: 'ok',
        objektRef: sitzung.zugangId,
        kontext: { synthetic, grund: 'abmeldung' },
      });
    }
  }

  private async eroeffneSitzung(zugang: PortalZugang, synthetic: boolean): Promise<PortalSitzungErgebnis> {
    // 32 Byte Zufall — das Token ist der ganze Schlüssel zur Sitzung.
    const token = randomBytes(32).toString('base64url');
    const laeuftAbAt = new Date(Date.now() + SITZUNG_STUNDEN * 60 * 60 * 1000);

    await this.sitzungRepository.insert({
      id: randomUUID(),
      zugangId: zugang.id,
      tokenHash: this.tokenHash(token),
      laeuftAbAt,
    });

    await this.auditService.append({
      eventTyp: PORTAL_EVENT_CODES.ANMELDUNG,
      actorTyp: 'endkunde',
      actorSub: zugang.id,
      ergebnis: 'ok',
      objektRef: zugang.id,
      kontext: { synthetic },
    });

    return { token, laeuftAbAt: laeuftAbAt.toISOString(), kennung: zugang.kennung };
  }

  /**
   * `null`, wenn der Zugang benutzbar ist — sonst der Grund fürs Log.
   *
   * Der Endkunde wird MIT geprüft: Ein nach Art. 18 gesperrter Kunde darf
   * sich nicht anmelden, auch wenn sein Zugang technisch in Ordnung ist.
   */
  private async pruefeZugangVerwendbar(zugang: PortalZugang): Promise<PortalAnmeldungGrund | null> {
    if (zugang.status === 'gesperrt') {
      return PORTAL_ANMELDUNG_GRUENDE.GESPERRT;
    }
    if (zugang.gesperrtBis !== null && new Date(zugang.gesperrtBis).getTime() > Date.now()) {
      return PORTAL_ANMELDUNG_GRUENDE.GESPERRT;
    }
    const endkunde = await this.endkundeRepository.findById(zugang.endkundeId);
    if (endkunde === undefined || endkunde.verarbeitungsStatus !== 'aktiv') {
      return PORTAL_ANMELDUNG_GRUENDE.GESPERRT;
    }
    return null;
  }

  private pruefePasswortRegeln(passwort: string): void {
    const laenge = passwort.normalize('NFC').length;
    if (laenge < PASSWORT_MINDESTLAENGE || laenge > PASSWORT_MAXLAENGE) {
      // Diese Meldung ist ausdrücklich KONKRET — anders als bei der
      // Anmeldung. Beim Setzen eines Passworts hilft eine genaue Angabe dem
      // Kunden und verrät niemandem etwas.
      throw new ProblemDetailsException({
        status: HttpStatus.BAD_REQUEST,
        title: 'Bad Request',
        detail: `Das Passwort muss zwischen ${String(PASSWORT_MINDESTLAENGE)} und ${String(PASSWORT_MAXLAENGE)} Zeichen lang sein.`,
      });
    }
  }

  /** SHA-256 über das Token — in der Datenbank liegt nur der Hash (V0066). */
  private tokenHash(token: string): Buffer {
    return createHash('sha256').update(token, 'utf8').digest();
  }

  private async protokolliereFehlschlag(
    zugangId: string | null,
    grund: PortalAnmeldungGrund,
    synthetic: boolean,
  ): Promise<void> {
    await this.auditService.append({
      eventTyp: PORTAL_EVENT_CODES.ANMELDUNG,
      // `endkunde` auch hier: Der Versuch fand am Endkunden-Zugang statt,
      // auch wenn er scheiterte. `actor_sub` bleibt leer, solange kein
      // Zugang bekannt ist — eine erfundene Kennung wäre schlimmer als keine.
      actorTyp: 'endkunde',
      ...(zugangId === null ? {} : { actorSub: zugangId }),
      ergebnis: 'error',
      ...(zugangId === null ? {} : { objektRef: zugangId }),
      kontext: { synthetic, grund },
    });
  }

  /**
   * EINE Meldung für jeden Fehlschlag — s. Klassen-Doc.
   *
   * Und ausgeschrieben, mit Umlauten: Anders als die übrigen Fehlertexte des
   * Backends liest diese hier ein ENDKUNDE, unverändert und ohne
   * Übersetzungsschicht. „nicht moeglich" ist für ein Betriebswerkzeug eine
   * Nachlässigkeit, in einem Kundenbrief wäre es eine.
   */
  private abweisung(): ProblemDetailsException {
    return new ProblemDetailsException({
      status: HttpStatus.UNAUTHORIZED,
      title: 'Unauthorized',
      detail:
        'Anmeldung nicht möglich. Bitte prüfen Sie Kennung, Zugangscode und Passwort. ' +
        'Nach mehreren Fehlversuchen ist der Zugang vorübergehend gesperrt.',
    });
  }
}
