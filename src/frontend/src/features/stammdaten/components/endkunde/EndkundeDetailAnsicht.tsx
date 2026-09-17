import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DetailView, PiiMaskedField } from '../shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { Tabs } from '../../../../shared/ui/tabs';
import { MesskonzeptVersionenTabelle } from '../messkonzept';
import { SystemeTabelle } from '../system';
import { AnschlussnutzerTabelle } from '../anschlussnutzer';
import { EndkundeSperrenAktion } from './EndkundeSperrenAktion';
import { EinschraenkungAufhebenAktion } from '../shared';
import { EndkundeShreddenAktion } from './EndkundeShreddenAktion';
import { EndkundeShredAntragOffen } from './EndkundeShredAntragOffen';
import { EndkundeVerbrauchTab } from './EndkundeVerbrauchTab';
import { useEndkundeDetailView, useEndkundeShredAntragOffenView,
  useEndkundeEntsperrenView,
} from '../../hooks/endkunde';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import { ConsentStandAbschnitt } from '../../../consent';
import { NutzerinfoVerlaufAbschnitt } from '../../../nutzerinfo';
import { PortalZugangAbschnitt } from '../../../portal';
import { GeraeteerkennungAbschnitt } from '../../../geraeteerkennung';
import { t } from '../../../../shared/i18n/t';

export interface EndkundeDetailAnsichtProps {
  readonly endkundeId: string;
}

