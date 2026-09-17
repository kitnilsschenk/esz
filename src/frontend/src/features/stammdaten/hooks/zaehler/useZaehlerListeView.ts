import type { ZaehlerListItem } from '@edms/shared';
import { useZaehlerListe, type ZaehlerListenFilter } from '../../api/zaehler';
import { formatiereRelativeZeit } from '../shared/relativeZeit';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';
import { t } from '../../../../shared/i18n/t';
import type { BadgeVariante } from '../../../nachweis/hooks/nachweisFormat';

export interface ZaehlerZeileView extends ZaehlerListItem {
  /** Kurzfassung des Anschluss-Zustands für das Abzeichen in der Liste. */
  readonly empfangLabel: string;
  readonly empfangBadgeVariante: BadgeVariante;
  /** Absoluter Empfangszeitpunkt — leer, solange nie etwas ankam. */
  readonly empfangZeitpunkt: string;
  /** „vor 4 Std." — leer, solange nie etwas ankam. */
  readonly empfangRelativ: string;
}

export interface ZaehlerListeView {
  readonly items: readonly ZaehlerZeileView[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
}

/**
 * Der Anschluss-Zustand eines Zählers in drei Stufen.
 *
 * Die Reihenfolge ist die der Fehlersuche, nicht die des Datenmodells: Hängt
 * überhaupt ein Gerät dran? Wenn ja — kam schon einmal etwas an? Wenn ja —
 * wann zuletzt? Wer eine Anlage anschließt, arbeitet genau diese drei Fragen
 * ab, und die Antwort auf die erste macht die beiden anderen gegenstandslos.
 *
 * BEWUSST OHNE „überfällig"-Bewertung: ob eine Lücke eine Störung ist, hängt
 * am erwarteten Sendeintervall des Kanals, und das steht hier nicht zur
 * Verfügung. Die Liste nennt deshalb den Zeitpunkt und überlässt das Urteil —
 * `vor 3 Tagen` ist bei einem stündlich sendenden Gerät Auskunft genug. Die
 * begründete Bewertung liefert die Ausfall-Übersicht.
 */
function zuEmpfang(item: ZaehlerListItem): {
  readonly empfangLabel: string;
  readonly empfangBadgeVariante: BadgeVariante;
  readonly empfangZeitpunkt: string;
  readonly empfangRelativ: string;
} {
  if (!item.angebunden) {
    return {
      empfangLabel: t('stammdaten.zaehler.empfang.nichtAngebunden'),
      empfangBadgeVariante: 'outline',
      empfangZeitpunkt: '',
      empfangRelativ: '',
    };
  }
  if (item.letzteUebertragung === null) {
    return {
      empfangLabel: t('stammdaten.zaehler.empfang.wartet'),
      empfangBadgeVariante: 'warning',
      empfangZeitpunkt: '',
      empfangRelativ: '',
    };
  }
  return {
    empfangLabel: t('stammdaten.zaehler.empfang.empfaengt'),
    empfangBadgeVariante: 'success',
    empfangZeitpunkt: formatiereZeitpunkt(item.letzteUebertragung),
    empfangRelativ: formatiereRelativeZeit(item.letzteUebertragung),
  };
}

/**
 * Leitet aus der Cursor-paginierten Zähler-Listen-Query ein reines
 * Anzeige-Modell ab (analog `useSystemeListeView`).
 *
 * `filter` schränkt die Liste serverseitig ein (`?endkundeId=`/`?systemId=`)
 * — so lässt sich dieselbe Tabelle global UND eingebettet in eine
 * übergeordnete Detailseite verwenden, ohne eine zweite Komponente zu bauen.
 */
export function useZaehlerListeView(filter: ZaehlerListenFilter = {}): ZaehlerListeView {
  const query = useZaehlerListe(filter);

  return {
    items: query.data
      ? query.data.pages.flatMap((page) => page.daten.map((item) => ({ ...item, ...zuEmpfang(item) })))
      : [],
    isPending: query.isPending,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore: () => {
      void query.fetchNextPage();
    },
  };
}
