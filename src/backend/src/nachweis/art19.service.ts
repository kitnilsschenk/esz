import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { NACHWEIS_EVENT_CODES } from './audit/nachweis-audit-events';
import { konflikt, nichtGefunden } from '../stammdaten/common/problem.util';
import type { SecurityContext } from '../common/security/security-context';
import {
  Art19PflichtRepository,
  type Art19Anlass,
  type Art19PflichtZeile,
} from './persistence/art19-pflicht.repository';

export interface Art19PflichtItem extends Art19PflichtZeile {
  readonly offen: boolean;
}

export interface Art19PflichtReport {
  readonly items: readonly Art19PflichtItem[];
  readonly offenAnzahl: number;
}

/**
 * Art.-19-Mitteilungspflichten (ADR-0007 A18/A11.12).
 *
 * Der Report MELDET und BELEGT — er teilt nicht selbst mit. Die Ausfuehrung
 * als Korrektur-Einreichung (A18) haengt am BSCW-Weg und wartet auf O-B9;
 * bis dahin erfuellt das Betriebs-Team die Pflicht auf dem verfuegbaren Weg
 * und dokumentiert sie hier.
 *
 * Die Unverhaeltnismaessigkeits-Ausnahme des Art. 19 ist hier bewusst NICHT
 * vorgesehen: es gibt einen Empfaenger, er ist aktenkundig, und die Zuordnung
 * ist eine Abfrage. Eine Ausnahme anzubieten hiesse, sie irgendwann zu nutzen.
 */
@Injectable()
export class Art19Service {
  constructor(
    private readonly pflichtRepository: Art19PflichtRepository,
    private readonly auditService: AuditService,
  ) {}

  async report(): Promise<Art19PflichtReport> {
    const zeilen = await this.pflichtRepository.findPflichten();
    const items = zeilen.map((zeile) => ({ ...zeile, offen: zeile.mitgeteiltAm === null }));

    return { items, offenAnzahl: items.filter((item) => item.offen).length };
  }

  /**
   * Dokumentiert eine erfolgte Mitteilung.
   *
   * Fail-closed gegen das Register: es wird NUR dokumentiert, was tatsaechlich
   * eine Pflicht ist. Eine Mitteilung zu einer Kombination, die gar nicht
   * mitteilungspflichtig ist, waere ein Beleg ohne Gegenstand — und wuerde die
   * Liste der offenen Pflichten verfaelschen, sobald die Kombination spaeter
   * doch entsteht.
   */
  async dokumentiereMitteilung(
    input: {
      readonly einreichungId: string;
      readonly subjektTyp: 'endkunde' | 'anschlussnutzer';
      readonly subjektId: string;
      readonly anlass: Art19Anlass;
      readonly kanal: string;
    },
    subject: SecurityContext,
  ): Promise<Art19PflichtReport> {
    const pflichten = await this.pflichtRepository.findPflichten();
    const passend = pflichten.find(
      (p) =>
        p.einreichungId === input.einreichungId &&
        p.subjektTyp === input.subjektTyp &&
        p.subjektId === input.subjektId &&
        p.anlass === input.anlass,
    );

    if (passend === undefined) {
      throw nichtGefunden('Art.-19-Mitteilungspflicht');
    }

    if (passend.mitgeteiltAm !== null) {
      throw konflikt(
        'Fuer diese Einreichung und dieses Subjekt ist die Mitteilung nach Art. 19 bereits dokumentiert. Eine erneute ' +
          'Meldung desselben Vorgangs wird nicht erfasst — eine spaetere Loeschung nach Art. 17 ist dagegen ein eigener ' +
          'Anlass und wird eigens dokumentiert.',
      );
    }

    await this.pflichtRepository.insertMitteilung({ id: randomUUID(), ...input, mitgeteiltVonSub: subject.sub });

    await this.auditService.append({
      eventTyp: NACHWEIS_EVENT_CODES.ART19_MITGETEILT,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: input.einreichungId,
      // KEIN Grund-Code: der differenzierte Art.-18-Grund verlaesst das System
      // nicht (C4 Punkt 6). `anlass` sagt, WELCHE Rechtsfolge mitgeteilt wurde.
      kontext: { synthetic: true, kanal: input.kanal, anlass: input.anlass },
    });

    return this.report();
  }
}
