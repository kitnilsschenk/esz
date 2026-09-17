import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EinflussgroesseTabelle } from '../../components/einflussgroesse';
import { PageHeader } from '../../components/shared';
import { useKannEinflussgroesseLesen } from '../../hooks/einflussgroesse';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume } from '../../components/shared';

/**
 * Route-Container `/stammdaten/systeme/:systemId/einflussgroessen`
 * (ADR-0006 Teil B, B8/B10). Ohne `read:einflussgroesse`
 * (`useKannEinflussgroesseLesen`) wird NUR ein Zugriffsverweigert-Hinweis
 * gezeigt — stärker als das sonst übliche reine Link-Ausblenden (Arbeits-
 * auftrag, wörtlich: "Routen dürfen für Auditor NICHT sichtbar/erreichbar
 * sein"). Der eigentliche Klartext-Aufruf bleibt trotzdem hinter dem CTA in
 * `EinflussgroesseTabelle` (Navigation zu dieser Seite allein löst NICHTS
 * aus).
 */
export function EinflussgroesseListePage(): ReactNode {
  const { systemId } = useParams<{ systemId: string }>();
  const kannLesen = useKannEinflussgroesseLesen();
  const kannAnlegen = useKannStammdatenAnlegen();

  useBrotkrumen(
    systemId !== undefined
      ? [
          brotkrume.systemeListe(),
          brotkrume.system(systemId),
          brotkrume.aktuell(t('stammdaten.common.brotkrume.einflussgroessen')),
        ]
      : [],
  );

  if (systemId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  if (!kannLesen) {
    return <p role="alert">{t('stammdaten.einflussgroesse.zugriffVerweigert')}</p>;
  }

  return (
    <section aria-labelledby="einflussgroesse-liste-heading">
      <PageHeader
        headingId="einflussgroesse-liste-heading"
        title={t('stammdaten.einflussgroesse.listPage.title')}
        {...(kannAnlegen
          ? { createAction: { to: `/stammdaten/systeme/${systemId}/einflussgroessen/neu`, label: t('stammdaten.einflussgroesse.listPage.createAction') } }
          : {})}
      />
      <EinflussgroesseTabelle systemId={systemId} />
      <p className="mt-4">
        <Link to={`/stammdaten/systeme/${systemId}`} className="text-link underline-offset-4 hover:underline">
          {t('stammdaten.einflussgroesse.listPage.backAction')}
        </Link>
      </p>
    </section>
  );
}

export default EinflussgroesseListePage;
