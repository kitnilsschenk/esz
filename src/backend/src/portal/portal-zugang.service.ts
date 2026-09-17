import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { AuditService } from '../audit/audit.service';
import { EnergyEndkundeRepository } from '../stammdaten/persistence/energy/energy-endkunde.repository';
import { konflikt, nichtGefunden } from '../stammdaten/common/problem.util';
import type { SecurityContext } from '../common/security/security-context';
import { PORTAL_EVENT_CODES } from './audit/portal-audit-events';
import { PortalConfigService } from './portal.config';
import { rendereZugangsbrief } from './dokument/portal-zugangsbrief.renderer';
import { PortalCodeIndexService } from './crypto/portal-code-index.service';
import { erzeugeKennung, erzeugeZugangscode } from './crypto/portal-zugangscode.util';
import { PortalSitzungRepository } from './persistence/portal-sitzung.repository';
import { PortalZugangRepository } from './persistence/portal-zugang.repository';
import type { PortalZugangStatus } from './persistence/portal-zugang.repository';

/**
 * Gültigkeit eines Zugangscodes.
 *
 * 30 Tage: lang genug für einen Brief samt Urlaub des Empfängers, kurz genug,
 * dass ein liegen gebliebener Brief nicht ein Jahr später noch Zugang
 * verschafft.
 */
const CODE_GUELTIGKEIT_TAGE = 30;

/** Was der Betrieb über einen Zugang sieht — NIE den Code, den gibt es nur einmal. */
export interface PortalZugangStand {
  readonly endkundeId: string;
  readonly vorhanden: boolean;
  readonly kennung: string | null;
  readonly status: PortalZugangStatus | null;
  readonly codeOffenBis: string | null;
  readonly passwortGesetzt: boolean;
  readonly gesperrtBis: string | null;
}

/** Das Ergebnis einer Ausgabe — der EINZIGE Moment, in dem der Code im Klartext existiert. */
export interface PortalZugangAusgabe {
  readonly kennung: string;
  /** Klartext, gehört in den Brief. Wird NIRGENDS gespeichert und ist nicht erneut abrufbar. */
  readonly code: string;
  readonly gueltigBis: string;
  readonly erneut: boolean;
  /**
   * Der druckfertige Zugangsbrief — mitgeliefert, nicht separat abrufbar.
   *
   * Er MUSS hier mitkommen: Der Code steht nirgends, also könnte ihn eine
   * zweite Route nicht mehr setzen. Wer die Antwort verwirft, ohne zu
   * drucken, gibt einen neuen Code aus.
   */
  readonly brief: string;
  /** Die Adresse, die im Brief steht — damit der Betrieb sie vor dem Druck sieht. */
  readonly portalUrl: string;
  /** `true`, wenn `EDMS_PORTAL_URL` nicht gesetzt ist und im Brief die Dev-Adresse steht. */
  readonly portalUrlIstStandard: boolean;
}

/**
 * Der Betriebs-Weg zum Portal-Zugang: ausgeben und sperren.
 *
 * **Der Code verlässt diesen Dienst genau einmal.** Er wird erzeugt,
 * zurückgegeben (für den Brief) und nur als Index gespeichert. Es gibt
 * bewusst keine Route, die ihn erneut liefert — ein nachschlagbarer Code wäre
 * ein Generalschlüssel zu fremden Verbrauchsdaten, und der Betrieb hätte ihn
 * dauerhaft in Reichweite. Wer seinen Brief verliert, bekommt einen NEUEN
 * Code; der alte wird dabei ungültig.
 *
 * **Ein gesperrter Endkunde bekommt keinen Zugang.** Art. 18 DSGVO
 * beschränkt die Verarbeitung; einen neuen Zugriffsweg zu eröffnen wäre das
 * Gegenteil. Dieselbe fail-closed-Linie wie beim Berechnungslauf und bei der
 * Nutzerinformation.
 */
@Injectable()
export class PortalZugangService {
  constructor(
    private readonly zugangRepository: PortalZugangRepository,
    private readonly sitzungRepository: PortalSitzungRepository,
    private readonly endkundeRepository: EnergyEndkundeRepository,
    private readonly codeIndex: PortalCodeIndexService,
    private readonly auditService: AuditService,
    private readonly config: PortalConfigService,
  ) {}

  /** Der Stand für die Betriebsansicht — ohne Code, ohne Hash. */
  @Transactional(Propagation.Required)
  async stand(endkundeId: string): Promise<PortalZugangStand> {
    await this.findeAktivenEndkunden(endkundeId, { fuerAusgabe: false });
    const zugang = await this.zugangRepository.findByEndkundeId(endkundeId);

    if (zugang === undefined) {
      return {
        endkundeId,
        vorhanden: false,
        kennung: null,
        status: null,
        codeOffenBis: null,
        passwortGesetzt: false,
        gesperrtBis: null,
      };
    }

    return {
      endkundeId,
      vorhanden: true,
      kennung: zugang.kennung,
      status: zugang.status,
      codeOffenBis: zugang.codeGueltigBis,
      passwortGesetzt: zugang.passwortHash !== null,
      gesperrtBis: zugang.gesperrtBis,
    };
  }

