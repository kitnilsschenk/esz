import type { Standort } from '../persistence/energy/energy-standort.repository';
import type { ZaehlerStandort } from '../persistence/energy/energy-zaehler-standort.repository';
import type { Zaehler } from '../persistence/energy/energy-zaehler.repository';
import { hatAdresseStrukturell } from './standort.constants';
import type {
  StandortPfadEintrag,
  StandortStruktur,
  ZaehlerStandortAktuellDetail,
  ZaehlerStandortDetail,
  ZaehlerUnterKnotenItem,
} from './standort.types';

/** mapRow-Konvention (ADR-0008 §20, A6) — `energy.standort`-Zeile (+ Zähleranzahl) -> PII-freie Struktur-Projektion. */
export function mapStandortStruktur(standort: Standort, zaehlerAnzahl: number): StandortStruktur {
  return {
    id: standort.id,
    endkundeId: standort.endkundeId,
    parentId: standort.parentId,
    typ: standort.typ,
    pfad: standort.pfad,
    ebene: standort.ebene,
    sortierung: standort.sortierung,
    status: standort.status,
    klimareferenz: standort.klimareferenz,
    hatAdresse: hatAdresseStrukturell(standort.typ, standort.parentId),
    zaehlerAnzahl,
    createdAt: standort.createdAt,
    updatedAt: standort.updatedAt,
  };
}

export function mapZaehlerStandortDetail(zaehlerStandort: ZaehlerStandort): ZaehlerStandortDetail {
  return {
    id: zaehlerStandort.id,
    zaehlerId: zaehlerStandort.zaehlerId,
    standortId: zaehlerStandort.standortId,
    gueltigVon: zaehlerStandort.gueltigVon,
    gueltigBis: zaehlerStandort.gueltigBis,
    createdAt: zaehlerStandort.createdAt,
    updatedAt: zaehlerStandort.updatedAt,
  };
}

export function mapZaehlerUnterKnotenItem(zaehler: Zaehler): ZaehlerUnterKnotenItem {
  return {
    id: zaehler.id,
    systemId: zaehler.systemId,
    geraetetyp: zaehler.geraetetyp,
    energietraeger: zaehler.energietraeger,
    status: zaehler.status,
    createdAt: zaehler.createdAt,
    updatedAt: zaehler.updatedAt,
  };
}

/** `energy.standort`-Zeile -> Breadcrumb-Knoten (D5, PII-frei — NIEMALS Bezeichnung/Adresse). */
export function mapStandortPfadEintrag(standort: Standort): StandortPfadEintrag {
  return {
    id: standort.id,
    parentId: standort.parentId,
    typ: standort.typ,
    ebene: standort.ebene,
    status: standort.status,
  };
}

/**
 * `GET .../zaehler/{zaehlerId}/verortung` (UX-Konzept „Wo hängt dieser
 * Zähler?") — EMPTY-STATE-Zweig (kein Standort ODER nur historische
 * Verortungen): `verortet=false`, `pfad=[]`, KEIN Fehler.
 */
export function mapZaehlerUnverortet(zaehlerId: string): ZaehlerStandortAktuellDetail {
  return { zaehlerId, verortet: false, standortId: null, verortetSeit: null, pfad: [] };
}

/**
 * `GET .../zaehler/{zaehlerId}/verortung` — Erfolgs-Zweig: `pfadKnoten` MUSS
 * bereits WURZEL-ZUERST sortiert sein (aufsteigend nach `ebene`, s.
 * `ZaehlerVerortungService.aktuelleVerortung()`).
 */
export function mapZaehlerAktuellVerortet(input: {
  readonly zaehlerId: string;
  readonly standortId: string;
  readonly verortetSeit: string;
  readonly pfadKnoten: readonly Standort[];
}): ZaehlerStandortAktuellDetail {
  return {
    zaehlerId: input.zaehlerId,
    verortet: true,
    standortId: input.standortId,
    verortetSeit: input.verortetSeit,
    pfad: input.pfadKnoten.map(mapStandortPfadEintrag),
  };
}
