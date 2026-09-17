import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { ConsentRepository } from './persistence/consent.repository';
import { WiderspruchRepository } from './persistence/widerspruch.repository';
import { pruefeErfassungsweg, pruefeErklaerungszeitpunkt } from './erklaerung.policy';
import { WiderspruchBelegRepository } from './persistence/widerspruch-beleg.repository';
import { IdentityEndkundePiiRepository } from '../stammdaten/persistence/identity/identity-endkunde-pii.repository';
import { IdentitySubjektSchluesselRepository } from '../stammdaten/persistence/identity/identity-subjekt-schluessel.repository';
import { FieldCipherService } from '../common/crypto/field-cipher.service';
import { KEY_MANAGEMENT_PORT } from '../common/crypto/key-management.port';
import type { KeyManagementPort } from '../common/crypto/key-management.port';
import type { Erfassungsweg, SubjektTyp, WiderspruchItem } from './consent.types';

export interface WiderspruchErklaerenInput {
  readonly subjektTyp: SubjektTyp;
  readonly subjektId: string;
  readonly zweckCode: string;
  /** Zeitpunkt der ERKLAERUNG, nicht der Erfassung. */
  readonly erklaertAt: string;
  readonly erfassungsweg: Erfassungsweg;
  readonly quelleRef?: string;
}

/**
 * Die Begleitangaben einer DIGITAL abgegebenen Erklärung (DS-03).
 *
 * Sie sind PFLICHT, weil `digital_opt_in` ohne IP von der Datenbank
 * zurückgewiesen wird (V0069) — und weil ein digitaler Nachweis ohne die
 * Adresse, an der er abgegeben wurde, keiner ist. Der eigene Typ macht das
 * an der Signatur sichtbar: Wer digital erklärt, MUSS die IP mitliefern.
 */
export interface DigitaleErklaerung {
  /** Die IP der ERKLÄRENDEN Person — nie die eines Bearbeiters. */
  readonly ip: string;
  readonly userAgent: string | undefined;
}

export interface WiderspruchZurueckziehenInput {
  readonly zurueckgenommenAt: string;
  readonly erfassungsweg: Erfassungsweg;
  readonly quelleRef?: string;
}

/**
 * Der Zweck, dessen Widerspruch ein Bestandsmerkmal setzt.
 *
 * Bewusst eine benannte Konstante und keine verstreute Zeichenkette: Die
 * Kopplung zwischen Erklärung und Attribut ist die einzige Stelle, an der
 * dieser Dienst über den Consent-Bestand hinaus wirkt, und sie soll auffindbar
 * sein.
 */
const ZWECK_MIT_ATTRIBUT = 'wiss_auswertung';

/**
 * Widerspruch und Abwahl — die andere Hälfte der Rechtsgrundlagen-Matrix
 * (Auflage AW-27, Votum 2026-09-07 V-11d).
 *
 * WAS HIER FEHLTE
 * ---------------
 * `EinwilligungService` deckt die Zwecke ab, die auf `opt_in` stehen. Für die
 * übrigen — `opt_out` und `vertraglich` — gab es **nichts**. Zwei konkrete
 * Folgen:
 *
 *   * Ein Endkunde, der der monatlichen Nutzerinformation widersprach, konnte
 *     nicht dokumentiert werden, obwohl TB-06 das Opt-out ausdrücklich
 *     vorsieht. Der Widerruf ist ihm bei einer vertraglichen Grundlage
 *     verwehrt (V0047, `ck_einwilligung_kein_widerruf_bei_vertrag`) — richtig
 *     so, aber das Gegenstück fehlte.
 *   * Der DE-04-Ausschluss von der wissenschaftlichen Auswertung war ein
 *     Boolean am Endkunden, das ein Bediener im Formular setzen konnte. Ein
 *     Boolean hat keine Geschichte: Wer wann auf welchem Weg widersprochen
 *     hat, stand nirgends — und für Art. 15 und Art. 5 Abs. 2 ist genau das
 *     die Frage.
 *
 * DIE ARBEITSTEILUNG
 * ------------------
 * **Führend für die Wirkung bleibt das Attribut.** Export- und
 * Auswertungsfilter prüfen weiterhin genau einen Ort,
 * `von_wiss_auswertung_ausgenommen`, fail-closed. Zwei Prüfpfade für dieselbe
 * Frage wären die nächste Falle.
 *
 * **Führend für den Nachweis ist diese Erklärung.** Sie setzt das Attribut —
 * und **nie umgekehrt von Hand**. Der Schreibpfad über das
 * Endkunden-Formular ist mit diesem Commit entfallen.
 *
 * WAS DIE DATENBANK ERZWINGT, STEHT NICHT NOCH EINMAL HIER
 * --------------------------------------------------------
 * Dass gegen einen Opt-in-Zweck nicht widersprochen werden kann, sichert
 * V0052 über einen zusammengesetzten Fremdschlüssel auf die Matrix plus
 * `ck_widerspruch_kein_opt_in`. Dieser Dienst prüft es trotzdem — nicht als
 * Redundanz, sondern um eine verständliche Meldung zu geben statt eines
 * Constraint-Namens. Die Sicherung ist die Datenbank; die Erklärung ist hier.
 */
