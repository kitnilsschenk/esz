import { useId } from 'react';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Input } from '../../../shared/ui/input';
import { Label } from '../../../shared/ui/label';
import { StatusRegion } from '../../../shared/ui/status-region';
import { t } from '../../../shared/i18n/t';
import { useNutzerinfoLaufView } from '../hooks/useNutzerinfoLaufView';

/**
 * Erzeugungslauf der monatlichen Nutzerinformation (TB-06, [Q3] Kap. 6).
 *
 * **Zwei Schaltflächen statt einer mit Häkchen.** „Zählen" und „Erzeugen"
 * sind verschiedene Absichten, und die gefährlichere soll nicht die sein, die
 * man aus Versehen trifft. Dieselbe Linie wie beim Retention-Runner
 * (`--ausfuehren`) und beim Migrations-Runner (`--yes`).
 *
 * **Die Zahlen sind nach Bedeutung sortiert, nicht nach Größe.** Erzeugt,
 * dann die beiden zulässigen Gründe für ein Auslassen (Widerspruch,
 * Sperrung), zuletzt der eine, der keiner ist: Kunden ohne bindbaren
 * Berechnungslauf. Sie müssten informiert werden und können es nicht — die
 * Zeile ist hervorgehoben und trägt eine Erklärung, weil eine nackte Zahl
 * hier niemandem sagt, ob sie in Ordnung ist.
 */
export function NutzerinfoLaufPanel(): React.ReactElement {
  const view = useNutzerinfoLaufView();
  const monatId = useId();
  const fehlerId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('nutzerinfo.lauf.titel')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('nutzerinfo.lauf.beschreibung')}</p>

        <div className="space-y-1">
          <Label htmlFor={monatId}>{t('nutzerinfo.lauf.monatLabel')}</Label>
          <Input
            id={monatId}
            type="month"
            value={view.monat}
            aria-invalid={view.monatFehler !== undefined}
            aria-describedby={view.monatFehler === undefined ? undefined : fehlerId}
            onChange={(event) => {
              view.setzeMonat(event.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">{t('nutzerinfo.lauf.monatHinweis')}</p>
          {view.monatFehler !== undefined && (
            <p id={fehlerId} role="alert" className="text-sm text-destructive-text">
              {view.monatFehler}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={view.isSubmitting || view.monatFehler !== undefined}
            onClick={view.starteProbelauf}
          >
            {t('nutzerinfo.lauf.probelaufAction')}
          </Button>
          <Button
            type="button"
            disabled={view.isSubmitting || view.monatFehler !== undefined}
            onClick={view.starteAusfuehrung}
          >
            {t('nutzerinfo.lauf.ausfuehrenAction')}
          </Button>
        </div>

        <StatusRegion ton="fehler" nachricht={view.submitErrorMessage} />

        {view.ergebnis !== undefined && (
          <section aria-live="polite" className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium">
              {view.ergebnis.modusLabel} · {view.ergebnis.monatLabel}
            </h3>
            <p className={view.ergebnis.zahlen.some((zahl) => zahl.istBefund) ? 'text-destructive-text' : 'text-sm'}>
              {view.ergebnis.fazit}
            </p>
            {view.ergebnis.warProbelauf && (
              <p className="text-sm text-muted-foreground">{t('nutzerinfo.lauf.probelaufHinweis')}</p>
            )}
            <dl className="space-y-2">
              {view.ergebnis.zahlen.map((zahl) => (
                <div key={zahl.schluessel} className="flex flex-wrap items-baseline gap-x-3">
                  <dt className={zahl.istBefund ? 'font-medium text-destructive-text' : 'font-medium'}>
                    {zahl.label}
                  </dt>
                  <dd className={zahl.istBefund ? 'font-semibold text-destructive-text' : 'font-semibold'}>
                    {zahl.wert}
                  </dd>
                  <dd className="w-full text-xs text-muted-foreground">{zahl.erlaeuterung}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
