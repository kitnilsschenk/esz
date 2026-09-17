import { Injectable } from '@nestjs/common';

export const EDMS_INGEST_CONSENT_ENFORCEMENT = 'EDMS_INGEST_CONSENT_ENFORCEMENT';
export const EDMS_INGEST_CONSENT_ENFORCEMENT_FREIGABE_REF = 'EDMS_INGEST_CONSENT_ENFORCEMENT_FREIGABE_REF';

function parseFlag(raw: string | undefined): boolean {
  if (raw === undefined) {
    return false; // Default AUS (ADR-0012 §9: Scharfschaltung braucht die User-Freigabe).
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  throw new Error(
    `${EDMS_INGEST_CONSENT_ENFORCEMENT}='${raw}' ist ungueltig (erlaubt: 'true'|'false') — fail-closed ` +
      '(ADR-0012 E5, Stufe C).',
  );
}

function parseFreigabeRef(raw: string | undefined): string | undefined {
  const wert = raw?.trim();
  return wert === undefined || wert.length === 0 ? undefined : wert;
}

/**
 * ADR-0012 E5 (Stufe C) — der Schalter fuer die Rechtsgrundlagen-
 * Durchsetzung im Ingest-Schreibpfad.
 *
 * **DIE ENTSCHEIDENDE GRENZE.** Diese Migration/dieser Code baut den
 * MECHANISMUS (`consent.ingest_rechtsgrundlage_wirksam(...)`,
 * `ConsentGateRepository`, der Aufruf in `IngestFlowService`). Sie schaltet
 * ihn NICHT scharf. Im Aus-Zustand (Default) verhaelt sich der Worker EXAKT
 * wie vor dieser Aenderung — `IngestFlowService` ruft den Gate-Check dann
 * gar nicht erst auf (s. dortiger Kommentar).
 *
 * **WER DEN SCHALTER UMLEGEN DARF UND WAS VORHER VORLIEGEN MUSS.**
 *
 * ADR-0012 §9 (Nachtrag 2026-09-07) ist hier woertlich zu nehmen: "Stufe C
 * bleibt ungebaut ... die Scharfschaltung braucht dennoch die
 * User-Freigabe und faellt unter das fortbestehende Veto gegen die
 * Oeffnung des Ingest-Gates." Diese Klasse selbst kann eine Freigabe nicht
 * pruefen (ein ENV-Wert ist kein Freigabe-Nachweis) — sie erzwingt aber
 * technisch, dass jemand eine BEHAUPTET, bevor der Schalter ueberhaupt
 * wirkt: `EDMS_INGEST_CONSENT_ENFORCEMENT=true` OHNE eine nicht-leere
 * `EDMS_INGEST_CONSENT_ENFORCEMENT_FREIGABE_REF` ist ein Fehlstart. Das ist
 * dieselbe Grundidee wie `EDMS_GATE_FREIGABE_REF`, die `ingest-broker-mode.
 * config.ts` fuer den Real-Broker-Uebergang bereits als noch fehlenden
 * Baustein benennt — hier ist sie bereits umgesetzt, weil ADR-0012 E5 sie
 * ausdruecklich verlangt (A12-18/19: Review-Bedarf, unveraendert).
 *
 * Der eigentliche Schalter ist ein ENV-Wert in der Deployment-Konfiguration
 * — derselbe geschuetzte Pfad wie `deployment/**`/`compliance/**`
 * (Projektleitlinien-Kollaborationsprotokoll: "Keine Schreibaktionen ohne explizite
 * Freigabe ... Policy-Dateien, compliance/**, deployment/**"). Ihn
 * umzulegen ist damit KEINE Code-Aenderung, die ein Agent ohne Weiteres
 * vornimmt, sondern eine Betriebsentscheidung, die VORAUSSETZT:
 *
 *   1. Eine ausdrueckliche **User-Freigabe** fuer genau diese Scharf-
 *      schaltung (nicht "das ADR ist gebaut" — das genuegt laut §9
 *      NICHT).
 *   2. Ein `compliance-director`-Votum, das diese Freigabe begleitet
 *      (Kollaborationsprotokoll: "Bei DSGVO-relevanten Aenderungen: zuerst
 *      compliance-director konsultieren").
 *   3. `EDMS_INGEST_CONSENT_ENFORCEMENT_FREIGABE_REF` referenziert dieses
 *      Votum/diese Freigabe (Commit-Hash, Dokumentpfad o. ae.) — als
 *      Klartext im Log sichtbar (s. `worker-main.ts`-Log, NUR der Wert,
 *      nie Secrets), damit im Betrieb nachvollziehbar bleibt, WORAUF sich
 *      die Scharfschaltung stuetzt.
 *   4. Fachlich ist O1 zwar entschieden (ADR-0012 §7, V0047/V0050) — die
 *      Migration V0080 ist aber, solange sie im Scratchpad statt unter
 *      `migrations/` liegt, selbst noch NICHT angewendet. Ohne die
 *      angewendete Migration existiert die Funktion nicht, und ein
 *      `enforced=true` ohne sie laesst JEDEN Uplink mit einem DB-Fehler
 *      scheitern (kein stiller Fallback) — das ist beabsichtigt fail-
 *      closed, aber es bedeutet: **Migration zuerst regulaer durch
 *      `database-lead`/`compliance-director` freigeben, dann erst der
 *      Schalter.**
 *
 * Wer NICHT ausreicht, um den Schalter umzulegen: ein einzelner Agent, ein
 * Code-Review ohne die oben genannten Rollen, ein "es sieht fertig aus".
 */
@Injectable()
export class ConsentEnforcementConfig {
  readonly enforced: boolean;
  readonly freigabeRef: string | undefined;

  constructor() {
    this.enforced = parseFlag(process.env[EDMS_INGEST_CONSENT_ENFORCEMENT]);
    this.freigabeRef = parseFreigabeRef(process.env[EDMS_INGEST_CONSENT_ENFORCEMENT_FREIGABE_REF]);
    this.assertInvariants();
  }

  private assertInvariants(): void {
    if (this.enforced && this.freigabeRef === undefined) {
      throw new Error(
        `${EDMS_INGEST_CONSENT_ENFORCEMENT}=true erfordert eine nicht-leere ` +
          `${EDMS_INGEST_CONSENT_ENFORCEMENT_FREIGABE_REF} (Referenz auf die compliance-director-/` +
          'User-Freigabe der Scharfschaltung, ADR-0012 §9) — fail-closed.',
      );
    }
  }
}