@Injectable()
export class WiderspruchService {
  constructor(
    private readonly repository: WiderspruchRepository,
    private readonly consentRepository: ConsentRepository,
    // Nur fuer den DIGITALEN Weg (Nutzerportal): Der Beleg traegt die IP der
    // erklaerenden Person, feldverschluesselt unter ihrem Subjekt-Schluessel.
    private readonly belegRepository: WiderspruchBelegRepository,
    private readonly piiRepository: IdentityEndkundePiiRepository,
    private readonly subjektSchluesselRepository: IdentitySubjektSchluesselRepository,
    private readonly fieldCipher: FieldCipherService,
    @Inject(KEY_MANAGEMENT_PORT) private readonly keyManagementPort: KeyManagementPort,
  ) {}

  /**
   * Der DIGITALE Widerspruch — erklaert von der betroffenen Person selbst,
   * im Nutzerportal.
   *
   * **Warum eine eigene Methode und kein Parameter an `erklaere()`.** Der
   * digitale Weg hat eine andere Voraussetzung: Er VERLANGT die IP (DS-03,
   * DB-CHECK in V0069). Als optionales Feld an der bestehenden Signatur
   * waere das eine Bedingung, die man vergessen kann; als eigene Signatur
   * ist sie unuebersehbar.
   *
   * `erklaerung.policy.ts` sperrt `digital_opt_in` fuer die BETRIEBSSICHT —
   * und nennt selbst den Grund, warum das hier anders ist: „`digital_opt_in`
   * entsteht erst im Nutzerportal, wo die betroffene Person selbst handelt."
   * Die dort verfuegbare IP ist ihre.
   */
  @Transactional(Propagation.Nested)
  async erklaereDigital(
    input: Omit<WiderspruchErklaerenInput, 'erfassungsweg'>,
    digital: DigitaleErklaerung,
  ): Promise<WiderspruchItem> {
    if (input.subjektTyp !== 'endkunde') {
      // Nur Endkunden haben einen Portal-Zugang. Ein Anschlussnutzer koennte
      // hier gar nicht angemeldet sein — die Pruefung steht trotzdem da,
      // damit ein spaeterer zweiter Aufrufer nicht still in einen Pfad
      // laeuft, der seinen Schluessel nicht aufloesen kann.
      throw new BadRequestException('Der digitale Widerspruch ist nur fuer Endkunden vorgesehen.');
    }

    const item = await this.erklaereIntern({ ...input, erfassungsweg: 'digital_opt_in' });
    await this.schreibeDigitalenBeleg(input.subjektId, item.id, 'erklaerung', digital);
    return item;
  }

  /** Die Ruecknahme desselben Wegs — mit eigenem Beleg (V0069 `art='ruecknahme'`). */
  @Transactional(Propagation.Nested)
  async nimmZurueckDigital(id: string, endkundeId: string, digital: DigitaleErklaerung): Promise<WiderspruchItem> {
    const item = await this.nimmZurueckIntern(id, {
      zurueckgenommenAt: new Date().toISOString(),
      erfassungsweg: 'digital_opt_in',
    });
    await this.schreibeDigitalenBeleg(endkundeId, id, 'ruecknahme', digital);
    return item;
  }

  /**
   * Schreibt den Beleg mit feldverschluesselter IP.
   *
   * Der Schluessel ist der des SUBJEKTS — damit macht ein Krypto-Shred
   * (ADR-0009) saemtliche Belege dieser Person in einem Zug unlesbar, ohne
   * dass ein Loeschjob sie einzeln aufsuchen muss.
   */
  private async schreibeDigitalenBeleg(
    endkundeId: string,
    widerspruchId: string,
    art: 'erklaerung' | 'ruecknahme',
    digital: DigitaleErklaerung,
  ): Promise<void> {
    const pii = await this.piiRepository.findByPseudonymId(endkundeId);
    if (pii === undefined) {
      throw new NotFoundException(`Zu Endkunde ${endkundeId} existiert kein Stammdatensatz.`);
    }
    const schluessel = await this.subjektSchluesselRepository.findById(pii.cryptoKeyId);
    if (schluessel === undefined || schluessel.keyState === 'geschreddert') {
      throw new ConflictException(
        'Der Subjekt-Schluessel ist geschreddert (Art. 17) — es kann kein neuer Beleg mehr verschluesselt werden.',
      );
    }

    const dek = await this.keyManagementPort.unwrapDek({
      wrappedDek: schluessel.wrappedDek,
      kmsKeyId: schluessel.kmsKeyId,
      algVersion: schluessel.algVersion,
    });

    const belegId = randomUUID();
    await this.belegRepository.insert({
      id: belegId,
      widerspruchId,
      cryptoKeyId: pii.cryptoKeyId,
      art,
      erfassungsweg: 'digital_opt_in',
      erfasstAt: new Date(),
      ipEnc: this.fieldCipher.encrypt(dek, belegId, 'widerspruch_ip', digital.ip),
      userAgentEnc:
        digital.userAgent === undefined
          ? undefined
          : this.fieldCipher.encrypt(dek, belegId, 'widerspruch_user_agent', digital.userAgent),
    });
  }

