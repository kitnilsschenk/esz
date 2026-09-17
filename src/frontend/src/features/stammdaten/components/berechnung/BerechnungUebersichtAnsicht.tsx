import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { EndkundeListItem } from '@edms/shared';
import { useBerechnungUebersichtView } from '../../hooks/berechnung';
import { EndkundenTabelle } from '../endkunde';
import { BerechnungslaufTabelle } from './BerechnungslaufTabelle';
import { kurzId } from '../shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { Button } from '../../../../shared/ui/button';
import { t } from '../../../../shared/i18n/t';

/**
 * Globale Baseline-/Einsparungs-Übersicht (`/berechnung/laeufe`).
 *
 * Sie behebt dasselbe Auffindbarkeits-Problem, das die Standort-Übersicht
 * gelöst hat, und tut es auf demselben Weg: Der Endkunde wird HIER gewählt
 * (`EndkundenTabelle`, wiederverwendet — keine eigene Such- oder
 * Paginierungslogik), darunter steht die bestehende
 * `BerechnungslaufTabelle` unverändert.
 *
 * Die vorhandene Unterressourcen-Route
 * `/stammdaten/endkunden/:endkundeId/berechnungen` bleibt bestehen: Sie ist
 * weiterhin das Ziel des Links aus der Endkunde-Detailseite, und
 * Lesezeichen darauf brechen nicht.
 *
 * Der Hinweis am Fuß führt weiter zum Nachweis: Monatliche Berechnungen sind
 * das Rohmaterial, aus dem der Förderjahres-Nachweis entsteht — wer hier
 * steht, sucht als Nächstes oft genau das.
 */
export function BerechnungUebersichtAnsicht(): ReactNode {
  const view = useBerechnungUebersichtView();

  if (view.isPending) {
    return (
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {t('stammdaten.common.laedt')}
      </p>
    );
  }

  if (view.isError) {
    return (
      <p role="alert" className="text-sm font-medium text-destructive-text">
        {t('stammdaten.common.fehler')}
      </p>
    );
  }

  if (view.endkunden.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('stammdaten.berechnung.uebersicht.keineEndkunden')}</p>;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t('stammdaten.berechnung.uebersicht.einfuehrung')}</p>

      {view.ausgewaehlteEndkundeId === undefined && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t('stammdaten.berechnung.uebersicht.auswahlSectionTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('stammdaten.berechnung.uebersicht.auswahlHinweis')}</p>
            <EndkundenTabelle
              renderRowAction={(item: EndkundeListItem) => (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`${t('stammdaten.berechnung.uebersicht.auswaehlenAction')} ${kurzId(item.id)}`}
                  onClick={() => view.waehleEndkunde(item.id)}
                >
                  {t('stammdaten.berechnung.uebersicht.auswaehlenAction')}
                </Button>
              )}
            />
          </CardContent>
        </Card>
      )}

      {view.ausgewaehlteEndkundeId !== undefined && (
        <>
          {!view.nurEinEndkunde && (
            <Button type="button" size="sm" variant="outline" onClick={view.wechsleEndkunde}>
              {t('stammdaten.berechnung.uebersicht.andererEndkundeAction')}
            </Button>
          )}
          <BerechnungslaufTabelle endkundeId={view.ausgewaehlteEndkundeId} />
        </>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          <p className="text-sm text-muted-foreground">{t('stammdaten.berechnung.uebersicht.nachweisHinweis')}</p>
          <Link to="/nachweis/foerderjahre" className="text-link underline-offset-4 hover:underline">
            {t('stammdaten.berechnung.uebersicht.zumNachweisAction')}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
