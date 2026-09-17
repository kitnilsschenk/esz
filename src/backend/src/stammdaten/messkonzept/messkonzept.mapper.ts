import type {
  MesskonzeptVersion,
  MesskonzeptVersionEnergietraeger,
} from '../persistence/energy/energy-messkonzept.repository';
import type { EnergietraegerBaseline, MesskonzeptVersionDetail, MesskonzeptVersionListItem } from './messkonzept.types';

export function mapMesskonzeptVersionListItem(version: MesskonzeptVersion): MesskonzeptVersionListItem {
  return {
    versionNr: version.versionNr,
    typ: version.typ,
    gueltigVon: version.gueltigVon,
    gueltigBis: version.gueltigBis,
    createdAt: version.createdAt,
  };
}

function mapEnergietraeger(eintrag: MesskonzeptVersionEnergietraeger): EnergietraegerBaseline {
  return {
    mvetId: eintrag.id,
    energietraeger: eintrag.energietraeger,
    baselineWert: eintrag.baselineWert,
    baselineEinheit: eintrag.baselineEinheit,
    baselineMethode: eintrag.baselineMethode,
    baselineBegruendung: eintrag.baselineBegruendung,
    baselineAbrechnungenAnzahl: eintrag.baselineAbrechnungenAnzahl,
    baselineBelegAktenzeichen: eintrag.baselineBelegAktenzeichen,
    baselineBelegAblageort: eintrag.baselineBelegAblageort,
    baselineBelegRef: eintrag.baselineBelegRef,
    energietraegerSubstitution: eintrag.energietraegerSubstitution,
  };
}

export function mapMesskonzeptVersionDetail(
  version: MesskonzeptVersion,
  energietraeger: readonly MesskonzeptVersionEnergietraeger[],
): MesskonzeptVersionDetail {
  return {
    versionNr: version.versionNr,
    typ: version.typ,
    systemgrenze: version.systemgrenze,
    systembeschreibung: version.systembeschreibung,
    bereinigungsverfahren: version.bereinigungsverfahren,
    messgeraeteWahl: version.messgeraeteWahl,
    geraeteerkennungsVerfahren: version.geraeteerkennungsVerfahren,
    aenderungsgrund: version.aenderungsgrund,
    gueltigVon: version.gueltigVon,
    gueltigBis: version.gueltigBis,
    energietraeger: energietraeger.map(mapEnergietraeger),
    createdAt: version.createdAt,
  };
}