/**
 * Endkunde-Detail (`ADR-0008 §23 / D11`, Sperren/Kryptoshredding/Bearbeiten
 * ergänzt in Feature-Pass B): Nicht-PII-Kernfelder über `DetailView`, PII
 * (Name/Anschrift/Kontakt) GETRENNT über `PiiMaskedField` — die API liefert
 * `stammdatenPii` bereits rollen-/status-maskiert (D6); diese Komponente
 * entschlüsselt/berechnet nichts, sie zeigt nur an.
 *
 * Enthält zusätzlich die eingebettete Messkonzept-Versionen-Liste dieses
 * Endkunden (Sub-Ressource, KEINE eigene Top-Level-Route — additive
 * Erweiterung Phase 4c Pass 2, analog `MesskanaeleTabelle` in
 * `ZaehlerDetailAnsicht`). Der „Neue Version anlegen"-Link ist für Rollen
 * ohne `betrieb` ausgeblendet (rein kosmetisch, `useKannStammdatenAnlegen`).
 *
 * Feature-Pass B ergänzt (alle rollen-gated `betrieb`, rein kosmetisch —
 * die Backend-Guards sind die alleinige Durchsetzungsinstanz):
 * - „Bearbeiten"-Link (PII-Section-Header) zur eigenen Ändern-Route
 *   (`/stammdaten/endkunden/:endkundeId/aendern`, ANDERS als
 *   System/Zähler/Messkanal, deren Ändern-Formular inline im Detail lebt).
 * - `EndkundeSperrenAktion` (Art. 18) — nur solange NICHT bereits gesperrt
 *   ODER geschreddert.
 * - Krypto-Shredding (Art. 17, ADR-0009 Vier-Augen-Workflow) — GENAU EINE der
 *   beiden folgenden Sektionen ist sichtbar (mutually exclusive über
 *   `useEndkundeShredAntragOffenView`, solange NICHT bereits geschreddert):
 *   `EndkundeShredAntragOffen` (existiert ein Antrag im Status `beantragt` —
 *   Freigeben/Ablehnen) ODER `EndkundeShreddenAktion` (kein offener Antrag —
 *   „beantragen"-Button). Während die Antrags-Abfrage noch lädt, wird KEINE
 *   der beiden gezeigt (kein Flackern, analog `useKannStammdatenAnlegen`s
 *   „lieber kurz verstecken").
 *
 * Beide eigenen Sektionen (PII, Messkonzept-Versionen) sitzen je in einer
 * `Card` — konsistente Optik zum `DetailView`-Kern (Phase 4c-Feinschliff).
 * `CardTitle as="h2"` hält die Überschriften-Hierarchie unter dem `<h1>` des
 * `DetailView`-Kerns intakt (axe `heading-order`).
 *
 * Der `<dl>` um `PiiMaskedField` bekommt EXPLIZIT dieselbe Grid-Klasse wie
 * `DetailView.tsx`s Kernfelder-`<dl>` (A11y-Härtung) — ohne sie greift die
 * globale `dl`-Fallback-Regel in `globals.css` (für noch nicht restylte
 * `<dl>`s, z. B. `HealthStatusPanel`) und verzerrt die PII-Felder zu einem
 * ungewollten 2-Spalten-Layout.
 *
 * A11y-Härtung (WCAG 2.2 AA 4.1.3 „Status Messages"): erfolgreiches
 * Sperren/Schreddern wird über EINE gemeinsame `role="status"
 * aria-live="polite"`-Region HIER (permanent im DOM, analog
 * `SystemDetailAnsicht`) angesagt — die jeweilige Aktions-Card verschwindet
 * nach Erfolg, eine Ansage dort wäre also nicht verlässlich hörbar. Zwei
 * unabhängige `useEffect`s erkennen je eine false→true-Flanke (NACH dem
 * ersten, nicht-pendenten Laden) — verhindert Falschmeldungen, wenn ein
 * bereits gesperrter/geschredderter Endkunde direkt aufgerufen wird. Die
 * Live-Region liegt bewusst AUSSERHALB der `Tabs` (nicht im „Übersicht"-Tab-
 * Inhalt) — sie muss unabhängig vom aktiven Tab dauerhaft im DOM bleiben.
 *
 * Betriebs-UI-Konzept Punkt 4 (Priorität 5) ergänzt einen zweiten Tab
 * „Verbrauch" (`EndkundeVerbrauchTab`) NEBEN dem bisherigen — jetzt
 * „Übersicht" genannten — Inhalt (`Tabs`-Primitive, `shared/ui/tabs.tsx`).
 * Nur der AKTIVE Tab wird gerendert (kein Hintergrund-Laden des
 * Verbrauchs-Tabs, solange „Übersicht" aktiv ist).
 *
 * ADR-0006 Betriebs-UI ergänzt EINE weitere reine Lese-Sektion
 * „Berechnungsläufe" (analog „Standorte / Gebäudestruktur" direkt darüber) —
 * NUR ein Link zur Sub-Ressourcen-Liste (`/stammdaten/endkunden/:endkundeId/
 * berechnungen`, `BerechnungslaufTabelle`), KEIN eingebetteter Tabelleninhalt
 * (die Läufe können viele Monatszeilen tragen, eine eigene Seite passt
 * besser als eine Tab-Inline-Tabelle). Bewusst UNGATED (kein
 * `useKannStammdatenAnlegen`-Check, anders als „Bearbeiten"/„Neue Version
 * anlegen"): `read:berechnungslauf` (Rollen `betrieb`/`compliance-auditor`)
 * deckt sich exakt mit den Rollen, die diese Detailseite überhaupt sehen
 * dürfen (`endkunde.controller.ts` `lesen()`) — jede Rolle, die hierher
 * navigieren kann, darf auch die Läufe lesen, analog „Standorte anzeigen".
 */
