import { Injectable } from '@nestjs/common';
import type { SecurityContext } from '../../common/security/security-context';

export type StammdatenVerarbeitungsStatus = 'aktiv' | 'gesperrt' | 'geloescht';

export interface PiiProjektionsResourceAttrs {
  readonly verarbeitungsStatus: StammdatenVerarbeitungsStatus;
}

/**
 * ADR-0008 §18 (D6, DS-07-Innensicht) — eigenständiges, `@Injectable`-,
 * unit-testbares Policy-Artefakt (`access-control-engineer`-Votum 4: KEIN
 * inline `roles.includes(...)` im Service/Mapper, Studio-Regel "kein
 * String-Matching auf Rollen im Business-Code" — diese Klasse IST die
 * kontrollierte Stelle dafür).
 *
 * Entscheidet NACH einem bereits erteilten PDP-`permit` (RBAC lässt sowohl
 * `betrieb` als auch `compliance-auditor` auf die Detail-Route, D2/D6-
 * Auflösung, ADR-0008 §14 Punkt 3), OB der `stammdatenPii`-Block befüllt
 * (feldentschlüsselt) oder `null` bleibt.
 *
 * FAIL-CLOSED-DEFAULT (verbindlich, §18): jede Rolle AUSSER explizit
 * berechtigt → maskiert/`null`. Berechtigt in v1: NUR `betrieb`, UND NUR bei
 * `verarbeitungsStatus==='aktiv'`. `compliance-auditor` → IMMER maskiert
 * (Nachweissicht ohne Klartext-PII); `gesperrt`/`geloescht` → maskiert
 * (Art. 18/Krypto-Shredding); unbekannte/künftige Rolle → maskiert.
 *
 * Der Mapper/Service ruft `IdentityRepository`+`FieldCipherService` ERST
 * NACH `darfPiiSehen()===true` — KEIN PII-Entschlüsseln "auf Vorrat" (§18).
 */
@Injectable()
export class PiiProjektionsPolicy {
  darfPiiSehen(subject: SecurityContext, resource: PiiProjektionsResourceAttrs): boolean {
    // Defense-in-Depth: compliance-auditor EXPLIZIT zuerst ausschließen,
    // selbst wenn ein künftiger Rollen-Mix (sollte laut DS-01 nicht
    // vorkommen) sowohl 'betrieb' als auch 'compliance-auditor' trüge.
    if (subject.roles.includes('compliance-auditor')) {
      return false;
    }

    if (!subject.roles.includes('betrieb')) {
      return false;
    }

    return resource.verarbeitungsStatus === 'aktiv';
  }
}
