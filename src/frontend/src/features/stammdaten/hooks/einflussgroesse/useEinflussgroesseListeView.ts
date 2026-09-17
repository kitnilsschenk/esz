import { useState } from 'react';
import { useEinflussgroesseListeFuerSystem } from '../../api/einflussgroesse';
import { useKannEinflussgroesseLesen } from './useKannEinflussgroesseLesen';
import { anlassCodeLabel, groesseCodeLabel, wertAnzeige } from './einflussgroesseFormat';
import { t } from '../../../../shared/i18n/t';

export interface EinflussgroesseZeileView {
  readonly id: string;
  /** Roh-Code (für den `?groesseCode=`-Hinweis auf dem Korrigieren-Link, s. `EinflussgroesseTabelle`). */
  readonly groesseCode: string;
  readonly groesseCodeLabel: string;
  readonly wertAnzeige: string;
  readonly gueltigAbMonat: string;
  readonly gueltigBisMonat: string;
  readonly betroffenerTypLabel: string;
  readonly quelleTypLabel: string;
  readonly rechtsgrundlageLabel: string;
  readonly anlassCodeLabel: string;
}

export interface EinflussgroesseListeView {
  /** `false` blendet die GESAMTE Liste/Sektion aus (`useKannEinflussgroesseLesen`). */
  readonly kannLesen: boolean;
  /** `true`, sobald `anzeigen()` ausgelöst wurde — VOR dem ersten Klick gibt es bewusst KEIN Ergebnis. */
  readonly angefordert: boolean;
  /** CTA „Einflussgrößen anzeigen" — löst den auditierten Klartext-Aufruf bewusst aus. */
  readonly anzeigen: () => void;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly zeilen: readonly EinflussgroesseZeileView[];
}

/**
 * View-Model des CTAs „Einflussgrößen anzeigen" (`EinflussgroesseTabelle`).
 * Kapselt die auf Anfrage (NICHT automatisch beim Render) ausgelöste
 * Klartext-Liste EINES Systems — analog `useMesskanalLastgangView` (break-
 * glass-Vorbild), hier aber über `useEinflussgroesseListeFuerSystem`s
 * `enabled`-Gate (nicht `useMutation`) UMGESETZT, weil ein erfolgreicher
 * Aufruf innerhalb der `staleTime` wiederverwendet werden soll (kein
 * Audit-Rauschen bei Remounts/Fokuswechsel, s. dortiger Kommentar).
 */
export function useEinflussgroesseListeView(systemId: string): EinflussgroesseListeView {
  const kannLesen = useKannEinflussgroesseLesen();
  const [angefordert, setAngefordert] = useState(false);
  const query = useEinflussgroesseListeFuerSystem(systemId, { aktiviert: kannLesen && angefordert });

  const zeilen: readonly EinflussgroesseZeileView[] = (query.data ?? []).map((item) => ({
    id: item.id,
    groesseCode: item.groesseCode,
    groesseCodeLabel: groesseCodeLabel(item.groesseCode),
    wertAnzeige: wertAnzeige(item),
    gueltigAbMonat: item.gueltigAbMonat,
    gueltigBisMonat: item.gueltigBisMonat ?? t('stammdaten.einflussgroesse.detail.gueltigBisAktuell'),
    betroffenerTypLabel: t(`stammdaten.common.enums.einflussBetroffenerTyp.${item.betroffenerTyp}`),
    quelleTypLabel: t(`stammdaten.common.enums.einflussQuelleTyp.${item.quelleTyp}`),
    rechtsgrundlageLabel: t(`stammdaten.common.enums.einflussRechtsgrundlage.${item.rechtsgrundlage}`),
    anlassCodeLabel: anlassCodeLabel(item.anlassCode),
  }));

  return {
    kannLesen,
    angefordert,
    anzeigen: () => setAngefordert(true),
    isPending: angefordert && query.isPending,
    isError: angefordert && query.isError,
    zeilen,
  };
}
