import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DetailView } from '../shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { MesskanaeleTabelle } from '../messkanal';
import { useZaehlerDetailView } from '../../hooks/zaehler';
import { ZaehlerAendernFormular } from './ZaehlerAendernFormular';
import { ZaehlerStilllegenAktion } from './ZaehlerStilllegenAktion';
import { ZaehlerStandortBlock } from './ZaehlerStandortBlock';
import { ErwarteteMesskanaeleHinweis } from './ErwarteteMesskanaeleHinweis';
import { GeraetAnbindungAbschnitt } from '../geraetZuordnung';
import { ZaehlerFreshnessStatus } from './ZaehlerFreshnessStatus';
import { t } from '../../../../shared/i18n/t';

export interface ZaehlerDetailAnsichtProps {
  readonly zaehlerId: string;
}

/**
 * Zähler-Detail (`ADR-0008 §23 / D11 Pass 1`): NICHT-PII — alle Felder über
 * `DetailView`s generisches `fields`-Array. Enthält das inline
 * „Ändern"-Formular, die „Stilllegen"-Aktion (nur solange NICHT bereits
 * stillgelegt) sowie die eingebettete Messkanäle-Liste dieses Zählers
 * (Sub-Ressource, KEINE eigene Top-Level-Route) mit Link zum
 * „Messkanal anlegen"-Formular. Die Messkanäle-Sektion sitzt in einer
 * `Card` — konsistente Optik zum `DetailView`-Kern (Phase 4c-Feinschliff).
 *
 * Betriebs-UI-Konzept Punkt 3 („Was liefert der Zähler?") ergänzt ZWEI
 * Blöcke DIREKT unter dem Kopf, VOR dem bestehenden Ändern-/Stilllegen-Inhalt
 * (dessen Position bleibt unverändert): `ZaehlerStandortBlock`
 * (Standort-Breadcrumb + Empty-State-CTA „Standort zuordnen") und
 * `ZaehlerFreshnessStatus` (zusammengefasster Datenfluss-Status, KEIN
 * break-glass). Die Messkanäle-Tabelle selbst trägt zusätzlich eine
 * „Letzte Übertragung"-Spalte + die Aktion „Lastgang ansehen"
 * (break-glass, s. `MesskanaeleTabelle`/`MesskanalLastgangPanel`).
 *
 * A11y-Härtung (WCAG 2.2 AA 4.1.3 „Status Messages"): erfolgreiches
 * Stilllegen wird über eine `role="status" aria-live="polite"`-Region HIER
 * (in der Detail-Ansicht, NICHT in `ZaehlerStilllegenAktion` selbst)
 * angesagt — die Aktions-Card verschwindet nach Erfolg (`istStillgelegt`
 * wird `true`), eine Ansage dort wäre also nicht verlässlich hörbar. Die
 * Region bleibt permanent im DOM (leer, bis zum Erfolg) für zuverlässige
 * AT-Unterstützung. Ein `useEffect` erkennt die false→true-Flanke von
 * `istStillgelegt` NACH dem ersten (nicht-pendenten) Laden — verhindert eine
 * Falschmeldung, wenn ein bereits stillgelegter Zähler aufgerufen wird.
 */
export function ZaehlerDetailAnsicht({ zaehlerId }: ZaehlerDetailAnsichtProps): ReactNode {
  const view = useZaehlerDetailView(zaehlerId);
  const [stilllegenErfolgsmeldung, setStilllegenErfolgsmeldung] = useState<string | undefined>(undefined);
  const vorherigerIstStillgelegtRef = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (view.isPending || view.isError) {
      return;
    }
    const vorher = vorherigerIstStillgelegtRef.current;
    vorherigerIstStillgelegtRef.current = view.istStillgelegt;
    if (vorher === false && view.istStillgelegt) {
      setStilllegenErfolgsmeldung(t('stammdaten.zaehler.detail.stilllegenErfolgreich'));
    }
  }, [view.isPending, view.isError, view.istStillgelegt]);

  return (
    <DetailView
      headingId="zaehler-detail-heading"
      title={t('stammdaten.zaehler.detailPage.title')}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      fields={view.fields}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {stilllegenErfolgsmeldung ?? ''}
      </p>
      <GeraetAnbindungAbschnitt
        zaehlerId={zaehlerId}
        anbindung={view.geraetAnbindung}
        headingId="zaehler-detail-geraet-anbindung-heading"
      />
      <ZaehlerStandortBlock zaehlerId={zaehlerId} />
      <ZaehlerFreshnessStatus zaehlerId={zaehlerId} />
      <ZaehlerAendernFormular zaehlerId={zaehlerId} />
      {!view.istStillgelegt && <ZaehlerStilllegenAktion zaehlerId={zaehlerId} />}
      <section aria-labelledby="zaehler-detail-messkanaele-heading">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle id="zaehler-detail-messkanaele-heading" as="h2">
              {t('stammdaten.zaehler.detail.messkanaeleSectionTitle')}
            </CardTitle>
            <Link
              to={`/stammdaten/zaehler/${zaehlerId}/messkanaele/neu`}
              className="text-sm text-link underline-offset-4 hover:underline"
            >
              {t('stammdaten.zaehler.detail.messkanalAnlegenAction')}
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            <ErwarteteMesskanaeleHinweis zaehlerId={zaehlerId} geraetetyp={view.geraetetyp} />
            <MesskanaeleTabelle zaehlerId={zaehlerId} />
          </CardContent>
        </Card>
      </section>
      <p>
        <Link to="/stammdaten/zaehler" className="text-link underline-offset-4 hover:underline">
          {t('stammdaten.zaehler.detailPage.backAction')}
        </Link>
      </p>
    </DetailView>
  );
}
