import { useEinsparlaufBindungenListe } from '../api';
import { kurzId } from '../../stammdaten/components/shared';
import { formatiereKwh, formatiereMonat, qualitaetsStufeBadgeVariante, qualitaetsStufeLabel } from '../../stammdaten/hooks/berechnung';
import { energietraegerLabel, monatsBehandlungLabel, type BadgeVariante } from './nachweisFormat';

export interface EinsparlaufBindungZeileView {
  /** `endkundeId` + `energietraeger` + `monat` — die Bindungszeile hat keinen eigenen Schlüssel. */
  readonly key: string;
  readonly endkundeIdLabel: string;
  readonly energietraegerLabel: string;
  readonly monatLabel: string;
  readonly referenzLabel: string;
  readonly istLabel: string;
  readonly deltaLabel: string;
  readonly deltaAusgewiesenLabel: string;
  readonly qualitaetsStufeLabel: string;
  readonly qualitaetsStufeBadgeVariante: BadgeVariante;
  readonly behandlungLabel: string;
  /** `> 1` heißt: es gab mehrere gleichwertige Berechnungen, die Mehrdeutigkeit wurde aufgelöst. */
  readonly mehrdeutigAufgeloest: boolean;
  readonly berechnungslaufIdLabel: string;
}

export interface EinsparlaufBindungenListeView {
  readonly items: readonly EinsparlaufBindungZeileView[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
}

/**
 * Anzeige-Modell der Monatsbindungen — die Belegkette des Laufs: welche
 * monatliche Berechnung mit welchen (eingefrorenen) Werten eingegangen ist.
 */
export function useEinsparlaufBindungenListeView(einsparlaufId: string): EinsparlaufBindungenListeView {
  const query = useEinsparlaufBindungenListe({ einsparlaufId });

  const items: readonly EinsparlaufBindungZeileView[] = query.data
    ? query.data.pages.flatMap((seite) =>
        seite.daten.map((bindung) => ({
          key: `${bindung.endkundeId}:${bindung.energietraeger}:${bindung.monat}`,
          endkundeIdLabel: kurzId(bindung.endkundeId),
          energietraegerLabel: energietraegerLabel(bindung.energietraeger),
          monatLabel: formatiereMonat(bindung.monat),
          referenzLabel: formatiereKwh(bindung.referenzKwh),
          istLabel: formatiereKwh(bindung.istKwh),
          deltaLabel: formatiereKwh(bindung.deltaKwh),
          deltaAusgewiesenLabel: formatiereKwh(bindung.deltaAusgewiesenKwh),
          qualitaetsStufeLabel: qualitaetsStufeLabel(bindung.qualitaetsStufe),
          qualitaetsStufeBadgeVariante: qualitaetsStufeBadgeVariante(bindung.qualitaetsStufe),
          behandlungLabel: monatsBehandlungLabel(bindung.behandlung),
          mehrdeutigAufgeloest: bindung.kandidatenAnzahl > 1,
          berechnungslaufIdLabel: kurzId(bindung.berechnungslaufId),
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
