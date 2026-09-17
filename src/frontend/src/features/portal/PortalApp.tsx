import { useRef, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RouteAnnouncer } from '../../app/RouteAnnouncer';
import { Button } from '../../shared/ui/button';
import { t } from '../../shared/i18n/t';
import { KitConsultingMarke, KitConsultingSignet } from '../../shared/branding/Marke';
import { usePortalAbmeldung, usePortalSitzung } from './api';
import { PortalAnmeldeSeite } from './components/PortalAnmeldeSeite';
import { PortalMonatSeite } from './components/PortalMonatSeite';
import { PortalUebersicht } from './components/PortalUebersicht';

/**
 * Der Kundenbereich — ein eigener Anwendungsteil unter `/portal`.
 *
 * **Er teilt sich mit der Betriebs-UI nichts außer den Bausteinen.** Keine
 * Sidebar, keine Brotkrumen, kein Rollen-Menü, kein Keycloak-Bootstrap: Der
 * Endkunde hat kein Konto im Betriebssinn und soll die Betriebsanwendung nie
 * zu sehen bekommen — auch nicht in Form leerer Navigationspunkte, die ihm
 * nichts sagen. Deshalb entscheidet `App.tsx` VOR dem Auth-Gate anhand des
 * Pfades, welcher der beiden Teile läuft.
 *
 * **Die Sitzungsprobe ist die einzige Weiche.** Trägt sie, sieht der Kunde
 * seine Monate; trägt sie nicht, die Anmeldemaske. Ein eigener
 * „nicht angemeldet"-Zustand mit Weiterleitung wäre eine zusätzliche Stelle,
 * an der man sich vertun kann.
 */
export function PortalApp(): ReactNode {
  const sitzung = usePortalSitzung();
  const hauptinhaltRef = useRef<HTMLElement>(null);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#portal-hauptinhalt"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        {t('portal.skipLink')}
      </a>

      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4">
          {/*
            Signet + Portalname: Der Endkunde sieht diese Ansicht, und bis
            hierher stand nirgends, von wem sie stammt. Der Betreiber gehoert
            genannt — kundengerichtete Darstellungen sind auch der Ort, an
            dem die Attributionspflicht der Klimadaten haengt (DQ-001).

            Das Signet traegt KEINEN Alternativtext: Der Portalname steht
            daneben, und der Betreibername unten in der Fusszeile.
          */}
          <span className="flex items-center gap-2">
            <KitConsultingSignet hoehe={22} />
            <span className="text-base font-bold">{t('portal.titel')}</span>
          </span>
          {sitzung.data !== undefined && <PortalAbmeldeKnopf kennung={sitzung.data.kennung} />}
        </div>
      </header>

      <main id="portal-hauptinhalt" tabIndex={-1} ref={hauptinhaltRef} className="mx-auto max-w-3xl px-4 py-6">
        {/*
          Wie in der Betriebs-UI: Fokus zurueck auf den Hauptinhalt und eine
          Ansage, welche Seite geladen wurde. Bewusst AUSSERHALB der
          `<Routes>`-Kinder, damit der „erster Mount"-Schutz haelt.
        */}
        <RouteAnnouncer hauptinhaltRef={hauptinhaltRef} />
        {sitzung.isPending ? (
          <p className="text-sm text-muted-foreground">{t('portal.laedt')}</p>
        ) : sitzung.data === undefined ? (
          <PortalAnmeldeSeite />
        ) : (
          <Routes>
            <Route path="/portal" element={<PortalUebersicht />} />
            <Route path="/portal/monate/:informationId" element={<PortalMonatSeite />} />
            <Route path="*" element={<PortalNichtGefunden />} />
          </Routes>
        )}
      </main>

      {/*
        Betreiber-Fusszeile. Im Betriebs-UI steht der Urheber in der
        Seitenleiste; das Portal hat keine, also hier. Ohne sie wuesste ein
        Endkunde nicht, wessen Anwendung er gerade benutzt.
      */}
      <footer className="mx-auto max-w-3xl px-4 pb-6">
        <div className="border-t border-border pt-4">
          <KitConsultingMarke />
          <p className="mt-1 text-xs text-muted-foreground">{t('app.marke.urheberHinweis')}</p>
        </div>
      </footer>
    </div>
  );
}

function PortalAbmeldeKnopf({ kennung }: { readonly kennung: string }): ReactNode {
  const abmeldung = usePortalAbmeldung();

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">
        {t('portal.angemeldetAls')} {kennung}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={abmeldung.isPending}
        onClick={() => {
          abmeldung.mutate();
        }}
      >
        {t('portal.abmelden')}
      </Button>
    </div>
  );
}

function PortalNichtGefunden(): ReactNode {
  return (
    <div className="space-y-2">
      <h1 className="text-lg font-semibold">{t('portal.nichtGefunden.titel')}</h1>
      <p className="max-w-prose text-sm">{t('portal.nichtGefunden.text')}</p>
    </div>
  );
}
