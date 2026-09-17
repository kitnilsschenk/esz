import type { ShredAntragStatus } from '../persistence/energy/energy-endkunde-shred-antrag.repository';
import type { ShreddingErgebnis } from '../endkunde/endkunde.types';

/**
 * `components/schemas/ShredAntrag` (stammdaten.openapi.yaml, ADR-0009 §2.1).
 * EIN Schema für Listen-Item UND Einzel-Detail (bewusste Vereinfachung
 * gegenüber dem sonstigen Endkunde/System/Zähler-Muster: hier gibt es KEINE
 * PII zu maskieren — `beantragtVonSub`/`freigeberSub` sind opake, bereits
 * laut Migration `personenbeziehbar=true; pii=false` deklarierte Principals,
 * die das Frontend für die Vier-Augen-UX ohnehin IMMER braucht, s. ADR-0009
 * §2.5 "UI blendet den Freigeben-Button aus, wenn beantragtVonSub ===
 * aktuelle Session-sub").
 */
export interface ShredAntragDetail {
  readonly id: string;
  readonly endkundeId: string;
  readonly status: ShredAntragStatus;
  readonly grund: string;
  readonly beantragtVonSub: string;
  readonly beantragtAm: string;
  readonly freigeberSub: string | null;
  readonly entschiedenAm: string | null;
  readonly ablehnungsgrund: string | null;
  readonly gueltigBis: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** `components/schemas/ShredFreigebenErgebnis` — Antwort der `freigeben`-Route (ADR-0009 §2.4). */
export interface ShredFreigebenErgebnis {
  readonly antrag: ShredAntragDetail;
  readonly shredding: ShreddingErgebnis;
}