  async findeFuerSubjekt(subjektTyp: SubjektTyp, subjektId: string): Promise<WiderspruchItem[]> {
    return this.repository.findFuerSubjekt(subjektTyp, subjektId);
  }

  @Transactional(Propagation.Nested)
  async erklaere(input: WiderspruchErklaerenInput): Promise<WiderspruchItem> {
    pruefeErfassungsweg(
      input.erfassungsweg,
      'Ein digital erklaerter Widerspruch kann ueber die Betriebssicht nicht erfasst werden — dieselbe ' +
        'Begruendung wie bei der Einwilligung: Die dabei zu protokollierende IP-Adresse waere die des ' +
        'Bearbeiters, nicht die der betroffenen Person.',
    );
    return this.erklaereIntern(input);
  }

  /**
   * Der gemeinsame Kern beider Wege — ALLES ausser der Frage, ob der
   * Erfassungsweg zulaessig ist.
   *
   * Die Trennung ist der ganze Punkt: Betriebssicht und Portal duerfen sich
   * beim ERFASSUNGSWEG unterscheiden und sonst in NICHTS. Zwei Kopien der
   * Opt-in-Abgrenzung, der Doppelerklaerungs-Sperre und der Attribut-Wirkung
   * waeren frueher oder spaeter auseinandergelaufen — und zwar an der Stelle,
   * an der es am teuersten ist.
   */
  @Transactional(Propagation.Nested)
  private async erklaereIntern(input: WiderspruchErklaerenInput): Promise<WiderspruchItem> {
    const regel = await this.findeRegel(input.subjektTyp, input.zweckCode);

    if (regel.erlaubnismodus === 'opt_in') {
      // Gegen etwas, das nur mit Einwilligung laeuft, widerspricht man nicht
      // — man widerruft. Wer beides vermischt, schreibt dem Betroffenen mal
      // ein Recht zu, das er nicht hat, und verschweigt mal eines, das er hat.
      throw new BadRequestException(
        `"${input.zweckCode}" beruht bei einem ${input.subjektTyp} auf einer Einwilligung. Dagegen ` +
          'widerspricht man nicht, sondern widerruft sie (Art. 7 Abs. 3) — ueber ' +
          'POST /consent/einwilligungen/{id}/widerruf.',
      );
    }

    if (!(await this.repository.subjektExistiert(input.subjektTyp, input.subjektId))) {
      throw new NotFoundException(
        `Zu ${input.subjektTyp} ${input.subjektId} existiert kein Datensatz. Ein Widerspruch braucht ` +
          'jemanden, der ihn erklaert.',
      );
    }

    const erklaertAt = pruefeErklaerungszeitpunkt(input.erklaertAt, new Date(), 'erklaertAt');

    const bestehend = await this.findeWirksamen(input.subjektTyp, input.subjektId, input.zweckCode);
    if (bestehend !== undefined) {
      // Kein stiller Erfolg: Ein zweiter Widerspruch waere ein zweiter
      // Erklaerungszeitpunkt zur selben Sache, und welcher gilt, koennte
      // niemand mehr sagen.
      throw new ConflictException(
        `Zu "${input.zweckCode}" besteht bereits ein wirksamer Widerspruch (erklaert am ` +
          `${bestehend.erklaertAt}). Nehmen Sie ihn zuerst zurueck, wenn eine neue Erklaerung ` +
          'erfasst werden soll.',
      );
    }

    const id = randomUUID();
    await this.repository.insert({
      id,
      subjektTyp: input.subjektTyp,
      subjektId: input.subjektId,
      zweckCode: input.zweckCode,
      erlaubnismodus: regel.erlaubnismodus,
      erklaertAt,
      erfassungsweg: input.erfassungsweg,
      quelleRef: input.quelleRef,
    });

    await this.wirkeAufAttribut(input.subjektTyp, input.subjektId, input.zweckCode, true);

    return this.ladeOderWirf(id);
  }

