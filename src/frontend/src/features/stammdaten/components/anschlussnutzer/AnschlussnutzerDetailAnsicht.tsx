import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DetailView, PiiMaskedField } from '../shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { useAnschlussnutzerDetailView, useAnschlussnutzerEntsperrenView } from '../../hooks/anschlussnutzer';
import { AnschlussnutzerSperrenAktion } from './AnschlussnutzerSperrenAktion';
import { ConsentStandAbschnitt } from '../../../consent';
import { EinschraenkungAufhebenAktion } from '../shared';
import { t } from '../../../../shared/i18n/t';

export interface AnschlussnutzerDetailAnsichtProps {
  readonly anschlussnutzerId: string;
}

/**
 * Anschlussnutzer-Detail (`ADR-0008 §23 / D11 Phase 4c Pass 2`, Muster =
 * `EndkundeDetailAnsicht`): Nicht-PII-Kernfelder über `DetailView`, PII
 * (Name/Kontakt) GETRENNT über `PiiMaskedField` — die API liefert
 * `stammdatenPii` bereits rollen-/status-maskiert (D6); diese Komponente
 * entschlüsselt/berechnet nichts, sie zeigt nur an. Die PII-Sektion sitzt in
 * einer `Card` — konsistente Optik zum `DetailView`-Kern (Phase 4c-Feinschliff).
 *
 * Der `<dl>` um `PiiMaskedField` bekommt EXPLIZIT dieselbe Grid-Klasse wie
 * `DetailView.tsx`s Kernfelder-`<dl>` (A11y-Härtung, analog
 * `EndkundeDetailAnsicht`) — ohne sie greift die globale `dl`-Fallback-Regel
 * in `globals.css` und verzerrt die PII-Felder zu einem ungewollten
 * 2-Spalten-Layout.
 */
export function AnschlussnutzerDetailAnsicht({ anschlussnutzerId }: AnschlussnutzerDetailAnsichtProps): ReactNode {
  const view = useAnschlussnutzerDetailView(anschlussnutzerId);
  const entsperrenView = useAnschlussnutzerEntsperrenView(anschlussnutzerId);

  return (
    <DetailView
      headingId="anschlussnutzer-detail-heading"
      title={t('stammdaten.anschlussnutzer.detailPage.title')}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      fields={view.fields}
    >
      <section aria-labelledby="anschlussnutzer-detail-pii-heading">
        <Card>
          <CardHeader>
            <CardTitle id="anschlussnutzer-detail-pii-heading" as="h2">
              {t('stammdaten.anschlussnutzer.detail.piiSectionTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-y-4">
              <PiiMaskedField label={t('stammdaten.anschlussnutzer.detail.piiName')} value={view.pii.name} />
              <PiiMaskedField label={t('stammdaten.anschlussnutzer.detail.piiKontakt')} value={view.pii.kontakt} />
            </dl>
          </CardContent>
        </Card>
      </section>
      {/*
        DS-07: Im Mietfall ist der ANSCHLUSSNUTZER die betroffene Person --
        er willigt selbst ein, nicht der Endkunde fuer ihn. Deshalb steht der
        Consent-Stand auch hier, nicht nur am Endkunden.
      */}
      <ConsentStandAbschnitt
        subjektTyp="anschlussnutzer"
        subjektId={anschlussnutzerId}
        headingId="anschlussnutzer-detail-consent-heading"
      />
      {!view.istGesperrt && !view.istGeloescht && <AnschlussnutzerSperrenAktion anschlussnutzerId={anschlussnutzerId} />}
      {view.istGesperrt && <EinschraenkungAufhebenAktion {...entsperrenView} />}
      <p>
        <Link to="/stammdaten/anschlussnutzer" className="text-link underline-offset-4 hover:underline">
          {t('stammdaten.anschlussnutzer.detailPage.backAction')}
        </Link>
      </p>
    </DetailView>
  );
}
