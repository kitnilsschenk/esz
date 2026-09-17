import { randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import type { SecurityContext } from '../../common/security/security-context';
import { AuditService } from '../../audit/audit.service';
import {
  EnergyEndkundeShredAntragRepository,
  PG_UNIQUE_VIOLATION,
} from '../persistence/energy/energy-endkunde-shred-antrag.repository';
import type { ShredAntrag } from '../persistence/energy/energy-endkunde-shred-antrag.repository';
import { EnergyEndkundeRepository } from '../persistence/energy/energy-endkunde.repository';
import { hatPgErrorCode } from '../persistence/pg-error.util';
import { paginate } from '../persistence/cursor.util';
import { toSeite } from '../common/seite.dto';
import type { Seite } from '../common/seite.dto';
import { konflikt, nichtGefunden } from '../common/problem.util';
import { EndkundeService } from '../endkunde/endkunde.service';
import type { ShreddingErgebnis } from '../endkunde/endkunde.types';
import type { KryptoShreddingAnweisungDto } from '../endkunde/dto/krypto-shredding-anweisung.dto';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { berechneGueltigBis } from './shred-antrag.constants';
import { mapShredAntragDetail } from './shred-antrag.mapper';
import type { ShredAntragDetail, ShredFreigebenErgebnis } from './shred-antrag.types';
import type { ShredAblehnenAnweisungDto } from './dto/shred-ablehnen-anweisung.dto';

/**
 * ADR-0009 — Vier-Augen-/Freigabe-Kontrolle für Krypto-Shredding (Endkunde,
 * Art. 17 DSGVO, Folgeauftrag ADR-0008 §29(C4)). Orchestriert den
 * Antrag→Freigabe/Ablehnung→Ausführung-Workflow; Controller bleibt dünn
 * (`.claude/rules/backend-nestjs.md`).
 *
 * TOCTOU (§2.1/§6): `freigeben()`/`ablehnen()` verlassen sich NICHT auf die
 * vorgelagerte PDP-Statusprüfung (`InCodePolicyAdapter`, ADR-0009 §2.2) als
 * transaktionale Autorität — die bedingten `UPDATE ... WHERE status=$x`-
 * Repository-Methoden mit Affected-Rows-Check via `RETURNING` sind die
 * tatsächliche Autorität. 0 Zeilen -> 409 (ungültiger Zustandsübergang,
 * z. B. Race zwischen zwei parallelen Freigabe-Versuchen).
 *
 * Antrag-Scoping (§2.4/§6): `freigeben()`/`ablehnen()` verifizieren
 * `antrag.endkundeId === endkundeId` UNABHÄNGIG vom bereits im
 * `StammdatenResourceAttributesProvider` erfolgten Scoping-Check (Defense-in-
 * Depth — der Service ist NIE auf die ABAC-Schicht als alleinige Autorität
 * angewiesen, analog `EndkundeService.detail()` etc.).
 *
 * Selbst-Freigabe/-Ablehnung (§2.2): der `InCodePolicyAdapter` verhindert das
 * bereits (403 `vier_augen_selbstfreigabe_verboten`) — die zusätzliche
 * Prüfung hier ist ein Fail-closed-Backstop, damit dieser Service NIE
 * allein auf die vorgelagerte ABAC-Schicht angewiesen ist.
 */
@Injectable()
export class ShredAntragService {
  constructor(
    private readonly shredAntragRepository: EnergyEndkundeShredAntragRepository,
    private readonly endkundeRepository: EnergyEndkundeRepository,
    private readonly endkundeService: EndkundeService,
    private readonly auditService: AuditService,
  ) {}

  async liste(
    endkundeId: string,
    options: { readonly cursor?: string; readonly limit: number },
  ): Promise<Seite<ShredAntragDetail>> {
    const endkunde = await this.endkundeRepository.findById(endkundeId);
    if (endkunde === undefined) {
      throw nichtGefunden('Endkunde');
    }

    const rows = await this.shredAntragRepository.listPage({ endkundeId, ...options });
    const { daten, naechsterCursor } = paginate(rows, options.limit);
    return toSeite(daten.map(mapShredAntragDetail), naechsterCursor, options.limit);
  }

  /**
   * Idempotency-Replay-Vorab-Erkennung (ADR-0009 §2.1/§6): der
   * `IdempotencyKey`-Decorator deckt in v1 NUR Präsenz/Format ab (kein echter
   * Idempotency-Store, dokumentierte Lücke `idempotency-key.decorator.ts`).
   * Ein Retry desselben, bereits erfolgreich gestellten Antrags darf NICHT
   * gegen den partiellen Unique-Index (`ux_endkunde_shred_antrag_offen_je_
   * endkunde`) laufen und einen 500er auslösen — VOR dem Insert wird daher
   * geprüft, ob bereits ein offener Antrag existiert: derselbe Antragsteller
   * -> Replay (bestehender Antrag, kein Duplikat); ein ANDERER Antragsteller
   * -> echter Konflikt (409, die Pflicht-Unique-Index-Regel lässt höchstens
   * einen offenen Antrag je Endkunde zu, §2.1/§5). Der `try/catch` um den
   * tatsächlichen Insert bleibt zusätzlich als Sicherheitsnetz für das
   * verbleibende (sehr kleine) Race-Fenster zwischen Vorab-Check und Insert.
   */
  async beantragen(
    endkundeId: string,
    dto: KryptoShreddingAnweisungDto,
    subject: SecurityContext,
  ): Promise<ShredAntragDetail> {
    const endkunde = await this.endkundeRepository.findById(endkundeId);
    if (endkunde === undefined) {
      throw nichtGefunden('Endkunde');
    }

    const offen = await this.shredAntragRepository.findOffenByEndkunde(endkundeId);
    if (offen !== undefined) {
      if (offen.beantragtVonSub === subject.sub) {
        return mapShredAntragDetail(offen);
      }
      throw konflikt(
        'Es existiert bereits ein offener Shred-Antrag fuer diesen Endkunden (hoechstens ein offener Antrag je Endkunde, ADR-0009 §2.1/§5).',
      );
    }

    try {
      const antrag = await this.beantragenInTx(endkundeId, dto.grund, subject.sub);
      return mapShredAntragDetail(antrag);
    } catch (error: unknown) {
      if (hatPgErrorCode(error, PG_UNIQUE_VIOLATION)) {
        throw konflikt(
          'Es existiert bereits ein offener Shred-Antrag fuer diesen Endkunden (hoechstens ein offener Antrag je Endkunde, ADR-0009 §2.1/§5).',
        );
      }
      throw error;
    }
  }

  @Transactional(Propagation.Nested)
  private async beantragenInTx(endkundeId: string, grund: string, beantragtVonSub: string): Promise<ShredAntrag> {
    const gueltigBis = berechneGueltigBis(new Date());
    return this.shredAntragRepository.insert({
      id: randomUUID(),
      endkundeId,
      grund,
      beantragtVonSub,
      gueltigBis: gueltigBis.toISOString(),
    });
  }

  async ablehnen(
    endkundeId: string,
    antragId: string,
    dto: ShredAblehnenAnweisungDto,
    subject: SecurityContext,
  ): Promise<ShredAntragDetail> {
    const antrag = await this.findScopedOrThrow(endkundeId, antragId);
    this.verweigereSelbstentscheidung(antrag, subject);

    const abgelehnt = await this.shredAntragRepository.ablehnen(antragId, subject.sub, dto.ablehnungsgrund);
    if (abgelehnt === undefined) {
      throw konflikt('Der Antrag wurde bereits entschieden oder ist abgelaufen (ungueltiger Statusuebergang).');
    }

    return mapShredAntragDetail(abgelehnt);
  }

  /**
   * ADR-0009 §2.3 Finding P2 (verbindlich) — Freigeben+Ausführen sind in
   * EINER Transaktion gekoppelt (Impl.-Entscheidung der ADR, §2.1); BEIDE
   * Audit-Ereignisse werden MANUELL, in logischer Reihenfolge
   * (`shred_freigegeben` VOR `geschreddert`), innerhalb derselben Transaktion
   * erzeugt — kein `@AuditAction` auf der Controller-Route (das würde ERST
   * nach dem Handler-Rückgabewert emittieren und `geschreddert` fälschlich
   * eine niedrigere `seq` geben als `shred_freigegeben`).
   */
  async freigeben(
    endkundeId: string,
    antragId: string,
    subject: SecurityContext,
  ): Promise<ShredFreigebenErgebnis> {
    const antrag = await this.findScopedOrThrow(endkundeId, antragId);
    this.verweigereSelbstentscheidung(antrag, subject);

    const { antrag: ausgefuehrt, shredding } = await this.freigebenInTx(endkundeId, antragId, subject);
    return { antrag: mapShredAntragDetail(ausgefuehrt), shredding };
  }

  @Transactional(Propagation.Nested)
  private async freigebenInTx(
    endkundeId: string,
    antragId: string,
    subject: SecurityContext,
  ): Promise<{ readonly antrag: ShredAntrag; readonly shredding: ShreddingErgebnis }> {
    const freigegeben = await this.shredAntragRepository.freigeben(antragId, subject.sub);
    if (freigegeben === undefined) {
      throw konflikt('Der Antrag wurde bereits entschieden oder ist abgelaufen (ungueltiger Statusuebergang).');
    }

    // Reihenfolge FACHLICH BINDEND (ADR-0009 §2.3 Finding P2): shred_freigegeben
    // MUSS vor geschreddert emittiert werden, damit geschreddert die höhere
    // `seq` in der Hash-Kette bekommt (logische Reihenfolge).
    await this.appendAudit(STAMMDATEN_EVENT_CODES.SHRED_FREIGEGEBEN, endkundeId, antragId, subject);

    // ADR-0005 §26.5 — `antragId`/`subject` durchgereicht: `EndkundeService.
    // shred()` orchestriert seit ADR-0005 zusaetzlich die Geraete-Zuordnungs-
    // Shred-Kopplung (device-Dimension) INNERHALB derselben Vier-Augen-Tx.
    const shredding = await this.endkundeService.shred(endkundeId, antragId, subject);

    const ausgefuehrt = await this.shredAntragRepository.markAusgefuehrt(antragId);
    if (ausgefuehrt === undefined) {
      // Struktureller Kontraktbruch: dieselbe Transaktion hat den Antrag
      // soeben selbst auf 'freigegeben' gesetzt — 0 Zeilen hier ist kein
      // Fach-Konflikt, sondern ein unerwarteter DB-Zustand (analog den
      // "INSERT hat keine Zeile zurueckgegeben"-Backstops in den Repos).
      throw new Error(
        'energy.endkunde_shred_antrag: markAusgefuehrt() hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.',
      );
    }

    await this.appendAudit(STAMMDATEN_EVENT_CODES.ENDKUNDE_GESCHREDDERT, endkundeId, antragId, subject);

    return { antrag: ausgefuehrt, shredding };
  }

  private async findScopedOrThrow(endkundeId: string, antragId: string): Promise<ShredAntrag> {
    const antrag = await this.shredAntragRepository.findById(antragId);
    if (antrag === undefined || antrag.endkundeId !== endkundeId) {
      throw nichtGefunden('Shred-Antrag');
    }
    return antrag;
  }

  /** Fail-closed-Backstop — die PDP (`InCodePolicyAdapter`) verhindert dies bereits vorgelagert (403). */
  private verweigereSelbstentscheidung(antrag: ShredAntrag, subject: SecurityContext): void {
    if (antrag.beantragtVonSub === subject.sub) {
      throw new ForbiddenException('vier_augen_selbstfreigabe_verboten');
    }
  }

  /**
   * `kontext.synthetic=true` ist HIER bewusst ein fester Wert (nicht aus dem
   * Request gelesen): die `freigeben`-Route trägt
   * `@UseInterceptors(SyntheticOnlyInterceptor)`, der VOR jedem Handler-Aufruf
   * entweder `request.synthetic=true` setzt oder selbst fail-closed mit
   * `ForbiddenException('synthetic_only_gate_geschlossen')` abbricht (s.
   * dortigen Kommentar) — zum Zeitpunkt dieses Aufrufs ist der Wert also
   * strukturell garantiert `true`.
   */
  private async appendAudit(
    eventTyp: string,
    endkundeId: string,
    antragId: string,
    subject: SecurityContext,
  ): Promise<void> {
    await this.auditService.append({
      eventTyp,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: endkundeId,
      ...(subject.roles.length > 0 ? { actorRolle: subject.roles.join(',') } : {}),
      kontext: { synthetic: true, antrag_id: antragId },
    });
  }
}
