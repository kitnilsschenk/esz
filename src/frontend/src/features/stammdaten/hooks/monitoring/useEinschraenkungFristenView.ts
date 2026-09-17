import type { EinschraenkungFristItem } from '@edms/shared';
import { useEinschraenkungFristen } from '../../api/monitoring';
import { einschraenkungGrundLabel } from '../shared/einschraenkungGrund';
import { t } from '../../../../shared/i18n/t';

export interface EinschraenkungFristZeile {
  readonly item: EinschraenkungFristItem;
  readonly subjektLabel: string;
  readonly grundLabel: string;
}

export interface EinschraenkungFristenView {
  readonly zeilen: readonly EinschraenkungFristZeile[];
  readonly schwelleTage: number;
  readonly ueberfaelligAnzahl: number;
  readonly isPending: boolean;
  readonly isError: boolean;
}

/**
 * Anzeige-Modell der Wiedervorlage (ADR-0007 A11.11).
 *
 * Die Sortierung kommt UNVERÄNDERT vom Server (älteste zuerst) — die Liste
 * ist nach Dringlichkeit geordnet, und eine clientseitige Neusortierung würde
 * genau diese Aussage verlieren (dasselbe Prinzip wie bei
 * `useAusfaelleListeView`).
 *
 * Die Grund-Bezeichnung stammt aus demselben geteilten Vokabular wie die
 * Sperr-Aktion und die Detailansichten (`einschraenkungGrundLabel`).
 */
export function useEinschraenkungFristenView(schwelleTage?: number): EinschraenkungFristenView {
  const query = useEinschraenkungFristen(schwelleTage);
  const report = query.data;

  return {
    zeilen: (report?.items ?? []).map((item) => ({
      item,
      subjektLabel: t(`stammdaten.monitoring.einschraenkungFristen.subjektTyp.${item.subjektTyp}`),
      grundLabel: einschraenkungGrundLabel(item.einschraenkungGrundCode),
    })),
    schwelleTage: report?.schwelleTage ?? 0,
    ueberfaelligAnzahl: report?.ueberfaelligAnzahl ?? 0,
    isPending: query.isPending,
    isError: query.isError,
  };
}
