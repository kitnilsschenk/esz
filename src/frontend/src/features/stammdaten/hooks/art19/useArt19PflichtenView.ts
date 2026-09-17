import type { Art19PflichtItem } from '@edms/shared';
import { useArt19Pflichten, useArt19Mitteilung } from '../../api/art19';
import type { UnterrichtungKanal } from '../shared/unterrichtungKanal';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';
import { t } from '../../../../shared/i18n/t';

export interface Art19PflichtZeile {
  readonly item: Art19PflichtItem;
  readonly subjektLabel: string;
  readonly anlassLabel: string;
}

export interface Art19PflichtenView {
  readonly zeilen: readonly Art19PflichtZeile[];
  readonly offenAnzahl: number;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly melden: MutationViewBasis & {
    readonly mitteilen: (item: Art19PflichtItem, kanal: UnterrichtungKanal) => void;
  };
}

/**
 * Anzeige-Modell der Art.-19-Pflichten (ADR-0007 A18/A11.12).
 *
 * Zeigt offene UND erfüllte Pflichten: die erfüllten sind der Beleg, dass
 * mitgeteilt wurde — sie auszublenden würde die Liste zur reinen
 * Aufgabenliste verkürzen und den Nachweis unsichtbar machen.
 *
 * Die Sortierung (älteste Einreichung zuerst) kommt vom Server und wird
 * clientseitig nicht neu gemischt.
 */
export function useArt19PflichtenView(): Art19PflichtenView {
  const query = useArt19Pflichten();
  const mutation = useArt19Mitteilung();

  return {
    zeilen: (query.data?.items ?? []).map((item) => ({
      item,
      subjektLabel: t(`stammdaten.monitoring.art19.subjektTyp.${item.subjektTyp}`),
      anlassLabel: t(`stammdaten.monitoring.art19.anlass.${item.anlass}`),
    })),
    offenAnzahl: query.data?.offenAnzahl ?? 0,
    isPending: query.isPending,
    isError: query.isError,
    melden: {
      ...mutationViewBasis(mutation, t('stammdaten.monitoring.art19.meldenErfolg')),
      mitteilen: (item, kanal) => {
        mutation.mutate({
          einreichungId: item.einreichungId,
          subjektTyp: item.subjektTyp,
          subjektId: item.subjektId,
          anlass: item.anlass,
          kanal,
        });
      },
    },
  };
}
