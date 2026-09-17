import { usePreflightBefundeListe } from '../api';
import { kurzId } from '../../stammdaten/components/shared';
import {
  energietraegerLabel,
  istNurPaarBezogenerBlocker,
  istSystembedingterBlocker,
  preflightSchwereBadgeVariante,
  preflightSchwereLabel,
  regelCodeLabel,
  type BadgeVariante,
} from './nachweisFormat';
import { formatiereKalenderdatum } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';

export interface PreflightBefundZeileView {
  /** `preflightId` + `lfd` — die Befund-Tabelle hat keinen eigenen Schlüssel. */
  readonly key: string;
  readonly lfdLabel: string;
  readonly regelCode: string;
  readonly regelCodeLabel: string;
  readonly schwereLabel: string;
  readonly schwereBadgeVariante: BadgeVariante;
  /**
   * `true` bei einem Blocker, der nur das betroffene Paar ausschließt und den
   * Förderjahres-Nachweis nicht aufhält — sonst widerspräche die Zeile der
   * grünen Ampel darüber.
   */
  readonly nurPaarBezogen: boolean;
  /**
   * `true` bei einem Blocker, der aus dem Systemzustand entsteht (heute: der
   * synthetische Betrieb) — er lässt sich nicht durch Datenpflege beheben,
   * anders als jeder andere Befund der Liste.
   */
  readonly systembedingt: boolean;
  readonly endkundeIdLabel: string;
  readonly energietraegerLabel: string;
  readonly monatLabel: string;
  readonly kennzahlKlasseLabel: string;
}

export interface PreflightBefundeListeView {
  readonly items: readonly PreflightBefundZeileView[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
  /** `true`, sobald mindestens ein angezeigter Befund nur paarbezogen ist — steuert den erklärenden Hinweis. */
  readonly zeigePaarHinweis: boolean;
  /** `true`, sobald mindestens ein angezeigter Blocker systembedingt ist. */
  readonly zeigeSystemHinweis: boolean;
}

/**
 * Anzeige-Modell der Befundliste. Befunde sind PII- und wertfrei: `endkundeId`
 * ist ein Pseudonym, `kennzahlKlasse` eine Klasse (z. B. „kandidaten_2"),
 * niemals eine Energiemenge.
 */
export function usePreflightBefundeListeView(preflightId: string): PreflightBefundeListeView {
  const query = usePreflightBefundeListe({ preflightId });
  const ohneBezug = t('nachweis.preflight.tabelle.ohneBezug');

  const items: readonly PreflightBefundZeileView[] = query.data
    ? query.data.pages.flatMap((seite) =>
        seite.daten.map((befund) => ({
          key: `${befund.preflightId}:${String(befund.lfd)}`,
          lfdLabel: String(befund.lfd),
          regelCode: befund.regelCode,
          regelCodeLabel: regelCodeLabel(befund.regelCode),
          schwereLabel: preflightSchwereLabel(befund.schwere),
          schwereBadgeVariante: preflightSchwereBadgeVariante(befund.schwere),
          nurPaarBezogen: istNurPaarBezogenerBlocker(befund.regelCode, befund.schwere),
          systembedingt: istSystembedingterBlocker(befund.regelCode, befund.schwere),
          endkundeIdLabel: befund.endkundeId !== null ? kurzId(befund.endkundeId) : ohneBezug,
          energietraegerLabel: befund.energietraeger !== null ? energietraegerLabel(befund.energietraeger) : ohneBezug,
          monatLabel: befund.monat !== null ? formatiereKalenderdatum(befund.monat) : ohneBezug,
          kennzahlKlasseLabel: befund.kennzahlKlasse ?? ohneBezug,
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
    zeigePaarHinweis: items.some((zeile) => zeile.nurPaarBezogen),
    zeigeSystemHinweis: items.some((zeile) => zeile.systembedingt),
  };
}
