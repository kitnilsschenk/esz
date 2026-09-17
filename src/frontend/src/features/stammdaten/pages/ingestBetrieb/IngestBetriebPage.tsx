import type { ReactNode } from 'react';
import { IngestQuarantaeneTabelle, IngestStatusPanel } from '../../components/ingestBetrieb';
import { IngestQuellenTabelle, QuelleAnlegenFormular } from '../../components/ingestQuelle';
import { HerkunftMappingAbschnitt } from '../../components/herkunftMapping';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { Tabs } from '../../../../shared/ui/tabs';
import { PageHeader } from '../../components/shared';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { t } from '../../../../shared/i18n/t';

/**
 * Route-Container `/monitoring/ingest` (ADR-0011 A2) — die Ansicht, an der
 * beim Anschließen eines Zählers tatsächlich gearbeitet wird: kommt etwas an,
 * und was bleibt liegen?
 *
 * **Warum Reiter statt einer langen Seite.** Diese Seite trug sechs Abschnitte
 * untereinander: Broker-Zustand, letzte Ereignisse, Liegengebliebenes, die
 * Datenquellen mit einem dreizehnfeldrigen Anlegen-Formular, den Arbeitsvorrat
 * und die Herkunfts-Zuordnung mit einem weiteren Formular. Wer den
 * Arbeitsvorrat sehen wollte — der häufigste Grund, hierher zu kommen —
 * scrollte an zwei Formularen vorbei und hatte den Zustand oben längst aus
 * dem Blick.
 *
 * Die vier Reiter sind vier Fragen, und ihre Reihenfolge ist die, in der man
 * sie stellt: Läuft es? → Was liegt liegen? → Ist die richtige Quelle
 * konfiguriert? → Sind die Geräte richtig zugeordnet? Die `Tabs`-Primitive
 * rendert nur den aktiven Bereich; die Listen der übrigen laden gar nicht
 * erst.
 */
export function IngestBetriebPage(): ReactNode {
  useBrotkrumen([{ label: t('stammdaten.ingestBetrieb.pageTitle') }]);

  return (
    <section aria-labelledby="ingest-betrieb-heading">
      <PageHeader headingId="ingest-betrieb-heading" title={t('stammdaten.ingestBetrieb.pageTitle')} />
      <div className="space-y-6">
        <p className="max-w-prose text-sm text-muted-foreground">{t('stammdaten.ingestBetrieb.einfuehrung')}</p>
        <Tabs
          ariaLabel={t('stammdaten.ingestBetrieb.tabsAriaLabel')}
          items={[
            {
              id: 'ueberblick',
              label: t('stammdaten.ingestBetrieb.tabs.ueberblick'),
              content: <IngestStatusPanel />,
            },
            {
              id: 'arbeitsvorrat',
              label: t('stammdaten.ingestBetrieb.tabs.arbeitsvorrat'),
              content: <IngestQuarantaeneTabelle />,
            },
            {
              id: 'quellen',
              label: t('stammdaten.ingestBetrieb.tabs.quellen'),
              content: (
                <section aria-labelledby="ingest-quellen-verwaltung-heading">
                  <Card>
                    <CardHeader>
                      <CardTitle id="ingest-quellen-verwaltung-heading" as="h2">
                        {t('stammdaten.ingestQuelle.pageTitle')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <IngestQuellenTabelle />
                      <QuelleAnlegenFormular />
                    </CardContent>
                  </Card>
                </section>
              ),
            },
            {
              id: 'herkunft',
              label: t('stammdaten.ingestBetrieb.tabs.herkunft'),
              content: (
                <Card>
                  <CardHeader>
                    <CardTitle as="h2">{t('stammdaten.herkunftMapping.titel')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="max-w-prose text-sm text-muted-foreground">
                      {t('stammdaten.herkunftMapping.beschreibung')}
                    </p>
                    <HerkunftMappingAbschnitt />
                  </CardContent>
                </Card>
              ),
            },
          ]}
        />
      </div>
    </section>
  );
}

export default IngestBetriebPage;
