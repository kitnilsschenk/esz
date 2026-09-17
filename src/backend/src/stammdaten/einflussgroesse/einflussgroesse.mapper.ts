import type { EinflussIntervall } from '../persistence/einfluss/einfluss-intervall.repository';
import type { EinflussBefund } from '../persistence/einfluss/einfluss-befund.repository';
import type { EinflussgroesseBefundItem, EinflussgroesseDetail } from './einflussgroesse.types';

/** mapRow-Konvention (ADR-0008 §20, A6) — `einfluss.intervall`-Zeile -> Klartext-PII-Detail-Projektion (`read:einflussgroesse`). */
export function mapEinflussgroesseDetail(intervall: EinflussIntervall): EinflussgroesseDetail {
  return {
    id: intervall.id,
    endkundeId: intervall.endkundeId,
    systemId: intervall.systemId,
    standortId: intervall.standortId,
    groesseCode: intervall.groesseCode,
    wertNum: intervall.wertNum,
    wertCode: intervall.wertCode,
    gueltigAbMonat: intervall.gueltigAbMonat,
    gueltigBisMonat: intervall.gueltigBisMonat,
    betroffenerTyp: intervall.betroffenerTyp,
    quelleTyp: intervall.quelleTyp,
    rechtsgrundlage: intervall.rechtsgrundlage,
    abwaegungRef: intervall.abwaegungRef,
    art14InformationAt: intervall.art14InformationAt,
    anlassCode: intervall.anlassCode,
    createdAt: intervall.createdAt,
    updatedAt: intervall.updatedAt,
  };
}

/** `einfluss.befund`-Zeile -> Report-Projektion (klassiert, KEIN Rohprozentsatz, B10/B12.5). */
export function mapEinflussgroesseBefundItem(befund: EinflussBefund): EinflussgroesseBefundItem {
  return {
    id: befund.id,
    systemId: befund.systemId,
    groesseCode: befund.groesseCode,
    zeitraumVon: befund.zeitraumVon,
    zeitraumBis: befund.zeitraumBis,
    ueberschreitungKlasse: befund.ueberschreitungKlasse,
    erkanntAt: befund.erkanntAt,
  };
}
