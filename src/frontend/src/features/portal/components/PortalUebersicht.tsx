import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { StatusRegion } from '../../../shared/ui/status-region';
import { t } from '../../../shared/i18n/t';
import { usePortalTitel } from '../hooks/usePortalTitel';
import { usePortalVerlaufView } from '../hooks/usePortalVerlaufView';
import { PortalWiderspruchPanel } from './PortalWiderspruchPanel';

/**
 * Die Startseite des Kunden: seine Monate und die eine Entscheidung, die er
 * treffen kann.
 *
 * Beides steht auf EINER Seite, weil beides zusammengehört: Das Opt-out
 * betrifft genau die Liste darüber. Läge es unter einem Menüpunkt
 * „Einstellungen", fände es niemand — und ein Widerspruchsrecht, das man
 * suchen muss, ist praktisch keines.
 */
export function PortalUebersicht(): ReactNode {
  const view = usePortalVerlaufView();
  usePortalTitel(t('portal.uebersicht.titel'));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle as="h1">{t('portal.uebersicht.titel')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('portal.uebersicht.beschreibung')}</p>
        </CardHeader>
        <CardContent>
          {view.isPending && <p className="text-sm text-muted-foreground">{t('portal.laedt')}</p>}
          {view.isError && <StatusRegion ton="fehler" nachricht={view.ladeFehlerMeldung} />}
          {view.istLeer && <p className="max-w-prose text-sm">{t('portal.uebersicht.leer')}</p>}

          {view.zeilen.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('portal.uebersicht.titel')}</caption>
                <thead>
                  <tr className="border-b text-left">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {t('portal.uebersicht.spalteMonat')}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {t('portal.uebersicht.spalteEnergietraeger')}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {t('portal.uebersicht.spalteErgebnis')}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {t('portal.uebersicht.spalteVerbrauch')}
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      {t('portal.uebersicht.spalteAktion')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view.zeilen.map((zeile) => (
                    <tr key={zeile.id} className="border-b last:border-0">
                      <th scope="row" className="py-2 pr-4 text-left font-medium">
                        {zeile.monatLabel}
                      </th>
                      <td className="py-2 pr-4">{zeile.energietraegerLabel}</td>
                      <td className={zeile.istMehrverbrauch ? 'py-2 pr-4 text-destructive-text' : 'py-2 pr-4'}>
                        {zeile.ergebnisLabel}
                      </td>
                      <td className="py-2 pr-4">{zeile.verbrauchLabel}</td>
                      <td className="py-2">
                        {/*
                          Der Linktext traegt den Monat mit: „Ansehen" allein
                          ist in einer Liste von zwanzig gleichlautenden Links
                          keine Auskunft darueber, wohin er fuehrt (WCAG 2.4.4).
                          Sichtbar bleibt das kurze Wort.
                        */}
                        <Link
                          to={`/portal/monate/${zeile.id}`}
                          className="rounded-sm text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {t('portal.uebersicht.ansehen')}
                          <span className="sr-only">
                            {' '}
                            — {zeile.monatLabel}, {zeile.energietraegerLabel}
                          </span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PortalWiderspruchPanel />
    </div>
  );
}
