import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../../../shared/ui/button';
import { StatusRegion } from '../../../shared/ui/status-region';
import { t } from '../../../shared/i18n/t';
import { fetchEigenesDokument } from '../api';

export interface PortalDruckAktionProps {
  readonly informationId: string;
}

/**
 * „Diese Seite drucken" — der Weg vom Bildschirm zum Blatt.
 *
 * **Warum ein Rahmen und kein Link.** Das Dokument ist ein eigenständiges
 * HTML mit eigenem Druck-Layout (A4, Seitenränder). Ein `<a href>` würde die
 * Seite verlassen und den Kunden in einem Dokument ohne Rückweg
 * zurücklassen; ein neues Fenster nach einem asynchronen Abruf blocken
 * verbreitete Browser als Popup. Der unsichtbare Rahmen druckt das Blatt aus
 * der Seite heraus, auf der der Kunde steht.
 *
 * Der Abruf läuft über den API-Client, nicht über eine Browser-Navigation:
 * So liegt die Fehlerbehandlung an derselben Stelle wie überall sonst, und
 * der Kunde sieht eine deutsche Meldung statt einer JSON-Fehlerseite.
 */
export function PortalDruckAktion({ informationId }: PortalDruckAktionProps): ReactNode {
  const [laeuft, setzeLaeuft] = useState(false);
  const [fehlerMeldung, setzeFehlerMeldung] = useState<string | undefined>(undefined);
  const rahmenRef = useRef<HTMLIFrameElement>(null);
  const istGemountetRef = useRef(true);

  useEffect(() => {
    istGemountetRef.current = true;
    return () => {
      istGemountetRef.current = false;
    };
  }, []);

  const drucken = useCallback((): void => {
    setzeLaeuft(true);
    setzeFehlerMeldung(undefined);

    void fetchEigenesDokument(informationId)
      .then((html) => {
        const rahmen = rahmenRef.current;
        if (rahmen === null) {
          return;
        }
        rahmen.srcdoc = html;
      })
      .catch(() => {
        if (istGemountetRef.current) {
          setzeFehlerMeldung(t('portal.monat.druckenFehler'));
        }
      })
      .finally(() => {
        if (istGemountetRef.current) {
          setzeLaeuft(false);
        }
      });
  }, [informationId]);

  /**
   * Der Druckdialog erst NACH dem Laden — vorher wäre der Rahmen leer.
   *
   * `print()` fehlt in Testumgebungen (jsdom); das ist kein Fehlerfall,
   * sondern die Abwesenheit eines Druckers. Deshalb geprüft statt gefangen.
   */
  const geladen = useCallback((): void => {
    const fenster = rahmenRef.current?.contentWindow;
    if (fenster !== null && fenster !== undefined && typeof fenster.print === 'function') {
      fenster.print();
    }
  }, []);

  return (
    <div className="space-y-2">
      <StatusRegion ton="fehler" nachricht={fehlerMeldung} />
      <Button type="button" variant="outline" disabled={laeuft} onClick={drucken}>
        {laeuft ? t('portal.monat.druckenLaeuft') : t('portal.monat.drucken')}
      </Button>
      <p className="max-w-prose text-xs text-muted-foreground">{t('portal.monat.druckenHinweis')}</p>
      {/*
        Der Rahmen ist Werkzeug, kein Inhalt: Er traegt einen Titel (sonst
        waere er ein unbenannter Frame fuer Screenreader) und liegt zugleich
        ausserhalb des Blickfelds. `display:none` waere falsch — ein nicht
        gerenderter Rahmen druckt in mehreren Browsern nicht.
      */}
      <iframe
        ref={rahmenRef}
        title={t('portal.monat.rahmenTitel')}
        onLoad={geladen}
        tabIndex={-1}
        className="pointer-events-none absolute h-0 w-0 border-0 opacity-0"
      />
    </div>
  );
}
