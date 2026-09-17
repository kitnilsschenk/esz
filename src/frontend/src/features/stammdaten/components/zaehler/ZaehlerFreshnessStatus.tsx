import type { ReactNode } from 'react';
import { useZaehlerFreshnessStatusView } from '../../hooks/zaehler';
import { Badge } from '../../../../shared/ui/badge';
import { t } from '../../../../shared/i18n/t';

export interface ZaehlerFreshnessStatusProps {
  readonly zaehlerId: string;
}

/**
 * Zusammengefasster Datenfluss-Status („läuft der Zähler noch?", Betriebs-UI-
 * Konzept Punkt 3) — nutzt Metadaten (`ingest.kanal_status.letzter_ts` via
 * `GET .../zaehler/{id}/freshness`, `read:monitoring`), **keine Werte**,
 * braucht daher KEINEN Zweck-Header/break-glass. Beantwortet den Alltagsfall
 * beiläufig, ohne die Messkanäle-Tabelle weiter unten öffnen zu müssen.
 */
export function ZaehlerFreshnessStatus({ zaehlerId }: ZaehlerFreshnessStatusProps): ReactNode {
  const view = useZaehlerFreshnessStatusView(zaehlerId);

  if (view.isPending) {
    return (
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {t('stammdaten.common.laedt')}
      </p>
    );
  }

  if (view.isError) {
    return (
      <p role="alert" className="text-sm font-medium text-destructive-text">
        {t('stammdaten.common.fehler')}
      </p>
    );
  }

  if (!view.hatMesskanaele) {
    return <p className="text-sm text-muted-foreground">{t('stammdaten.zaehler.detail.freshness.keineMesskanaele')}</p>;
  }

  return (
    <p className="flex items-center gap-2 text-sm text-foreground">
      <span>{view.label}</span>
      <Badge variant={view.ueberfaellig ? 'destructive' : 'success'}>
        {t(view.ueberfaellig ? 'stammdaten.zaehler.detail.freshness.badgeUeberfaellig' : 'stammdaten.zaehler.detail.freshness.badgeOk')}
      </Badge>
    </p>
  );
}
