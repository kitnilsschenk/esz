import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { Badge } from '../../../../shared/ui/badge';
import { useIngestStatusView } from '../../hooks/ingestBetrieb';
import { t } from '../../../../shared/i18n/t';

/**
 * Betriebszustand der Aufnahme: drei Zeitpunkte und die Verteilung dessen,
 * was liegen blieb.
 *
 * **Es gibt hier bewusst keine Verbindungsampel.** Der Server kann sie nicht
 * liefern — die Aufnahme läuft in einem eigenen Prozess, dessen Zustand
 * nirgends hinterlegt ist. Statt eine zu erfinden, steht der Schreibzeitpunkt
 * im Vordergrund: „vor 4 Std." ist bei einem stündlich sendenden Gerät die
 * Störungsmeldung, und zwar eine belegte.
 */
export function IngestStatusPanel(): ReactNode {
  const view = useIngestStatusView();

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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section aria-labelledby="ingest-quellen-heading" className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle id="ingest-quellen-heading" as="h2">
              {t('stammdaten.ingestBetrieb.quellen.sectionTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('stammdaten.ingestBetrieb.quellen.einfuehrung')}</p>
            {view.keineQuellen ? (
              <p className="text-sm font-medium text-destructive-text">{t('stammdaten.ingestBetrieb.quellen.keine')}</p>
            ) : (
              <ul className="space-y-4">
                {view.quellen.map((quelle) => (
                  <li key={quelle.quelleCode} className="space-y-2 border-l-2 border-border pl-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-medium text-foreground">{quelle.quelleCode}</span>
                      <Badge variant={quelle.zustandBadgeVariante}>{quelle.zustandLabel}</Badge>
                    </div>
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">{t('stammdaten.ingestBetrieb.quellen.broker')}</dt>
                        <dd className="text-foreground">{quelle.brokerHost}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">{t('stammdaten.ingestBetrieb.quellen.topic')}</dt>
                        <dd>
                          <code className="break-all font-mono text-xs text-foreground">{quelle.topic}</code>
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">{t('stammdaten.ingestBetrieb.quellen.clientId')}</dt>
                        <dd className="text-foreground">{quelle.clientId}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">
                          {t('stammdaten.ingestBetrieb.quellen.letzterHerzschlag')}
                        </dt>
                        <dd className="text-foreground">
                          {quelle.herzschlagLabel}
                          <span className="ml-2 text-muted-foreground">({quelle.herzschlagRelativ})</span>
                        </dd>
                      </div>
                    </dl>
                    {quelle.zustandHinweis.length > 0 && (
                      <p className="text-sm text-destructive-text">{quelle.zustandHinweis}</p>
                    )}
                    {/*
                      Getrennt vom Zustands-Hinweis, weil es eine ANDERE Frage
                      beantwortet: nicht „laeuft der Prozess?", sondern „gilt
                      das, was in der Verwaltung steht, auch fuer ihn?". Ein
                      Worker kann tadellos laufen und trotzdem mit einer
                      ueberholten Konfiguration arbeiten.
                    */}
                    {quelle.konfigurationHinweis.length > 0 && (
                      <p className="max-w-prose text-sm text-destructive-text">{quelle.konfigurationHinweis}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="ingest-status-heading">
        <Card>
          <CardHeader>
            <CardTitle id="ingest-status-heading" as="h2">
              {t('stammdaten.ingestBetrieb.status.sectionTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-3">
              {view.kennzahlen.map((kennzahl) => (
                <div key={kennzahl.key} className="space-y-1">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kennzahl.label}</dt>
                  <dd className="text-sm text-foreground">
                    {kennzahl.wert}
                    {kennzahl.relativ.length > 0 && (
                      <span className="ml-2 text-muted-foreground">({kennzahl.relativ})</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {view.nochNieDatenEmpfangen && (
              <p className="text-sm text-muted-foreground">{t('stammdaten.ingestBetrieb.status.nochNieHinweis')}</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="ingest-quarantaene-verteilung-heading">
        <Card>
          <CardHeader>
            <CardTitle id="ingest-quarantaene-verteilung-heading" as="h2">
              {t('stammdaten.ingestBetrieb.status.quarantaeneSectionTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-foreground">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('stammdaten.ingestBetrieb.status.quarantaeneGesamt')}
              </span>{' '}
              <span className="text-2xl font-bold">{view.quarantaeneGesamtLabel}</span>
            </p>
            {view.gruende.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('stammdaten.ingestBetrieb.status.quarantaeneLeer')}</p>
            ) : (
              <ul className="space-y-2">
                {view.gruende.map((zeile) => (
                  <li key={zeile.grund} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-foreground">{zeile.grundLabel}</span>
                    <Badge variant="outline">{zeile.anzahlLabel}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
