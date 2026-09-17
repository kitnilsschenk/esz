import { useZaehlerFreshness } from '../../api/zaehler';
import { formatiereRelativeZeit } from '../shared/relativeZeit';
import { t } from '../../../../shared/i18n/t';

export interface ZaehlerFreshnessStatusView {
  readonly isPending: boolean;
  readonly isError: boolean;
  /** `false`, wenn dieser Zähler (noch) keine Messkanäle hat — eigener, nicht-destruktiver Zustand (kein Fehler). */
  readonly hatMesskanaele: boolean;
  readonly label: string;
  readonly ueberfaellig: boolean;
}

/**
 * Zusammengefasster Datenfluss-Status EINES Zählers (Betriebs-UI-Konzept
 * Punkt 3 „Datenfluss-Status": „Letzte Übertragung: vor 3 Std." + Badge je
 * Frische-Schwelle). Nutzt DIESELBE Freshness-Query wie die
 * Messkanäle-Tabellen-Spalte (`GET .../zaehler/{id}/freshness`,
 * `read:monitoring`, KEIN break-glass) — hier auf EINE Kennzahl je Zähler
 * verdichtet: die JÜNGSTE `letzteUebertragung` über alle Messkanäle
 * („läuft's noch?"), `ueberfaellig`, sobald MINDESTENS ein Kanal überfällig
 * ist (analog TB-04-Logik server-seitig).
 */
export function useZaehlerFreshnessStatusView(zaehlerId: string): ZaehlerFreshnessStatusView {
  const query = useZaehlerFreshness(zaehlerId);
  const items = query.data ?? [];

  if (query.isPending || query.isError || items.length === 0) {
    return {
      isPending: query.isPending,
      isError: query.isError,
      hatMesskanaele: items.length > 0,
      label: '',
      ueberfaellig: false,
    };
  }

  const ueberfaellig = items.some((item) => item.ueberfaellig);
  const letzteUebertragungen = items
    .map((item) => item.letzteUebertragung)
    .filter((wert): wert is string => wert !== null)
    .sort()
    .reverse();
  const juengste = letzteUebertragungen[0];

  const label =
    juengste === undefined
      ? t('stammdaten.zaehler.detail.freshness.nieEmpfangen')
      : `${t('stammdaten.zaehler.detail.freshness.praefix')} ${formatiereRelativeZeit(juengste)}`;

  return { isPending: false, isError: false, hatMesskanaele: true, label, ueberfaellig };
}
