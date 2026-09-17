import { useId, type ReactNode } from 'react';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { Input } from '../../../shared/ui/input';
import { Label } from '../../../shared/ui/label';
import { StatusRegion } from '../../../shared/ui/status-region';
import { t } from '../../../shared/i18n/t';
import { useKannStammdatenAnlegen } from '../../stammdaten/hooks/shared/useKannStammdatenAnlegen';
import { useNutzerinfoVersandView } from '../hooks/useNutzerinfoVersandView';

/**
 * Der Postweg der Monatsinformation — Mappe holen, drucken, absenden,
 * Zustellung vermerken.
 *
 * **Warum das hier steht.** V0054 hält den Befund fest: „Erzeugen ist nicht
 * informieren." Die Seite darüber stößt die Erzeugung an; danach stand man
 * bisher vor einer Zahl und hatte keinen Weg, die Information tatsächlich
 * zum Kunden zu bringen. Genau dieser Schritt fehlte — und ohne ihn ist die
 * Auflage aus [Q3] Kap. 6 nicht erfüllt, egal wie viele Zeilen erzeugt sind.
 *
 * **Zwei Schaltflächen, zwei Wahrheiten.** „Mappe holen" gibt das Dokument
 * heraus; erst „Zustellung vermerken" behauptet, dass es hinausgegangen ist.
 * Beides in einen Klick zu legen hieße, den Versandnachweis auf den
 * Druckvorgang zu stützen — und der beweist nichts.
 *
 * Der Vermerk fragt zurück, weil er den ganzen Monat betrifft und nicht
 * zurückgenommen werden kann: der erste Zeitpunkt bleibt stehen.
 */
export function NutzerinfoVersandPanel(): ReactNode {
  const view = useNutzerinfoVersandView();
  const kannVersenden = useKannStammdatenAnlegen();
  const monatId = useId();
  const fehlerId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('nutzerinfo.versand.titel')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="max-w-prose text-sm text-muted-foreground">{t('nutzerinfo.versand.beschreibung')}</p>

        <div className="space-y-1">
          <Label htmlFor={monatId}>{t('nutzerinfo.versand.monatLabel')}</Label>
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
          {view.monatFehler !== undefined && (
            <p id={fehlerId} role="alert" className="text-sm text-destructive-text">
              {view.monatFehler}
            </p>
          )}
        </div>

        <StatusRegion ton="fehler" nachricht={view.fehlerMeldung} />
        <StatusRegion ton="erfolg" nachricht={view.erfolgsMeldung} />

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={view.mappeLaeuft} onClick={view.mappeHolen}>
            {view.mappeLaeuft ? t('nutzerinfo.versand.mappeLaeuft') : t('nutzerinfo.versand.mappeAction')}
          </Button>
          {kannVersenden && (
            <Button type="button" variant="outline" disabled={view.zustellenLaeuft} onClick={view.oeffneDialog}>
              {t('nutzerinfo.versand.zustellenAction')}
            </Button>
          )}
        </div>

        <p className="max-w-prose text-xs text-muted-foreground">{t('nutzerinfo.versand.druckHinweis')}</p>

        <ConfirmDialog
          offen={view.dialogOffen}
          titel={t('nutzerinfo.versand.dialogTitel')}
          beschreibung={t('nutzerinfo.versand.dialogText')}
          bestaetigenLabel={t('nutzerinfo.versand.dialogBestaetigen')}
          abbrechenLabel={t('nutzerinfo.versand.dialogAbbrechen')}
          onSchliessen={view.schliesseDialog}
          onBestaetigen={view.zustellen}
        />
      </CardContent>
    </Card>
  );
}
