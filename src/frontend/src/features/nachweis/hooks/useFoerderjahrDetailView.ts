import { useFoerderjahrDetail } from '../api';
import type { DetailField } from '../../stammdaten/components/shared';
import { kurzId } from '../../stammdaten/components/shared';
import { definitionQuelleLabel, formatiereAnzahl, formatiereFoerderjahrSpanne } from './nachweisFormat';
import { formatiereZeitpunkt } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';

export interface FoerderjahrDetailView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly code: string | undefined;
  readonly fields: readonly DetailField[];
}

/**
 * Anzeige-Modell der Förderjahr-Detailseite. PII-frei — ein Förderjahr trägt
 * ausschließlich Vorhabens-Stammdaten.
 */
export function useFoerderjahrDetailView(foerderjahrId: string): FoerderjahrDetailView {
  const query = useFoerderjahrDetail(foerderjahrId);
  const detail = query.data;

  const fields: readonly DetailField[] = detail
    ? [
        { key: 'code', label: t('nachweis.foerderjahr.detail.code'), value: detail.code },
        { key: 'nummer', label: t('nachweis.foerderjahr.detail.nummer'), value: formatiereAnzahl(detail.nummer) },
        {
          key: 'zeitraum',
          label: t('nachweis.foerderjahr.detail.zeitraum'),
          value: formatiereFoerderjahrSpanne(detail.vonMonat, detail.bisMonat, detail.vonTag, detail.bisTag),
        },
        {
          key: 'definitionQuelle',
          label: t('nachweis.foerderjahr.detail.definitionQuelle'),
          value: definitionQuelleLabel(detail.definitionQuelle),
        },
        { key: 'vorhabenRef', label: t('nachweis.foerderjahr.detail.vorhabenRef'), value: detail.vorhabenRef },
        {
          key: 'bescheidRef',
          label: t('nachweis.foerderjahr.detail.bescheidRef'),
          value: detail.bescheidRef ?? t('stammdaten.common.keineAngabe'),
        },
        { key: 'id', label: t('nachweis.foerderjahr.detail.id'), value: kurzId(detail.id) },
        {
          key: 'createdAt',
          label: t('nachweis.foerderjahr.detail.createdAt'),
          value: formatiereZeitpunkt(detail.createdAt),
        },
      ]
    : [];

  return {
    isPending: query.isPending,
    isError: query.isError,
    code: detail?.code,
    fields,
  };
}
