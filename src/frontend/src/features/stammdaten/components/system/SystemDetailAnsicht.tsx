import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DetailView } from '../shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { useSystemDetailView } from '../../hooks/system';
import { ZaehlerTabelle } from '../zaehler';
import { useKannEinflussgroesseLesen } from '../../hooks/einflussgroesse';
import { SystemAendernFormular } from './SystemAendernFormular';
import { SystemStilllegenAktion } from './SystemStilllegenAktion';
import { SystemEntbehrlichAktion } from '../../../geraeteerkennung';
import { t } from '../../../../shared/i18n/t';

export interface SystemDetailAnsichtProps {
  readonly systemId: string;
}

/**
 * System-Detail (`ADR-0008 §23 / D11 Pass 1`, Stilllegen ergänzt in
 * Feature-Pass A — analog `ZaehlerDetailAnsicht`): NICHT-PII — alle Felder
 * über `DetailView`s generisches `fields`-Array, kein `PiiMaskedField`.
 * Enthält das inline „Ändern"-Formular (`SystemAendernFormular`) sowie die
 * „Stilllegen"-Aktion (nur solange NICHT bereits stillgelegt,
 * `useSystemDetailView().istStillgelegt`).
 *
 * A11y-Härtung (WCAG 2.2 AA 4.1.3 „Status Messages"): erfolgreiches
 * Stilllegen wird über eine `role="status" aria-live="polite"`-Region HIER
 * (in der Detail-Ansicht, NICHT in `SystemStilllegenAktion` selbst) angesagt
 * — die Aktions-Card verschwindet nach Erfolg (`istStillgelegt` wird `true`),
 * eine Ansage dort wäre also nicht verlässlich hörbar. Die Region bleibt
 * permanent im DOM (leer, bis zum Erfolg) für zuverlässige
 * AT-Unterstützung. Ein `useEffect` erkennt die false→true-Flanke von
 * `istStillgelegt` NACH dem ersten (nicht-pendenten) Laden — verhindert eine
 * Falschmeldung, wenn ein bereits stillgelegtes System aufgerufen wird.
 *
 * Zähler-Sektion: Die Zugehörigkeit `zaehler.systemId -> system.id` besteht
 * im Datenmodell, war in der Oberfläche aber nirgends begehbar — vom System
 * führte kein Weg zu seinen Zählern, und die globale Zählerliste ist über
 * Pseudonym-IDs praktisch nicht durchsuchbar. Die Liste ist EINGEBETTET
 * (anders als bei den Einflussgrößen unten): `ZaehlerListItem` ist PII-frei,
 * der serverseitige `?systemId=`-Filter existiert bereits, und es wird kein
 * auditierter Klartext-Zugriff ausgelöst.
 *
 * Einflussgrößen-Sektion (ADR-0006 Teil B, B8/B10, rollen-gegatet via
 * `useKannEinflussgroesseLesen` — NUR Betriebs-Team): zeigt AUSSCHLIESSLICH
 * zwei CTA-Links („Einflussgrößen anzeigen"/„Einflussgröße erfassen"), KEINE
 * eingebettete Tabelle — anders als z. B. `ZaehlerDetailAnsicht`s
 * `MesskanaeleTabelle` würde eine hier eingebettete Liste den auditierten
 * Klartext-PII-Aufruf beiläufig bei jedem Render dieser Seite auslösen (s.
 * `hooks/einflussgroesse/useKannEinflussgroesseLesen.ts`).
 */
export function SystemDetailAnsicht({ systemId }: SystemDetailAnsichtProps): ReactNode {
  const view = useSystemDetailView(systemId);
  const kannEinflussgroessenSehen = useKannEinflussgroesseLesen();
  const [stilllegenErfolgsmeldung, setStilllegenErfolgsmeldung] = useState<string | undefined>(undefined);
  const vorherigerIstStillgelegtRef = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (view.isPending || view.isError) {
      return;
    }
    const vorher = vorherigerIstStillgelegtRef.current;
    vorherigerIstStillgelegtRef.current = view.istStillgelegt;
    if (vorher === false && view.istStillgelegt) {
      setStilllegenErfolgsmeldung(t('stammdaten.system.detail.stilllegenErfolgreich'));
    }
  }, [view.isPending, view.isError, view.istStillgelegt]);

  return (
    <DetailView
      headingId="system-detail-heading"
      title={t('stammdaten.system.detailPage.title')}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      fields={view.fields}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {stilllegenErfolgsmeldung ?? ''}
      </p>
      <section aria-labelledby="system-detail-zaehler-heading">
        <Card>
          <CardHeader>
            <CardTitle id="system-detail-zaehler-heading" as="h2">
              {t('stammdaten.system.detail.zaehlerSectionTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ZaehlerTabelle systemId={systemId} />
          </CardContent>
        </Card>
      </section>
      {/*
        Die Entbehrlichkeits-Feststellung sitzt am SYSTEM, weil das Merkblatt
        sie dort verortet („bei Systemen, die nur ein Gerät umfassen") — und
        weil derjenige, der die Systemgrenze kennt, der einzige ist, der sie
        beurteilen kann.
      */}
      <SystemEntbehrlichAktion systemId={systemId} />
      <SystemAendernFormular systemId={systemId} />
      {!view.istStillgelegt && <SystemStilllegenAktion systemId={systemId} />}
      {kannEinflussgroessenSehen && (
        <section aria-labelledby="system-detail-einflussgroessen-heading">
          <Card>
            <CardHeader>
              <CardTitle id="system-detail-einflussgroessen-heading" as="h2">
                {t('stammdaten.system.detail.einflussgroessenSectionTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('stammdaten.system.detail.einflussgroessenSectionHinweis')}</p>
              <div className="flex flex-wrap gap-4 text-sm">
                <Link to={`/stammdaten/systeme/${systemId}/einflussgroessen`} className="text-link underline-offset-4 hover:underline">
                  {t('stammdaten.system.detail.einflussgroessenAnzeigenAction')}
                </Link>
                <Link to={`/stammdaten/systeme/${systemId}/einflussgroessen/neu`} className="text-link underline-offset-4 hover:underline">
                  {t('stammdaten.system.detail.einflussgroesseErfassenAction')}
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>
      )}
      <p>
        <Link to="/stammdaten/systeme" className="text-link underline-offset-4 hover:underline">
          {t('stammdaten.system.detailPage.backAction')}
        </Link>
      </p>
    </DetailView>
  );
}
