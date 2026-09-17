import type { ReactNode } from 'react';
import { useEndkundeVerbrauchView } from '../../hooks/endkunde';
import { VerbrauchAnsicht } from '../verbrauch';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { t } from '../../../../shared/i18n/t';

export interface EndkundeVerbrauchTabProps {
  readonly endkundeId: string;
}

/**
 * „Verbrauch"-Tab der Endkunde-Detailseite (Betriebs-UI-Konzept Punkt 4,
 * Priorität 5). Aggregationsregel — s. `useEndkundeVerbrauchView`-Klassen-Dok
 * für die vollständige Begründung:
 * - EIN Wurzelstandort → direkte `VerbrauchAnsicht`-Einbettung (Gesamtbaum).
 * - MEHRERE Wurzelstandorte (mehrere Liegenschaften) → EINE Kachel JE
 *   Liegenschaft, jede mit eigenem `VerbrauchAnsicht` — **bewusst KEINE
 *   Gesamtsumme** (`messwerte.openapi.yaml` verbietet das Summieren
 *   unterschiedlicher Messgrößen/Einheiten; eine „Endkunden-Gesamt-Zahl"
 *   wäre fachlich falsch, sähe aber trotzdem plausibel aus — z. B. Strom
 *   Gebäude A + Wärme Gebäude B addiert).
 */
export function EndkundeVerbrauchTab({ endkundeId }: EndkundeVerbrauchTabProps): ReactNode {
  const view = useEndkundeVerbrauchView(endkundeId);

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

  if (view.istLeer) {
    return <p className="text-sm text-muted-foreground">{t('stammdaten.endkunde.verbrauch.keinStandort')}</p>;
  }

  if (!view.hatMehrereWurzeln) {
    const wurzel = view.wurzeln[0];
    if (wurzel === undefined) {
      return null;
    }
    return <VerbrauchAnsicht key={wurzel.standortId} standortId={wurzel.standortId} />;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('stammdaten.endkunde.verbrauch.mehrereLiegenschaftenHinweis')}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        {view.wurzeln.map((wurzel) => (
          <Card key={wurzel.standortId}>
            <CardHeader>
              <CardTitle as="h3">
                <span className="mr-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{wurzel.typLabel}</span>{' '}
                <span className={wurzel.istPlatzhalter ? 'italic text-muted-foreground' : undefined}>{wurzel.anzeigeName}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <VerbrauchAnsicht standortId={wurzel.standortId} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
