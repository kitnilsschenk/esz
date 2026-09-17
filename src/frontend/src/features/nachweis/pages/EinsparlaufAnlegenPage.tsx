import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EinsparlaufAnlegenFormular } from '../components';
import { Badge } from '../../../shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { kurzId } from '../../stammdaten/components/shared';
import { usePreflightDetailView } from '../hooks';
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle';
import { useBrotkrumen } from '../../../shared/routing/useBrotkrumen';
import { t } from '../../../shared/i18n/t';

/**
 * Route-Container `/nachweis/preflights/:preflightId/einsparlauf-neu`.
 *
 * Der Lauf hängt bewusst UNTER der Vollständigkeitsprüfung: Förderjahr und
 * Prüfung sind damit über die Adresse festgelegt und nicht eintippbar, und
 * das Formular kennt das Prüfergebnis — die Grundlage dafür, dass der
 * Förderjahr-Nachweis nur nach bestandener Prüfung überhaupt zur Wahl steht.
 *
 * Über der Maske steht, worauf der Lauf aufsetzt. Wer einen Nachweis rechnet,
 * soll dessen Grundlage sehen, ohne zurückblättern zu müssen.
 */
export function EinsparlaufAnlegenPage(): ReactNode {
  const { preflightId } = useParams<{ preflightId: string }>();
  const view = usePreflightDetailView(preflightId ?? '');

  useDocumentTitle(t('nachweis.einsparlauf.createPage.title'));
  useBrotkrumen(
    preflightId !== undefined
      ? [
          { label: t('nachweis.brotkrume.foerderjahre'), to: '/nachweis/foerderjahre' },
          { label: t('nachweis.brotkrume.preflight'), to: `/nachweis/preflights/${preflightId}` },
          { label: t('nachweis.brotkrume.neu') },
        ]
      : [],
  );

  if (preflightId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  if (view.isPending) {
    return (
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {t('stammdaten.common.laedt')}
      </p>
    );
  }

  if (view.isError || view.foerderjahrId === undefined) {
    return (
      <p role="alert" className="text-sm font-medium text-destructive-text">
        {t('stammdaten.common.fehler')}
      </p>
    );
  }

  return (
    <section aria-labelledby="einsparlauf-anlegen-heading" className="space-y-6">
      <h1 id="einsparlauf-anlegen-heading" className="text-xl font-bold text-foreground">
        {t('nachweis.einsparlauf.createPage.title')}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t('nachweis.einsparlauf.createPage.kontextSectionTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
            <div className="space-y-1">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('nachweis.einsparlauf.createPage.kontextFoerderjahr')}
              </dt>
              <dd className="text-sm text-foreground">
                <Link
                  to={`/nachweis/foerderjahre/${view.foerderjahrId}`}
                  className="text-link underline-offset-4 hover:underline"
                >
                  {kurzId(view.foerderjahrId)}
                </Link>
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('nachweis.einsparlauf.createPage.kontextPreflight')}
              </dt>
              <dd className="text-sm text-foreground">{kurzId(preflightId)}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('nachweis.einsparlauf.createPage.kontextErgebnis')}
              </dt>
              <dd className="text-sm text-foreground">
                <Badge variant={view.ergebnisBadgeVariante}>{view.ergebnisLabel}</Badge>
              </dd>
            </div>
          </dl>
          {!view.istGruen && (
            <p className="text-sm text-muted-foreground">{t('nachweis.einsparlauf.createPage.hinweisRot')}</p>
          )}
          <p className="text-sm text-muted-foreground">{t('nachweis.einsparlauf.createPage.hinweisDauer')}</p>
        </CardContent>
      </Card>

      <EinsparlaufAnlegenFormular
        foerderjahrId={view.foerderjahrId}
        preflightId={preflightId}
        preflightIstGruen={view.istGruen}
      />

      <p>
        <Link to={`/nachweis/preflights/${preflightId}`} className="text-link underline-offset-4 hover:underline">
          {t('nachweis.einsparlauf.createPage.backAction')}
        </Link>
      </p>
    </section>
  );
}

export default EinsparlaufAnlegenPage;
