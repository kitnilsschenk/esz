import type { ReactNode } from 'react';
import { AusfaelleTabelle, VollstaendigkeitTabelle } from '../../components/monitoring';
import { PageHeader } from '../../components/shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { t } from '../../../../shared/i18n/t';

/**
 * Route-Container `/monitoring/vollstaendigkeit` (DE-02-Dashboard, ADR-0008
 * §23 / D11 Phase 4c Pass 2; um TB-04 erweitert — Betriebs-UI-Konzept
 * Punkt 6/Priorisierung 6: „Datenqualität & Störungen"). Route-Container
 * bleibt dünn: nur `PageHeader` + Einbettung der beiden Feature-Komponenten,
 * keine eigene Datenlogik. KEIN „…anlegen"-Link — das Dashboard ist rein
 * lesend. `PageHeader` setzt `document.title` intern (`useDocumentTitle`) —
 * deckt damit weiterhin WCAG 2.2 AA 2.4.2 „Page Titled" ab.
 *
 * Zwei Sektionen, TB-04 zuerst (sanktionsbewehrt, zeitkritisch — dieselbe
 * Priorisierung wie auf der Startseite): `AusfaelleTabelle` (TB-04,
 * `ingest.ausfall_vorgang`/Freshness) vor `VollstaendigkeitTabelle` (DE-02,
 * strukturelle Stammdaten-Lücken).
 */
export function VollstaendigkeitDashboardPage(): ReactNode {
  return (
    <section aria-labelledby="vollstaendigkeit-dashboard-heading">
      <PageHeader headingId="vollstaendigkeit-dashboard-heading" title={t('stammdaten.monitoring.listPage.title')} />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t('stammdaten.monitoring.ausfaelle.sectionTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <AusfaelleTabelle />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t('stammdaten.monitoring.vollstaendigkeit.sectionTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <VollstaendigkeitTabelle />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export default VollstaendigkeitDashboardPage;
