import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Badge } from '../../../shared/ui/badge';
import { t } from '../../../shared/i18n/t';

export interface PlatzhalterKachelProps {
  readonly titel: string;
}

/**
 * Generische graue „bald"-Kachel (Betriebs-UI-Konzept Punkt 1, Grid so
 * gebaut, dass diese Kacheln OHNE Layout-Umbau nachrücken, sobald die
 * zugehörigen Endpunkte existieren — Baseline/Einsparung ADR-0006,
 * BAFA-Export-Status ADR-0007).
 */
export function PlatzhalterKachel({ titel }: PlatzhalterKachelProps): ReactNode {
  return (
    <Card className="border-dashed opacity-70">
      <CardHeader>
        <CardTitle as="h2">{titel}</CardTitle>
      </CardHeader>
      <CardContent>
        <Badge variant="outline">{t('dashboard.platzhalterBadge')}</Badge>
      </CardContent>
    </Card>
  );
}
