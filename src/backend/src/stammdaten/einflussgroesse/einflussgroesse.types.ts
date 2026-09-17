import type {
  BetroffenerTyp,
  QuelleTyp,
  Rechtsgrundlage,
} from '../persistence/einfluss/einfluss-intervall.repository';
import type { UeberschreitungKlasse } from '../persistence/einfluss/einfluss-befund.repository';

/**
 * `components/schemas/EinflussgroesseDetail` (ADR-0006 Teil B, B8/B10) —
 * `read:einflussgroesse`-Lesestufe, KLARTEXT-PII (A8/B10: "Personenzahl/
 * Nutzflaeche sind der PII-Wert, auch pseudonymisiert"). `wertNum` ist
 * bewusst ein `string` (numeric(18,3)-Praezisionserhalt aus `pg`, s.
 * `EinflussIntervallRepository`-Kommentar) — NIEMALS in `number` gewandelt
 * (Rundungs-/Praezisionsverlust-Risiko bei einem PII-Wert).
 */
export interface EinflussgroesseDetail {
  readonly id: string;
  readonly endkundeId: string;
  readonly systemId: string;
  readonly standortId: string | null;
  readonly groesseCode: string;
  readonly wertNum: string | null;
  readonly wertCode: string | null;
  readonly gueltigAbMonat: string;
  readonly gueltigBisMonat: string | null;
  readonly betroffenerTyp: BetroffenerTyp;
  readonly quelleTyp: QuelleTyp;
  readonly rechtsgrundlage: Rechtsgrundlage;
  readonly abwaegungRef: string | null;
  readonly art14InformationAt: string | null;
  readonly anlassCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * `components/schemas/EinflussgroesseKorrekturErgebnis` — Antwort von
 * `PATCH .../einflussgroessen/{id}`. `neu` ist `null`, wenn der Aufruf NUR
 * geschlossen hat (kein `korrektur`-Body-Feld, s. `EinflussgroesseKorrigierenDto`).
 */
export interface EinflussgroesseKorrekturErgebnis {
  readonly geschlossen: EinflussgroesseDetail;
  readonly neu: EinflussgroesseDetail | null;
}

/** `components/schemas/EinflussgroesseBefundItem` — v1 NUR lesend (Scope-Grenze, s. finale Antwort). */
export interface EinflussgroesseBefundItem {
  readonly id: string;
  readonly systemId: string;
  readonly groesseCode: string;
  readonly zeitraumVon: string;
  readonly zeitraumBis: string;
  readonly ueberschreitungKlasse: UeberschreitungKlasse;
  readonly erkanntAt: string;
}