export function EndkundeDetailAnsicht({ endkundeId }: EndkundeDetailAnsichtProps): ReactNode {
  const view = useEndkundeDetailView(endkundeId);
  const entsperrenView = useEndkundeEntsperrenView(endkundeId);
  const shredAntragView = useEndkundeShredAntragOffenView(endkundeId);
  const kannAnlegen = useKannStammdatenAnlegen();
  const [aktionErfolgsmeldung, setAktionErfolgsmeldung] = useState<string | undefined>(undefined);
  const vorherigerIstGesperrtRef = useRef<boolean | undefined>(undefined);
  const vorherigerIstGeschreddertRef = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (view.isPending || view.isError) {
      return;
    }
    const vorher = vorherigerIstGesperrtRef.current;
    vorherigerIstGesperrtRef.current = view.istGesperrt;
    if (vorher === false && view.istGesperrt) {
      setAktionErfolgsmeldung(t('stammdaten.endkunde.detail.sperrenErfolgreich'));
    }
  }, [view.isPending, view.isError, view.istGesperrt]);

  useEffect(() => {
    if (view.isPending || view.isError) {
      return;
    }
    const vorher = vorherigerIstGeschreddertRef.current;
    vorherigerIstGeschreddertRef.current = view.istGeschreddert;
    if (vorher === false && view.istGeschreddert) {
      setAktionErfolgsmeldung(t('stammdaten.endkunde.detail.shreddernErfolgreich'));
    }
  }, [view.isPending, view.isError, view.istGeschreddert]);

  return (
    <DetailView
      headingId="endkunde-detail-heading"
      title={t('stammdaten.endkunde.detailPage.title')}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      fields={view.fields}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {aktionErfolgsmeldung ?? ''}
      </p>
      <Tabs
        ariaLabel={t('stammdaten.endkunde.detail.tabsAriaLabel')}
        items={[
          {
            id: 'uebersicht',
            label: t('stammdaten.endkunde.detail.tabUebersicht'),
            content: (
              <div className="space-y-6">
                <section aria-labelledby="endkunde-detail-pii-heading">
                  <Card>
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                      <CardTitle id="endkunde-detail-pii-heading" as="h2">
                        {t('stammdaten.endkunde.detail.piiSectionTitle')}
                      </CardTitle>
                      {kannAnlegen && (
                        <Link
                          to={`/stammdaten/endkunden/${endkundeId}/aendern`}
                          className="text-sm text-link underline-offset-4 hover:underline"
                        >
                          {t('stammdaten.endkunde.detail.bearbeitenAction')}
                        </Link>
                      )}
                    </CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-1 gap-y-4">
                        <PiiMaskedField label={t('stammdaten.endkunde.detail.piiName')} value={view.pii.name} />
                        <PiiMaskedField label={t('stammdaten.endkunde.detail.piiAnschrift')} value={view.pii.anschrift} />
                        <PiiMaskedField label={t('stammdaten.endkunde.detail.piiKontakt')} value={view.pii.kontakt} />
                      </dl>
                    </CardContent>
                  </Card>
                </section>
                <section aria-labelledby="endkunde-detail-systeme-heading">
                  <Card>
                    <CardHeader>
                      <CardTitle id="endkunde-detail-systeme-heading" as="h2">
                        {t('stammdaten.endkunde.detail.systemeSectionTitle')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <SystemeTabelle endkundeId={endkundeId} />
                    </CardContent>
                  </Card>
                </section>
                <section aria-labelledby="endkunde-detail-anschlussnutzer-heading">
                  <Card>
                    <CardHeader>
                      <CardTitle id="endkunde-detail-anschlussnutzer-heading" as="h2">
                        {t('stammdaten.endkunde.detail.anschlussnutzerSectionTitle')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <AnschlussnutzerTabelle endkundeId={endkundeId} />
                    </CardContent>
                  </Card>
                </section>
                <section aria-labelledby="endkunde-detail-messkonzept-heading">
                  <Card>
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                      <CardTitle id="endkunde-detail-messkonzept-heading" as="h2">
                        {t('stammdaten.endkunde.detail.messkonzeptSectionTitle')}
                      </CardTitle>
                      {kannAnlegen && (
                        <Link
                          to={`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen/neu`}
                          className="text-sm text-link underline-offset-4 hover:underline"
                        >
                          {t('stammdaten.endkunde.detail.messkonzeptAnlegenAction')}
                        </Link>
                      )}
                    </CardHeader>
                    <CardContent>
                      <MesskonzeptVersionenTabelle endkundeId={endkundeId} />
                    </CardContent>
                  </Card>
                </section>
                <section aria-labelledby="endkunde-detail-standorte-heading">
                  <Card>
                    <CardHeader>
                      <CardTitle id="endkunde-detail-standorte-heading" as="h2">
                        {t('stammdaten.endkunde.detail.standorteSectionTitle')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        <Link
                          to={`/stammdaten/endkunden/${endkundeId}/standorte`}
                          className="text-link underline-offset-4 hover:underline"
                        >
                          {t('stammdaten.endkunde.detail.standorteAnzeigenAction')}
                        </Link>
                      </p>
                    </CardContent>
                  </Card>
                </section>
                <section aria-labelledby="endkunde-detail-berechnung-heading">
                  <Card>
                    <CardHeader>
                      <CardTitle id="endkunde-detail-berechnung-heading" as="h2">
                        {t('stammdaten.endkunde.detail.berechnungSectionTitle')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        <Link
                          to={`/stammdaten/endkunden/${endkundeId}/berechnungen`}
                          className="text-link underline-offset-4 hover:underline"
                        >
                          {t('stammdaten.endkunde.detail.berechnungAnzeigenAction')}
                        </Link>
                      </p>
                    </CardContent>
                  </Card>
                </section>
              </div>
            ),
          },
          {
            /*
              Verbrauch UND Monatsbericht in einem Reiter: Beides ist dieselbe
              Frage aus zwei Blickwinkeln — was wurde gemessen, und was liest
              der Kunde darüber.
            */
            id: 'verbrauch',
            label: t('stammdaten.endkunde.detail.tabVerbrauch'),
            content: (
              <div className="space-y-6">
                <EndkundeVerbrauchTab endkundeId={endkundeId} />
                <NutzerinfoVerlaufAbschnitt endkundeId={endkundeId} headingId="endkunde-detail-nutzerinfo-heading" />
                {/*
                  Der Portal-Zugang steht HIER und nicht unter „Datenschutz":
                  Er ist der Weg, auf dem der Kunde genau die Information
                  darueber liest — und ohne ihn bleibt die monatliche
                  Information ein Brief, den jemand von Hand verschicken muss.
                */}
                <PortalZugangAbschnitt endkundeId={endkundeId} headingId="endkunde-detail-portal-heading" />
              </div>
            ),
          },
          {
            id: 'geraete',
            label: t('stammdaten.endkunde.detail.tabGeraete'),
            content: (
              <GeraeteerkennungAbschnitt
                endkundeId={endkundeId}
                headingId="endkunde-detail-geraeteerkennung-heading"
              />
            ),
          },
          {
            /*
              Einwilligungen VOR dem Datenschutz-Reiter — die Begründung von
              früher gilt weiter: Wer eine Einschränkung oder Löschung
              erwägt, will vorher sehen, worauf die Verarbeitung überhaupt
              gestützt ist. Was die alte Reihenfolge zusätzlich erzwingen
              wollte (erst die Rechtslage, dann die Zahlen), erzwingt sie in
              Reitern ohnehin nicht mehr: Man wählt, statt vorbeizuscrollen.
            */
            id: 'einwilligungen',
            label: t('stammdaten.endkunde.detail.tabEinwilligungen'),
            content: (
              <ConsentStandAbschnitt
                subjektTyp="endkunde"
                subjektId={endkundeId}
                headingId="endkunde-detail-consent-heading"
              />
            ),
          },
          {
            /*
              Sperren und Krypto-Shredding sind seltene, schwer umkehrbare
              Eingriffe. Sie standen bisher am Ende einer sehr langen Seite —
              also genau dort, wo man beim Scrollen landet. In einem eigenen
              Reiter wählt man sie bewusst.
            */
            id: 'datenschutz',
            label: t('stammdaten.endkunde.detail.tabDatenschutz'),
            content: (
              <div className="space-y-6">
                {!view.istGesperrt && !view.istGeschreddert && <EndkundeSperrenAktion endkundeId={endkundeId} />}
                {view.istGesperrt && <EinschraenkungAufhebenAktion {...entsperrenView} />}
                {!view.istGeschreddert && !shredAntragView.isPending && shredAntragView.antrag !== undefined && (
                  <EndkundeShredAntragOffen endkundeId={endkundeId} />
                )}
                {!view.istGeschreddert && !shredAntragView.isPending && shredAntragView.antrag === undefined && (
                  <EndkundeShreddenAktion endkundeId={endkundeId} />
                )}
              </div>
            ),
          },
        ]}
      />
      <p className="mt-6">
        <Link to="/stammdaten/endkunden" className="text-link underline-offset-4 hover:underline">
          {t('stammdaten.endkunde.detailPage.backAction')}
        </Link>
      </p>
    </DetailView>
  );
}
