import type { ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { EinflussgroesseKorrigierenFormular } from '../../components/einflussgroesse';
import { useKannEinflussgroesseLesen } from '../../hooks/einflussgroesse';
import { wertArtFuerGroesseCode } from '../../api/einflussgroesse';
import { useDocumentTitle } from '../../../../shared/hooks/useDocumentTitle';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume } from '../../components/shared';

/**
 * Route-Container
 * `/stammdaten/systeme/:systemId/einflussgroessen/:einflussgroesseId/korrigieren`
 * (ADR-0006 Teil B, B8/B10) — Zugriffsverweigert-Hinweis ohne
 * `read:einflussgroesse`, s. `EinflussgroesseListePage`-Kommentar.
 *
 * `?groesseCode=` (optional, gesetzt von `EinflussgroesseTabelle`s
 * Korrigieren-Link) liefert die `wert_art` der zu korrigierenden Größe für
 * die formular-seitige XOR-Validierung — es gibt in v1 KEINEN GET-Endpunkt
 * für ein einzelnes Intervall, daher dieser Umweg über die Liste (s.
 * `einflussgroesseKorrigierenFormSchema.ts`s Kopf-Kommentar). Fehlt der
 * Parameter (z. B. direkter Seitenaufruf), validiert das Formular nur
 * generisch — der Server bleibt so oder so die Autorität.
 */
export function EinflussgroesseKorrigierenPage(): ReactNode {
  const { systemId, einflussgroesseId } = useParams<{ systemId: string; einflussgroesseId: string }>();

  useBrotkrumen(
    systemId !== undefined
      ? [
          brotkrume.systemeListe(),
          brotkrume.system(systemId),
          { label: t('stammdaten.common.brotkrume.einflussgroessen'), to: `/stammdaten/systeme/${systemId}/einflussgroessen` },
          brotkrume.aktuell(t('stammdaten.common.brotkrume.korrigieren')),
        ]
      : [],
  );
  const [searchParams] = useSearchParams();
  const kannLesen = useKannEinflussgroesseLesen();
  useDocumentTitle(t('stammdaten.einflussgroesse.korrigierenSection.title'));

  if (systemId === undefined || einflussgroesseId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  if (!kannLesen) {
    return <p role="alert">{t('stammdaten.einflussgroesse.zugriffVerweigert')}</p>;
  }

  const groesseCodeParam = searchParams.get('groesseCode');
  const wertArt = groesseCodeParam !== null ? wertArtFuerGroesseCode(groesseCodeParam) : undefined;

  return (
    <section aria-labelledby="einflussgroesse-korrigieren-heading">
      <h1 id="einflussgroesse-korrigieren-heading" className="mb-6 text-base font-bold text-foreground">
        {t('stammdaten.einflussgroesse.korrigierenSection.title')}
      </h1>
      <EinflussgroesseKorrigierenFormular einflussgroesseId={einflussgroesseId} systemId={systemId} wertArt={wertArt} />
    </section>
  );
}

export default EinflussgroesseKorrigierenPage;
