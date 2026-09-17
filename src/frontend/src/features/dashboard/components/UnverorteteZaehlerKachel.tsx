import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Badge } from '../../../shared/ui/badge';
import { t } from '../../../shared/i18n/t';

/**
 * Kachel 3 „Unverortete Zähler" (Betriebs-UI-Konzept Punkt 1, ADR-0010 D3
 * nennt diesen Check explizit) — **Abweichung vom Konzept, dokumentiert**:
 * es existiert (noch) KEIN Backend-Endpunkt, der „unverortete Zähler"
 * ENDKUNDEN-ÜBERGREIFEND zählt/listet. Die verfügbaren Bausteine sind alle
 * auf EINEN Endkunden ODER EINEN Standort-Knoten skaliert
 * (`GET .../standorte/{id}/zaehler`, `GET .../endkunden/{id}/standorte`) —
 * ein Cross-Endkunden-Aggregat wäre ein neuer, eigenständiger
 * Backend-Endpunkt (analog `/monitoring/ausfaelle`), NICHT Teil der drei für
 * diesen Auftrag bereits bereitgestellten Endpunkte.
 *
 * Bleibt daher — wie die Baseline-/BAFA-Platzhalter — eine „bald"-Kachel,
 * ABER mit einem bereits funktionierenden CTA (der Standort-Übersicht, wo
 * das Zuordnen HEUTE schon möglich ist, nur ohne die zusammenfassende
 * Kennzahl). Rückt ohne Layout-Umbau zu einer echten Kachel nach, sobald
 * `backend-lead`/`api-developer` den Aggregations-Endpunkt liefern.
 *
 * Der sichtbare Hinweistext nennt bewusst NICHT den fehlenden Endpunkt: Das
 * ist eine Notiz an das Team, keine Information für das Betriebs-Personal —
 * dort las sie sich wie eine Störungsmeldung. Er sagt jetzt, was NICHT geht
 * (die Gesamtzahl) und was stattdessen geht (der Weg über die Struktur).
 */
export function UnverorteteZaehlerKachel(): ReactNode {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle as="h2">{t('dashboard.kachel.unverortet.titel')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2">
          <Badge variant="outline">{t('dashboard.platzhalterBadge')}</Badge>
          <p className="text-sm text-muted-foreground">{t('dashboard.kachel.unverortet.backendHinweis')}</p>
        </div>
        <p>
          <Link to="/stammdaten/standorte" className="text-sm text-link underline-offset-4 hover:underline">
            {t('dashboard.kachel.unverortet.ctaLabel')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
