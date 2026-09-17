import { useEinreichungDetail } from '../api';
import type { DetailField } from '../../stammdaten/components/shared';
import { kurzId } from '../../stammdaten/components/shared';
import { einreichungArtLabel, korrekturGrundLabel, uebermittlungswegLabel } from './nachweisFormat';
import { formatiereZeitpunkt } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';

export interface EinreichungDetailView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly exportId: string | undefined;
  readonly einsparlaufId: string | undefined;
  readonly ersetztEinreichungId: string | null | undefined;
  /** `true`, wenn diese Einreichung eine frühere ablöst — nur dann gibt es einen Differenz-Report. */
  readonly istKorrektur: boolean;
  readonly fields: readonly DetailField[];
}

/**
 * Anzeige-Modell der Einreichung. Die Metadaten sind Prüfgegenstand des
 * Compliance-Teams und deshalb — anders als der Export selbst — auch für die
 * Auditor-Rolle lesbar.
 */
export function useEinreichungDetailView(einreichungId: string): EinreichungDetailView {
  const query = useEinreichungDetail(einreichungId);
  const detail = query.data;
  const keineAngabe = t('stammdaten.common.keineAngabe');

  const fields: readonly DetailField[] = detail
    ? [
        { key: 'art', label: t('nachweis.einreichung.detail.art'), value: einreichungArtLabel(detail.art) },
        { key: 'empfaenger', label: t('nachweis.einreichung.detail.empfaenger'), value: detail.empfaenger },
        {
          key: 'uebermittlungsweg',
          label: t('nachweis.einreichung.detail.uebermittlungsweg'),
          value: uebermittlungswegLabel(detail.uebermittlungsweg),
        },
        {
          key: 'uebermitteltAt',
          label: t('nachweis.einreichung.detail.uebermitteltAt'),
          value: formatiereZeitpunkt(detail.uebermitteltAt),
        },
        {
          key: 'anfrageRef',
          label: t('nachweis.einreichung.detail.anfrageRef'),
          value: detail.anfrageRef ?? keineAngabe,
        },
        {
          key: 'belegRef',
          label: t('nachweis.einreichung.detail.belegRef'),
          value: detail.belegRef !== null ? kurzId(detail.belegRef) : keineAngabe,
        },
        {
          key: 'korrekturGrundCode',
          label: t('nachweis.einreichung.detail.korrekturGrundCode'),
          value: detail.korrekturGrundCode !== null ? korrekturGrundLabel(detail.korrekturGrundCode) : keineAngabe,
        },
        {
          key: 'eingereichtVonSub',
          label: t('nachweis.einreichung.detail.eingereichtVonSub'),
          value: kurzId(detail.eingereichtVonSub),
        },
        {
          key: 'createdAt',
          label: t('nachweis.einreichung.detail.createdAt'),
          value: formatiereZeitpunkt(detail.createdAt),
        },
        {
          key: 'manifestHash',
          label: t('nachweis.einreichung.detail.manifestHash'),
          value: detail.manifestHash,
        },
        { key: 'id', label: t('nachweis.einreichung.detail.id'), value: kurzId(detail.id) },
      ]
    : [];

  return {
    isPending: query.isPending,
    isError: query.isError,
    exportId: detail?.exportId,
    einsparlaufId: detail?.einsparlaufId,
    ersetztEinreichungId: detail?.ersetztEinreichungId,
    istKorrektur: detail?.ersetztEinreichungId != null,
    fields,
  };
}
