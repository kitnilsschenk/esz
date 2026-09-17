import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';

export interface EinstiegKachelProps {
  readonly titel: string;
  readonly beschreibung: string;
  readonly ctaLabel: string;
  readonly ctaTo: string;
}

/**
 * Kachel ohne Kennzahl: Sie sagt, was hinter einem Bereich liegt, und führt
 * hin.
 *
 * `DashboardKachel` daneben ist auf eine Kennzahl gebaut („17 Zähler mit
 * Datenausfall") und lädt sie selbst. Für Baseline/Einsparung und den
 * BAFA-Export gibt es keine solche Zahl: Es gibt weder einen
 * portfolioweiten Zähl-Endpunkt, noch wäre eine aus der ersten Listenseite
 * abgeleitete Zahl belastbar — sie sähe aus wie eine Gesamtzahl und wäre
 * keine. Eine erfundene Kennzahl auf einem Nachweis-Dashboard ist teurer als
 * gar keine.
 *
 * Diese Kacheln lösen die beiden grauen „bald"-Platzhalter ab: Der Bereich
 * existiert jetzt, also verspricht die Kachel keine Zukunft mehr, sondern
 * führt hin.
 */
export function EinstiegKachel({ titel, beschreibung, ctaLabel, ctaTo }: EinstiegKachelProps): ReactNode {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{titel}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{beschreibung}</p>
        <p>
          <Link to={ctaTo} className="text-sm text-link underline-offset-4 hover:underline">
            {ctaLabel}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
