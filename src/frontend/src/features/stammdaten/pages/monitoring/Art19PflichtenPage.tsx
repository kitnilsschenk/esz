import type { ReactNode } from 'react';
import { Art19PflichtenTabelle } from '../../components/monitoring';
import { PageHeader } from '../../components/shared';
import { Card, CardContent } from '../../../../shared/ui/card';
import { t } from '../../../../shared/i18n/t';

/**
 * Route-Container `/monitoring/art19-pflichten` — Mitteilungspflichten nach
 * Art. 19 DSGVO (ADR-0007 A18/A11.12).
 *
 * Eigene Route neben der Fristen-Wiedervorlage: beide sind
 * Betroffenenrechts-Arbeitsvorräte, aber verschiedene Pflichten mit
 * verschiedenen Adressaten — die eine richtet sich an die eigene
 * Sachbearbeitung (Frist läuft), die andere an einen Dritten (der Empfänger
 * ist zu unterrichten).
 */
export function Art19PflichtenPage(): ReactNode {
  return (
    <section aria-labelledby="art19-pflichten-heading">
      <PageHeader headingId="art19-pflichten-heading" title={t('stammdaten.monitoring.art19.listPage.title')} />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">{t('stammdaten.monitoring.art19.listPage.beschreibung')}</p>
          <Art19PflichtenTabelle />
        </CardContent>
      </Card>
    </section>
  );
}

export default Art19PflichtenPage;
