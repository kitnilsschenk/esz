import { Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { AuditService } from '../../audit/audit.service';
import type { SecurityContext } from '../../common/security/security-context';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { EnergyMvetSystemRepository } from '../persistence/energy/energy-mvet-system.repository';
import type { SystemgrenzeEintrag } from '../persistence/energy/energy-mvet-system.repository';
import { nichtGefunden, ungueltigeEingabe } from '../common/problem.util';

export interface SystemgrenzeAntwort {
  readonly mvetId: string;
  readonly energietraeger: string;
  /** Die Systeme IN der Grenze. */
  readonly systeme: readonly SystemgrenzeEintrag[];
  /** Alle Systeme des Endkunden — die Auswahl, aus der die Grenze gebildet wird. */
  readonly waehlbar: readonly SystemgrenzeEintrag[];
  /**
   * `true`, solange die Grenze LEER ist.
   *
   * Dann greift im Berechnungslauf der `endkunde_fallback`: Er nimmt alle
   * aktiven Zähler des Endkunden mit passendem Energieträger. Das ist selten
   * gewollt und soll deshalb sichtbar sein, statt sich still auszuwirken.
   */
  readonly greiftFallback: boolean;
}

/**
 * Die Systemgrenze eines Messkonzept-Energieträgers — welche Systeme ein
 * Berechnungslauf umfasst.
 *
 * **Warum das eine eigene Bedienhandlung ist.** Bis hierher entstand die
 * Zuordnung ausschließlich per SQL. Fehlte sie, rechnete der Lauf trotzdem —
 * nur eben über alle Zähler des Endkunden (`endkunde_fallback`, V0062). Bei
 * einem Kunden mit mehreren Messkonzepten fließt dabei fremder Verbrauch ein,
 * ohne dass irgendwo ein Fehler erscheint. Genau solche stillen Abweichungen
 * gehören vor die Augen des Betriebs.
 */
@Injectable()
export class SystemgrenzeService {
  constructor(
    private readonly repository: EnergyMvetSystemRepository,
    private readonly auditService: AuditService,
  ) {}

  @Transactional(Propagation.Required)
  async lesen(mvetId: string): Promise<SystemgrenzeAntwort> {
    const mvet = await this.repository.findeMvet(mvetId);
    if (mvet === undefined) {
      throw nichtGefunden('Messkonzept-Version-Energietraeger');
    }

    const [systeme, waehlbar] = await Promise.all([
      this.repository.listeFuerMvet(mvetId),
      this.repository.waehlbareSysteme(mvet.endkundeId),
    ]);

    return {
      mvetId,
      energietraeger: mvet.energietraeger,
      systeme,
      waehlbar,
      greiftFallback: systeme.length === 0,
    };
  }

  /**
   * Setzt die Grenze auf genau diese Systeme.
   *
   * Ein System, das nicht diesem Endkunden gehört, wird abgewiesen — die
   * Datenbank hielte es ohnehin über den Mandanten-Fremdschlüssel auf, aber
   * dann als 500 statt als erklärter Fehler.
   *
   * Eine LEERE Menge ist zulässig und bedeutet „zurück zum Fallback". Das ist
   * eine bewusste Entscheidung, die jemand treffen können muss; die Antwort
   * weist sie über `greiftFallback` aus.
   */
  @Transactional(Propagation.Required)
  async setzen(
    mvetId: string,
    systemIds: readonly string[],
    subject: SecurityContext,
    synthetic: boolean,
  ): Promise<SystemgrenzeAntwort> {
    const mvet = await this.repository.findeMvet(mvetId);
    if (mvet === undefined) {
      throw nichtGefunden('Messkonzept-Version-Energietraeger');
    }

    const eindeutig = [...new Set(systemIds)];
    if (eindeutig.length !== systemIds.length) {
      throw ungueltigeEingabe('systemIds enthaelt Doppelungen — die Systemgrenze ist eine Menge.');
    }

    const waehlbar = await this.repository.waehlbareSysteme(mvet.endkundeId);
    const erlaubt = new Set(waehlbar.map((s) => s.systemId));
    const fremde = eindeutig.filter((id) => !erlaubt.has(id));
    if (fremde.length > 0) {
      throw ungueltigeEingabe(
        `${String(fremde.length)} System(e) gehoeren nicht zu diesem Endkunden oder sind stillgelegt. ` +
          'Die Systemgrenze darf nur eigene, aktive Systeme umfassen.',
      );
    }

    const vorher = await this.repository.setze(mvetId, mvet.endkundeId, eindeutig);
    const antwort = await this.lesen(mvetId);

    // Das Ereignis wird HIER emittiert und nicht ueber `@AuditAction`: Der
    // Eintrag soll die Anzahl VORHER tragen, und die kennt nur dieser Dienst
    // — sie steht nicht in der Antwort. Ein Extractor, der sie sich aus dem
    // Ergebnis zu holen versucht, faende sie nicht und liesse den Vorgang mit
    // einem 500 enden statt mit dem echten Statuscode.
    await this.auditService.append({
      eventTyp: STAMMDATEN_EVENT_CODES.MESSKONZEPT_SYSTEMGRENZE_ZUGEORDNET,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: mvetId,
      kontext: {
        synthetic,
        energietraeger: antwort.energietraeger,
        system_anzahl: antwort.systeme.length,
        vorher_anzahl: vorher,
      },
    });

    return antwort;
  }
}
