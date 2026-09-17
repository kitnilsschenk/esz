import { useState, type ReactNode } from 'react';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { StatusRegion } from '../../../shared/ui/status-region';
import { formatiereZeitpunkt } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';
import { usePortalWiderspruch, usePortalWiderspruchRuecknahme, usePortalWidersprechen } from '../api';

/**
 * Das digitale Opt-out (TB-06 [Q3] Kap. 6, Beleg nach DS-03).
 *
 * **Hier erklärt die betroffene Person selbst.** Bis zu diesem Bildschirm gab
 * es den Widerspruch nur als Nachtrag durch den Betrieb: Jemand rief an,
 * jemand trug es ein. Das ist zulässig, aber es ist kein digitales Opt-in im
 * Sinne des Datenschutz-Merkblatts — und es setzt voraus, dass der Kunde
 * überhaupt weiß, dass er widersprechen darf. Deshalb steht der Schalter
 * sichtbar auf seiner Startseite und nicht in einem Untermenü.
 *
 * **Der Weg zurück ist genauso kurz wie der hin.** Ein Opt-out, dessen
 * Rücknahme einen Anruf kostet, ist eine Einbahnstraße; die Rücknahme steht
 * deshalb an derselben Stelle, mit demselben Gewicht.
 *
 * Die Bestätigung gibt es NUR für den Widerspruch, nicht für die Rücknahme:
 * Der Widerspruch stellt eine laufende Information ab, die Rücknahme stellt
 * sie wieder an. Nur die erste Richtung kostet etwas, wenn sie versehentlich
 * geschieht.
 */
export function PortalWiderspruchPanel(): ReactNode {
  const [dialogOffen, setzeDialogOffen] = useState(false);
  const stand = usePortalWiderspruch();
  const widersprechen = usePortalWidersprechen();
  const ruecknahme = usePortalWiderspruchRuecknahme();

  const laeuft = widersprechen.isPending || ruecknahme.isPending;
  const fehler = widersprechen.isError || ruecknahme.isError ? t('portal.widerspruch.fehler') : undefined;
  const erfolg = widersprechen.isSuccess
    ? t('portal.widerspruch.erfolgWiderspruch')
    : ruecknahme.isSuccess
      ? t('portal.widerspruch.erfolgRuecknahme')
      : undefined;

  const wirksam = stand.data?.wirksam ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('portal.widerspruch.titel')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {stand.isPending && <p className="text-sm text-muted-foreground">{t('portal.laedt')}</p>}
        {stand.isError && <StatusRegion ton="fehler" nachricht={t('portal.widerspruch.ladeFehler')} />}

        {stand.data !== undefined && (
          <>
            <p className="max-w-prose text-sm">
              {wirksam ? t('portal.widerspruch.standWidersprochen') : t('portal.widerspruch.standAktiv')}
            </p>

            {wirksam && stand.data.erklaertAt !== null && (
              <p className="text-sm text-muted-foreground">
                {t('portal.widerspruch.seitLabel')} {formatiereZeitpunkt(stand.data.erklaertAt)}
              </p>
            )}

            <StatusRegion ton="fehler" nachricht={fehler} />
            <StatusRegion ton="erfolg" nachricht={erfolg} />

            {wirksam ? (
              <Button
                type="button"
                disabled={laeuft}
                onClick={() => {
                  ruecknahme.mutate();
                }}
              >
                {laeuft ? t('portal.widerspruch.laeuft') : t('portal.widerspruch.zuruecknehmen')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={laeuft}
                onClick={() => {
                  setzeDialogOffen(true);
                }}
              >
                {laeuft ? t('portal.widerspruch.laeuft') : t('portal.widerspruch.widersprechen')}
              </Button>
            )}

            <p className="max-w-prose text-xs text-muted-foreground">{t('portal.widerspruch.hinweis')}</p>
          </>
        )}

        <ConfirmDialog
          offen={dialogOffen}
          titel={t('portal.widerspruch.bestaetigenTitel')}
          beschreibung={t('portal.widerspruch.bestaetigenText')}
          bestaetigenLabel={t('portal.widerspruch.bestaetigenJa')}
          abbrechenLabel={t('portal.widerspruch.bestaetigenAbbrechen')}
          onSchliessen={() => {
            setzeDialogOffen(false);
          }}
          onBestaetigen={() => {
            setzeDialogOffen(false);
            widersprechen.mutate();
          }}
        />
      </CardContent>
    </Card>
  );
}
