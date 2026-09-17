import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Button } from '../../../shared/ui/button';
import { StatusRegion } from '../../../shared/ui/status-region';
import { useKannNachweisFuehren, usePreflightAusfuehrenView } from '../hooks';
import { t } from '../../../shared/i18n/t';

export interface PreflightAusfuehrenAktionProps {
  readonly foerderjahrId: string;
  readonly headingId: string;
}

/**
 * Aktions-Abschnitt „Vollständigkeit prüfen" auf der Förderjahr-Detailseite —
 * der zweite Schritt der Nachweis-Kette.
 *
 * Die Prüfung ist beliebig wiederholbar; jeder Lauf wird eigenständig
 * festgehalten. Es gibt daher bewusst KEINE Sperre nach dem ersten Lauf.
 *
 * Rollen-Politur wie bei den übrigen schreibenden Aktionen: Ohne die Rolle
 * `betrieb` wird die Aktion gar nicht erst gezeigt. Durchgesetzt wird das
 * ausschließlich vom Server.
 */
export function PreflightAusfuehrenAktion({ foerderjahrId, headingId }: PreflightAusfuehrenAktionProps): ReactNode {
  const view = usePreflightAusfuehrenView(foerderjahrId);
  const kannPruefen = useKannNachweisFuehren();

  if (!kannPruefen) {
    return null;
  }

  return (
    <section aria-labelledby={headingId}>
      <Card>
        <CardHeader>
          <CardTitle id={headingId} as="h2">
            {t('nachweis.foerderjahr.detail.preflightSectionTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('nachweis.foerderjahr.detail.preflightSectionHinweis')}</p>
          <StatusRegion ton="fehler" nachricht={view.submitErrorMessage} />
          <Button type="button" onClick={view.ausfuehren} disabled={view.isSubmitting}>
            {t('nachweis.foerderjahr.detail.preflightAction')}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
