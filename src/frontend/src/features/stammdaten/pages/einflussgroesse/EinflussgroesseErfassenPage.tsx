import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { EinflussgroesseErfassenFormular } from '../../components/einflussgroesse';
import { useKannEinflussgroesseLesen } from '../../hooks/einflussgroesse';
import { useDocumentTitle } from '../../../../shared/hooks/useDocumentTitle';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume } from '../../components/shared';

/**
 * Route-Container `/stammdaten/systeme/:systemId/einflussgroessen/neu`
 * (ADR-0006 Teil B, B8/B10) — Zugriffsverweigert-Hinweis ohne
 * `read:einflussgroesse`, s. `EinflussgroesseListePage`-Kommentar.
 */
export function EinflussgroesseErfassenPage(): ReactNode {
  const { systemId } = useParams<{ systemId: string }>();
  const kannLesen = useKannEinflussgroesseLesen();

  useBrotkrumen(
    systemId !== undefined
      ? [
          brotkrume.systemeListe(),
          brotkrume.system(systemId),
          { label: t('stammdaten.common.brotkrume.einflussgroessen'), to: `/stammdaten/systeme/${systemId}/einflussgroessen` },
          brotkrume.aktuell(t('stammdaten.common.brotkrume.erfassen')),
        ]
      : [],
  );
  useDocumentTitle(t('stammdaten.einflussgroesse.createPage.title'));

  if (systemId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  if (!kannLesen) {
    return <p role="alert">{t('stammdaten.einflussgroesse.zugriffVerweigert')}</p>;
  }

  return (
    <section aria-labelledby="einflussgroesse-erfassen-heading">
      <h1 id="einflussgroesse-erfassen-heading" className="mb-6 text-base font-bold text-foreground">
        {t('stammdaten.einflussgroesse.createPage.title')}
      </h1>
      <EinflussgroesseErfassenFormular systemId={systemId} />
    </section>
  );
}

export default EinflussgroesseErfassenPage;
