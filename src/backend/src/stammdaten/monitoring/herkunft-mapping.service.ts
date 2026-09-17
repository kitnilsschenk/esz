import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { HerkunftMappingRepository } from '../persistence/ingest/herkunft-mapping.repository';
import { loadIngestQuelleCode } from '../../ingest-worker/config/ingest-quelle.config';
import type { HerkunftMappingAnlegenDto } from './dto/herkunft-mapping-anlegen.dto';
import type { HerkunftMappingItem } from './herkunft-mapping.types';

/**
 * Postgres-Fehlercodes, die V0042 auslösen kann. Als benannte Konstanten,
 * weil ein nackter String wie `'23P01'` an der Vergleichsstelle nichts
 * erklärt.
 */
const PG_UNIQUE_VERLETZUNG = '23505';
const PG_FREMDSCHLUESSEL_VERLETZUNG = '23503';
const PG_EXCLUDE_VERLETZUNG = '23P01';

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
 * Pflege der Herkunfts-Zuordnung (ADR-0011 B2/D3).
 *
 * **Warum es hier kein „Ändern" gibt.** Eine Zuordnung umzuhängen heißt,
 * unter derselben Kennung eine ANDERE Aussage zu führen — im Protokoll
 * stünde dann ein `geändert` ohne den vorherigen Stand. Entfernen und neu
 * anlegen erzeugt stattdessen zwei Audit-Zeilen, aus denen der Übergang
 * lückenlos hervorgeht (V0043). Für eine Tabelle, die mitentscheidet, WESSEN
 * Messwerte eingespeist werden, ist das die richtige Seite des
 * Bequemlichkeits-Kompromisses.
 *
 * **Warum die Invarianten nicht vorab geprüft werden.** Die drei Constraints
 * aus V0042 sind die Wahrheit. Sie im Service nachzubauen hieße, eine zweite
 * zu pflegen, die unter Nebenläufigkeit ohnehin nicht hält (zwischen Prüfung
 * und Insert kann eine andere Sitzung schreiben). Der Service übersetzt
 * stattdessen den DB-Fehler in eine Antwort, die dem Aufrufer sagt, WELCHE
 * Regel gegriffen hat — ein nacktes 500 wäre für die Pflege-Oberfläche
 * unbrauchbar.
 *
 * **Warum `Propagation.Nested` hier tragend ist.** Der Savepoint (ADR-0002
 * §18) ist die Bedingung dafür, dass die Übersetzung oben überhaupt beim
 * Aufrufer ankommt: Ohne ihn bricht der Constraint-Verstoß die GESAMTE
 * Request-Transaktion ab, der Audit-Schreibpfad des Interceptors läuft in
 * „current transaction is aborted" — und aus jedem der drei sorgfältig
 * formulierten 4xx wird genau das nackte 500, das dieser Service vermeiden
 * will. Belegt in `herkunft-mapping.integration.spec.ts`.
 */
@Injectable()
export class HerkunftMappingService {
  constructor(private readonly repository: HerkunftMappingRepository) {}

  @Transactional(Propagation.Nested)
  async liste(): Promise<readonly HerkunftMappingItem[]> {
    return this.repository.findAlle();
  }

  @Transactional(Propagation.Nested)
  async anlegen(dto: HerkunftMappingAnlegenDto): Promise<HerkunftMappingItem> {
    try {
      return await this.repository.insert({
        id: randomUUID(),
        // Ohne Angabe die Kennung DIESES Deployments — bei genau einem
        // Netzserver muss sie damit niemand tippen (ADR-0011 D8).
        quelleCode: dto.quelleCode ?? loadIngestQuelleCode(),
        chirpstackTenantId: dto.chirpstackTenantId,
        chirpstackApplicationId: dto.chirpstackApplicationId,
        endkundeId: dto.endkundeId,
        standortId: dto.standortId,
      });
    } catch (error: unknown) {
      throw this.uebersetzeConstraintFehler(error);
    }
  }

  @Transactional(Propagation.Nested)
  async entfernen(id: string): Promise<HerkunftMappingItem> {
    // Erst lesen, dann löschen: Der Audit-Kontext (V0043) braucht die vier
    // Fach-Kennungen der Zeile, die es GLEICH NICHT MEHR GIBT. Ohne sie wäre
    // aus dem Protokoll nicht rekonstruierbar, welche Zuordnung verschwunden
    // ist — genau die Frage bei einem stillgewordenen Abgleich.
    const vorher = await this.repository.findById(id);
    if (vorher === undefined) {
      throw new NotFoundException(`Herkunfts-Zuordnung ${id} existiert nicht.`);
    }

    await this.repository.delete(id);
    return vorher;
  }

  private uebersetzeConstraintFehler(error: unknown): Error {
    const pg = alsPostgresFehler(error);
    if (pg === undefined) {
      return error instanceof Error ? error : new Error('Unbekannter Fehler beim Anlegen der Herkunfts-Zuordnung.');
    }

    if (pg.code === PG_UNIQUE_VERLETZUNG && pg.constraint === 'ux_herkunft_mapping_application') {
      return new ConflictException(
        'Diese ChirpStack-Application ist bereits zugeordnet. Eine Application gehoert zu genau einem Standort — ' +
          'entfernen Sie die bestehende Zuordnung, bevor Sie eine neue anlegen.',
      );
    }

    if (pg.code === PG_EXCLUDE_VERLETZUNG && pg.constraint === 'ex_herkunft_mapping_tenant_ein_endkunde') {
      return new ConflictException(
        'Dieser ChirpStack-Tenant ist bereits einem ANDEREN Endkunden zugeordnet. Ein Tenant gehoert zu genau einem ' +
          'Endkunden; mehrere Gebaeude desselben Endkunden sind dagegen zulaessig.',
      );
    }

    if (pg.code === PG_FREMDSCHLUESSEL_VERLETZUNG && pg.constraint === 'fk_herkunft_mapping_standort_mandant') {
      return new BadRequestException(
        'Der angegebene Standort gehoert nicht zu diesem Endkunden (oder existiert nicht). Pruefen Sie, ob ' +
          'standortId und endkundeId zusammenpassen.',
      );
    }

    // Alles Übrige bleibt ein echter Fehler. Ihn hier in eine 4xx zu
    // verwandeln hieße, dem Aufrufer die Schuld für etwas zu geben, dessen
    // Ursache wir nicht kennen.
    return error instanceof Error ? error : new Error('Unbekannter DB-Fehler beim Anlegen der Herkunfts-Zuordnung.');
  }
}
