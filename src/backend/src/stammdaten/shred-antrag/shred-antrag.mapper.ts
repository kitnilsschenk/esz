import type { ShredAntrag } from '../persistence/energy/energy-endkunde-shred-antrag.repository';
import type { ShredAntragDetail } from './shred-antrag.types';

/** mapRow-Konvention (ADR-0008 §20, A6) — Energy-Zeile -> API-Projektion (PII-frei, Linie 2). */
export function mapShredAntragDetail(antrag: ShredAntrag): ShredAntragDetail {
  return {
    id: antrag.id,
    endkundeId: antrag.endkundeId,
    status: antrag.status,
    grund: antrag.grund,
    beantragtVonSub: antrag.beantragtVonSub,
    beantragtAm: antrag.beantragtAm,
    freigeberSub: antrag.freigeberSub,
    entschiedenAm: antrag.entschiedenAm,
    ablehnungsgrund: antrag.ablehnungsgrund,
    gueltigBis: antrag.gueltigBis,
    createdAt: antrag.createdAt,
    updatedAt: antrag.updatedAt,
  };
}
