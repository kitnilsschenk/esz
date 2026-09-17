import type { ReactNode } from 'react';
import { EinschraenkungFristenTabelle } from '../../components/monitoring';
import { PageHeader } from '../../components/shared';
import { Card, CardContent } from '../../../../shared/ui/card';
import { t } from '../../../../shared/i18n/t';

/**
 * Route-Container `/monitoring/einschraenkung-fristen` — Wiedervorlage der
 * befristeten Art.-18-Einschränkungen (ADR-0007 A11.11).
 *
 * BEWUSST eine eigene Route statt einer dritten Sektion auf
 * `/monitoring/vollstaendigkeit`: jene Seite heißt „Datenqualität &
 * Störungen" und behandelt Messdaten-Lücken und -Ausfälle. Eine
 * Betroffenenrechts-Wiedervorlage ist etwas kategorial anderes — sie dort
 * einzuhängen hieße, zwei unverwandte Arbeitsvorräte unter einer Überschrift
 * zu führen.
 *
 * Route-Container bleibt dünn: `PageHeader` plus Einbettung, keine eigene
 * Datenlogik.
 */
export function EinschraenkungFristenPage(): ReactNode {
  return (
    <section aria-labelledby="einschraenkung-fristen-heading">
      <PageHeader
        headingId="einschraenkung-fristen-heading"
        title={t('stammdaten.monitoring.einschraenkungFristen.listPage.title')}
      />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">
            {t('stammdaten.monitoring.einschraenkungFristen.listPage.beschreibung')}
          </p>
          <EinschraenkungFristenTabelle />
        </CardContent>
      </Card>
    </section>
  );
}

export default EinschraenkungFristenPage;
