import type { PreflightErgebnis } from '@edms/shared';
import { usePreflightDetail } from '../api';
import type { DetailField } from '../../stammdaten/components/shared';
import { kurzId } from '../../stammdaten/components/shared';
import {
  formatiereAnzahl,
  jaNein,
  preflightErgebnisBadgeVariante,
  preflightErgebnisLabel,
  type BadgeVariante,
} from './nachweisFormat';
import { formatiereZeitpunkt } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';

export interface PreflightDetailView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly foerderjahrId: string | undefined;
  readonly ergebnis: PreflightErgebnis | undefined;
  /** `true` = keine blockierenden Befunde; Grundlage für die Freigabe des Förderjahr-Nachweises (D4). */
  readonly istGruen: boolean;
  readonly ergebnisLabel: string;
  readonly ergebnisBadgeVariante: BadgeVariante;
  readonly fields: readonly DetailField[];
}

/**
 * Anzeige-Modell des Preflight-Kopfes. `istGruen` ist der Schalter, an dem
 * die gesamte weitere Kette hängt: Nur aus einer bestandenen Prüfung darf ein
 * Förderjahr-Nachweis entstehen (aus einer nicht bestandenen nur ein
 * Zwischenstand). Die Oberfläche liest diesen Zustand hier EINMAL aus und
 * gibt ihn weiter, statt ihn an mehreren Stellen neu herzuleiten.
 */
export function usePreflightDetailView(preflightId: string): PreflightDetailView {
  const query = usePreflightDetail(preflightId);
  const detail = query.data;
  const ergebnis = detail?.ergebnis;

  const fields: readonly DetailField[] = detail
    ? [
        {
          key: 'blockerAnzahl',
          label: t('nachweis.preflight.detail.blockerAnzahl'),
          value: formatiereAnzahl(detail.blockerAnzahl),
        },
        {
          key: 'warnungAnzahl',
          label: t('nachweis.preflight.detail.warnungAnzahl'),
          value: formatiereAnzahl(detail.warnungAnzahl),
        },
        {
          key: 'hinweisAnzahl',
          label: t('nachweis.preflight.detail.hinweisAnzahl'),
          value: formatiereAnzahl(detail.hinweisAnzahl),
        },
        {
          key: 'umfangPaareAnzahl',
          label: t('nachweis.preflight.detail.umfangPaareAnzahl'),
          value: formatiereAnzahl(detail.umfangPaareAnzahl),
        },
        {
          key: 'monateErwartet',
          label: t('nachweis.preflight.detail.monateErwartet'),
          value: formatiereAnzahl(detail.monateErwartet),
        },
        { key: 'synthetic', label: t('nachweis.preflight.detail.synthetic'), value: jaNein(detail.synthetic) },
        { key: 'profil', label: t('nachweis.preflight.detail.profil'), value: `${detail.profilCode} (v${String(detail.profilVersion)})` },
        {
          key: 'ausgefuehrtAt',
          label: t('nachweis.preflight.detail.ausgefuehrtAt'),
          value: formatiereZeitpunkt(detail.ausgefuehrtAt),
        },
        {
          key: 'ausgefuehrtVonSub',
          label: t('nachweis.preflight.detail.ausgefuehrtVonSub'),
          value: kurzId(detail.ausgefuehrtVonSub),
        },
        { key: 'id', label: t('nachweis.preflight.detail.id'), value: kurzId(detail.id) },
      ]
    : [];

  return {
    isPending: query.isPending,
    isError: query.isError,
    foerderjahrId: detail?.foerderjahrId,
    ergebnis,
    istGruen: ergebnis === 'gruen',
    ergebnisLabel: ergebnis !== undefined ? preflightErgebnisLabel(ergebnis) : '',
    ergebnisBadgeVariante: ergebnis !== undefined ? preflightErgebnisBadgeVariante(ergebnis) : 'outline',
    fields,
  };
}
