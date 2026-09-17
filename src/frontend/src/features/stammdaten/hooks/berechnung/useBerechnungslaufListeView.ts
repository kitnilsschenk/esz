import type { BadgeProps } from '../../../../shared/ui/badge';
import { useBerechnungslaufListe } from '../../api/berechnung';
import { formatierePeriode, qualitaetsStufeBadgeVariante, qualitaetsStufeLabel } from './berechnungFormat';
import { t } from '../../../../shared/i18n/t';

export interface BerechnungslaufListeZeileView {
  readonly id: string;
  readonly periodeLabel: string;
  readonly energietraegerLabel: string;
  readonly qualitaetsStufeLabel: string;
  readonly qualitaetsStufeBadgeVariante: NonNullable<BadgeProps['variant']>;
  /** Rohes ISO-Datum — bewusst UNFORMATIERT (Anzeige-Konvention aller Stammdaten-Tabellen, s. `EndkundenTabelle`/`createdAt`). */
  readonly erstelltAt: string;
}

export interface BerechnungslaufListeView {
  readonly items: readonly BerechnungslaufListeZeileView[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
}

/**
 * Leitet aus der Cursor-paginierten Berechnungslauf-Listen-Query EINES
 * Endkunden ein reines Anzeige-Modell ab (analog
 * `useMesskonzeptVersionenListeView`/`useAusfaelleListeView`): Perioden-Text
 * und Qualitätsstufen-Label/Badge-Variante werden HIER aufbereitet, damit
 * `BerechnungslaufTabelle.tsx` keine Formatierungs-Logik im JSX trägt
 * (`.claude/rules/frontend-react.md`).
 */
export function useBerechnungslaufListeView(endkundeId: string): BerechnungslaufListeView {
  const query = useBerechnungslaufListe({ endkundeId });

  const items: readonly BerechnungslaufListeZeileView[] = query.data
    ? query.data.pages.flatMap((page) =>
        page.daten.map((zeile) => ({
          id: zeile.id,
          periodeLabel: formatierePeriode(zeile.periodeVon, zeile.periodeBis),
          energietraegerLabel: t(`stammdaten.common.enums.energietraeger.${zeile.energietraeger}`),
          qualitaetsStufeLabel: qualitaetsStufeLabel(zeile.qualitaetsStufeMin),
          qualitaetsStufeBadgeVariante: qualitaetsStufeBadgeVariante(zeile.qualitaetsStufeMin),
          erstelltAt: zeile.erstelltAt,
        })),
      )
    : [];

  return {
    items,
    isPending: query.isPending,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore: () => {
      void query.fetchNextPage();
    },
  };
}