  /**
   * Nimmt einen Widerspruch zurück.
   *
   * Die Zeile bleibt erhalten. Würde sie gelöscht, verschwände auch der
   * Nachweis über den Zeitraum, in dem widersprochen war — und genau der
   * entscheidet, ob eine Verarbeitung in dieser Zeit zulässig war.
   */
  @Transactional(Propagation.Nested)
  async nimmZurueck(id: string, input: WiderspruchZurueckziehenInput): Promise<WiderspruchItem> {
    pruefeErfassungsweg(
      input.erfassungsweg,
      'Eine digital erklaerte Ruecknahme kann ueber die Betriebssicht nicht erfasst werden — dieselbe ' +
        'Begruendung wie beim Erklaeren.',
    );
    return this.nimmZurueckIntern(id, input);
  }

  /** Der gemeinsame Kern der Ruecknahme — s. `erklaereIntern`. */
  @Transactional(Propagation.Nested)
  private async nimmZurueckIntern(id: string, input: WiderspruchZurueckziehenInput): Promise<WiderspruchItem> {
    const vorher = await this.repository.findById(id);
    if (vorher === undefined) {
      throw new NotFoundException(`Widerspruch ${id} existiert nicht.`);
    }
    if (!vorher.wirksam) {
      throw new ConflictException(
        `Dieser Widerspruch wurde bereits am ${vorher.zurueckgenommenAt ?? '?'} zurueckgenommen. Der ` +
          'urspruengliche Zeitpunkt bleibt stehen — er sagt, ab wann wieder verarbeitet werden durfte.',
      );
    }

    const zurueckgenommenAt = pruefeErklaerungszeitpunkt(
      input.zurueckgenommenAt,
      new Date(),
      'zurueckgenommenAt',
    );
    if (zurueckgenommenAt.getTime() < Date.parse(vorher.erklaertAt)) {
      throw new BadRequestException(
        'Die Ruecknahme kann nicht vor der Erklaerung liegen. Pruefen Sie das Datum.',
      );
    }

    const erfolgreich = await this.repository.nimmZurueck({
      id,
      zurueckgenommenAt,
      erfassungsweg: input.erfassungsweg,
      quelleRef: input.quelleRef,
    });
    if (!erfolgreich) {
      // Zwischen Lesen und Schreiben hat jemand anderes zurueckgenommen.
      throw new ConflictException('Dieser Widerspruch wurde zwischenzeitlich zurueckgenommen.');
    }

    await this.wirkeAufAttribut(vorher.subjektTyp, vorher.subjektId, vorher.zweckCode, false);

    return this.ladeOderWirf(id);
  }

  /**
   * Setzt das DE-04-Attribut, wenn der Zweck es trägt.
   *
   * Die Kopplung läuft bewusst NUR in diese Richtung. Das Attribut ist die
   * Durchsetzungsstelle, die Erklärung ist der Grund — und ein Grund, der
   * einem Zustand hinterherläuft, ist keiner.
   */
  private async wirkeAufAttribut(
    subjektTyp: SubjektTyp,
    subjektId: string,
    zweckCode: string,
    ausgenommen: boolean,
  ): Promise<void> {
    if (zweckCode !== ZWECK_MIT_ATTRIBUT) {
      return;
    }
    await this.repository.setzeWissAuswertungAusgenommen(subjektTyp, subjektId, ausgenommen);
  }

  private async findeRegel(
    subjektTyp: SubjektTyp,
    zweckCode: string,
  ): Promise<{ readonly erlaubnismodus: 'opt_in' | 'opt_out' | 'vertraglich' }> {
    const matrix = await this.consentRepository.findMatrixFuerSubjektTyp(subjektTyp);
    const regel = matrix.find((r) => r.zweckCode === zweckCode);
    if (regel === undefined) {
      throw new BadRequestException(
        `Fuer "${zweckCode}" ist bei einem ${subjektTyp} keine Rechtsgrundlage hinterlegt. Dieser Zweck ` +
          'ist fuer diese Subjektart nicht vorgesehen.',
      );
    }
    return regel;
  }

  private async findeWirksamen(
    subjektTyp: SubjektTyp,
    subjektId: string,
    zweckCode: string,
  ): Promise<WiderspruchItem | undefined> {
    const alle = await this.repository.findFuerSubjekt(subjektTyp, subjektId);
    return alle.find((w) => w.zweckCode === zweckCode && w.wirksam);
  }

  private async ladeOderWirf(id: string): Promise<WiderspruchItem> {
    const geladen = await this.repository.findById(id);
    if (geladen === undefined) {
      throw new Error('Widerspruch wurde geschrieben, ist aber nicht lesbar — unerwarteter DB-Zustand.');
    }
    return geladen;
  }
}
