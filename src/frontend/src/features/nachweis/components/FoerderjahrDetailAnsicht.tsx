import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DetailView } from '../../stammdaten/components/shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { useFoerderjahrDetailView } from '../hooks';
import { PreflightAusfuehrenAktion } from './PreflightAusfuehrenAktion';
import { EinsparlaufTabelle } from './EinsparlaufTabelle';
import { t } from '../../../shared/i18n/t';

export interface FoerderjahrDetailAnsichtProps {
  readonly foerderjahrId: string;
}

/**
 * Förderjahr-Detail — der Ausgangspunkt der Nachweis-Kette. Die Seite zeigt
 * die Stammdaten, bietet darunter die Vollständigkeitsprüfung an und listet
 * schließlich die Einspar-Läufe, die bereits aus diesem Förderjahr entstanden
 * sind.
 *
 * Die Reihenfolge der Abschnitte IST die Reihenfolge der Kette: erst prüfen,
 * dann rechnen. Ein Einspar-Lauf lässt sich von hier aus bewusst NICHT direkt
 * starten — er entsteht immer aus einer konkreten Prüfung, deren Ergebnis
 * bestimmt, was zulässig ist.
 *
 * Alle Felder sind PII-frei.
 */
export function FoerderjahrDetailAnsicht({ foerderjahrId }: FoerderjahrDetailAnsichtProps): ReactNode {
  const view = useFoerderjahrDetailView(foerderjahrId);

  return (
    <DetailView
      headingId="foerderjahr-detail-heading"
      title={view.code ?? t('nachweis.foerderjahr.detailPage.title')}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      fields={view.fields}
    >
      <PreflightAusfuehrenAktion foerderjahrId={foerderjahrId} headingId="foerderjahr-detail-preflight-heading" />
      <section aria-labelledby="foerderjahr-detail-einsparlaeufe-heading">
        <Card>
          <CardHeader>
            <CardTitle id="foerderjahr-detail-einsparlaeufe-heading" as="h2">
              {t('nachweis.foerderjahr.detail.einsparlaeufeSectionTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EinsparlaufTabelle foerderjahrId={foerderjahrId} />
          </CardContent>
        </Card>
      </section>
      <p>
        <Link to="/nachweis/foerderjahre" className="text-link underline-offset-4 hover:underline">
          {t('nachweis.foerderjahr.detailPage.backAction')}
        </Link>
      </p>
    </DetailView>
  );
}
