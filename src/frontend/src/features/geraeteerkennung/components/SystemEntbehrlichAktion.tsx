import { useId, type ReactNode } from 'react';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Label } from '../../../shared/ui/label';
import { StatusRegion } from '../../../shared/ui/status-region';
import { Textarea } from '../../../shared/ui/textarea';
import { t } from '../../../shared/i18n/t';
import { useSystemEntbehrlichView } from '../hooks/useSystemEntbehrlichView';

export interface SystemEntbehrlichAktionProps {
  readonly systemId: string;
}

/**
 * „Geräteerkennung ist für dieses System nicht sinnvoll" (TB-05, [Q3] Kap. 5).
 *
 * **Die folgenreichste Schaltfläche dieses Moduls** — ein Häkchen, das eine
 * Förderauflage für ein System als erfüllt erklärt, ohne dass eine Zahl das
 * belegt. Die Ansicht sagt das deshalb ausdrücklich und macht die Begründung
 * zur Bedingung des Absendens, statt sie erst vom Server abweisen zu lassen.
 *
 * Der Vermerk verändert die berechnete Quote NICHT — er steht ihr daneben.
 * Eine Quote, die sich durch ein Häkchen hebt, wäre die Zahl, der niemand
 * mehr trauen kann.
 */
export function SystemEntbehrlichAktion({ systemId }: SystemEntbehrlichAktionProps): ReactNode {
  const view = useSystemEntbehrlichView(systemId);
  const checkboxId = useId();
  const grundId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('geraeteerkennung.entbehrlich.titel')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('geraeteerkennung.entbehrlich.beschreibung')}</p>

        {view.isPending && <p className="text-sm text-muted-foreground">{t('stammdaten.common.laedt')}</p>}
        {view.isError && <StatusRegion ton="fehler" nachricht={view.ladeFehlerMeldung} />}

        {!view.isPending && !view.isError && (
          <>
            <div className="flex items-start gap-2">
              <input
                id={checkboxId}
                type="checkbox"
                checked={view.entbehrlich}
                onChange={(event) => {
                  view.setzeEntbehrlich(event.target.checked);
                }}
                className="mt-1 h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <Label htmlFor={checkboxId}>{t('geraeteerkennung.entbehrlich.checkboxLabel')}</Label>
            </div>

            {view.entbehrlich && (
              <>
                <StatusRegion ton="hinweis" nachricht={t('geraeteerkennung.entbehrlich.warnung')} />
                <div className="space-y-1">
                  <Label htmlFor={grundId}>{t('geraeteerkennung.entbehrlich.grundLabel')}</Label>
                  <Textarea
                    id={grundId}
                    rows={3}
                    value={view.grund}
                    onChange={(event) => {
                      view.setzeGrund(event.target.value);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">{t('geraeteerkennung.entbehrlich.grundHinweis')}</p>
                </div>
              </>
            )}

            <Button
              type="button"
              variant="outline"
              disabled={view.isSubmitting || !view.absendbar}
              onClick={view.speichere}
            >
              {t('geraeteerkennung.entbehrlich.action')}
            </Button>
          </>
        )}

        <StatusRegion ton="fehler" nachricht={view.submitErrorMessage} />
        <StatusRegion ton="erfolg" nachricht={view.erfolgsMeldung} />
      </CardContent>
    </Card>
  );
}