  /**
   * Gibt einen Zugangscode aus — beim ersten Mal samt neuem Zugang, danach
   * als Ersatzbrief für denselben.
   *
   * Ein bestehendes Passwort bleibt dabei stehen. Der neue Code ersetzt nur
   * den alten Brief; er ist kein Passwort-Reset. (Wer sein Passwort vergessen
   * hat, löst den neuen Code ein und setzt dabei ein neues — dieser Weg
   * existiert, aber er ist eine bewusste Handlung des Kunden, nicht des
   * Betriebs.)
   */
  @Transactional(Propagation.Required)
  async gibCodeAus(endkundeId: string, subject: SecurityContext, synthetic: boolean): Promise<PortalZugangAusgabe> {
    await this.findeAktivenEndkunden(endkundeId, { fuerAusgabe: true });

    const code = erzeugeZugangscode();
    const codeHash = await this.codeIndex.berechne(code);
    const gueltigBis = new Date(Date.now() + CODE_GUELTIGKEIT_TAGE * 24 * 60 * 60 * 1000);

    const bestehend = await this.zugangRepository.findByEndkundeId(endkundeId);
    let zugangId: string;
    let kennung: string;

    if (bestehend === undefined) {
      const angelegt = await this.zugangRepository.insert({
        id: randomUUID(),
        endkundeId,
        kennung: await this.freieKennung(),
        codeHash,
        codeGueltigBis: gueltigBis,
      });
      zugangId = angelegt.id;
      kennung = angelegt.kennung;
    } else {
      if (bestehend.status === 'gesperrt') {
        throw konflikt(
          'Der Portal-Zugang dieses Endkunden ist gesperrt. Aus einer Sperre fuehrt kein neuer Code heraus — ' +
            'sie ist bewusst kein Zustand, der sich von selbst aufloest.',
        );
      }
      const erfolgreich = await this.zugangRepository.neuerCode(bestehend.id, codeHash, gueltigBis);
      if (!erfolgreich) {
        throw konflikt('Der Portal-Zugang wurde zwischenzeitlich gesperrt.');
      }
      zugangId = bestehend.id;
      kennung = bestehend.kennung;
    }

    await this.auditService.append({
      eventTyp: PORTAL_EVENT_CODES.ZUGANG_AUSGEGEBEN,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: zugangId,
      kontext: { synthetic, erneut: bestehend !== undefined, gueltig_bis: gueltigBis.toISOString() },
    });

    const erneut = bestehend !== undefined;
    return {
      kennung,
      code,
      gueltigBis: gueltigBis.toISOString(),
      erneut,
      brief: rendereZugangsbrief({
        kennung,
        code,
        gueltigBis: gueltigBis.toISOString(),
        portalUrl: this.config.portalUrl,
        erneut,
      }),
      portalUrl: this.config.portalUrl,
      portalUrlIstStandard: this.config.istStandardUrl,
    };
  }

  /**
   * Sperrt den Zugang und beendet alle offenen Sitzungen.
   *
   * Beides gehört zusammen: Ein gesperrter Zugang, unter dem jemand
   * angemeldet bleibt, ist eine Ankündigung, keine Maßnahme.
   */
  @Transactional(Propagation.Required)
  async sperre(endkundeId: string, subject: SecurityContext, synthetic: boolean): Promise<PortalZugangStand> {
    const zugang = await this.zugangRepository.findByEndkundeId(endkundeId);
    if (zugang === undefined) {
      throw nichtGefunden('Portal-Zugang');
    }

    const gesperrt = await this.zugangRepository.sperre(zugang.id);
    if (!gesperrt) {
      throw konflikt('Dieser Portal-Zugang ist bereits gesperrt.');
    }
    const beendete = await this.sitzungRepository.beendeAlleFuerZugang(zugang.id, 'gesperrt');

    await this.auditService.append({
      eventTyp: PORTAL_EVENT_CODES.ABMELDUNG,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: zugang.id,
      kontext: { synthetic, grund: 'gesperrt' },
    });
    void beendete;

    return this.stand(endkundeId);
  }

  /**
   * Der Endkunde muss existieren — und für eine AUSGABE zusätzlich aktiv
   * sein.
   *
   * Das Lesen des Stands bleibt auch bei einem gesperrten Endkunden erlaubt:
   * Der Betrieb muss sehen können, dass es einen Zugang gibt, gerade wenn er
   * ihn sperren will. Das Eröffnen eines neuen Zugriffswegs ist etwas
   * anderes.
   */
  private async findeAktivenEndkunden(endkundeId: string, optionen: { readonly fuerAusgabe: boolean }): Promise<void> {
    const endkunde = await this.endkundeRepository.findById(endkundeId);
    if (endkunde === undefined) {
      throw nichtGefunden('Endkunde');
    }
    if (optionen.fuerAusgabe && endkunde.verarbeitungsStatus !== 'aktiv') {
      throw konflikt(
        'Endkunde ist gesperrt oder geloescht (Art. 18/17 DSGVO) — ein neuer Portal-Zugang waere ein neuer ' +
          'Zugriffsweg auf Daten, deren Verarbeitung gerade eingeschraenkt ist.',
      );
    }
  }

  /**
   * Sucht eine noch freie Kennung.
   *
   * Der Zufallsraum ist groß genug, dass eine Kollision unwahrscheinlich ist
   * — aber nicht unmöglich, und ein Unique-Verstoß mitten in einer
   * Betriebsaktion wäre ein 500 für einen Fall, der vorhersehbar ist.
   */
  private async freieKennung(): Promise<string> {
    for (let versuch = 0; versuch < 10; versuch += 1) {
      const kandidat = erzeugeKennung();
      if ((await this.zugangRepository.findByKennung(kandidat)) === undefined) {
        return kandidat;
      }
    }
    throw new Error('Keine freie Portal-Kennung gefunden — zehn Versuche kollidiert, das ist kein Zufall mehr.');
  }
}
