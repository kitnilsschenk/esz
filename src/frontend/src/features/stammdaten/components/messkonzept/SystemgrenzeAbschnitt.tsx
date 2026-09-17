import { useId, useState, type ReactNode } from 'react';
import type { Systemgrenze } from '@edms/shared';
import { Button } from '../../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { t } from '../../../../shared/i18n/t';
import { useSystemgrenze, useSystemgrenzeSetzen } from '../../api/messkonzept';

export interface SystemgrenzeAbschnittProps {
  readonly mvetId: string;
  readonly energietraegerLabel: string;
  readonly headingId: string;
}

/**
 * Die Systemgrenze eines Messkonzept-Energieträgers — welche Systeme ein
 * Berechnungslauf umfasst.
 *
 * **Warum es diese Ansicht gibt.** Die Zuordnung steht seit V0028 im Schema
 * und war bis heute nur per SQL zu setzen: in Testfixtures, im
 * Demo-Generator, in Aufbau-Skripten. Fehlte sie, rechnete der Lauf
 * trotzdem — nur eben über ALLE Zähler des Endkunden. Bei einem Kunden mit
 * mehreren Messkonzepten floss dabei fremder Verbrauch ein, ohne dass
 * irgendwo ein Fehler erschien.
 *
 * **Deshalb ist die Fallback-Warnung keine Randnotiz.** Sie steht als
 * Fehlermeldung und nicht als Hinweis: Eine leere Systemgrenze ist kein
 * neutraler Anfangszustand, sondern eine stille Ausweitung auf alles.
 */
export function SystemgrenzeAbschnitt({
  mvetId,
  energietraegerLabel,
  headingId,
}: SystemgrenzeAbschnittProps): ReactNode {
  const grenze = useSystemgrenze(mvetId);
  const speichern = useSystemgrenzeSetzen(mvetId);
  const [auswahl, setzeAuswahl] = useState<readonly string[] | undefined>(undefined);
  const legendeId = useId();

  const bearbeitet = auswahl !== undefined;

  function starteBearbeitung(daten: Systemgrenze): void {
    setzeAuswahl(daten.systeme.map((s) => s.systemId));
  }

  function schalte(systemId: string): void {
    setzeAuswahl((vorher) => {
      const menge = new Set(vorher ?? []);
      if (menge.has(systemId)) {
        menge.delete(systemId);
      } else {
        menge.add(systemId);
      }
      return [...menge];
    });
  }

  return (
    <section aria-labelledby={headingId}>
      <Card>
        <CardHeader>
          <CardTitle id={headingId} as="h2">
            {t('stammdaten.messkonzept.systemgrenze.titel')} · {energietraegerLabel}
          </CardTitle>
          <p className="max-w-prose text-sm text-muted-foreground">
            {t('stammdaten.messkonzept.systemgrenze.beschreibung')}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {grenze.isPending && (
            <p className="text-sm text-muted-foreground">{t('stammdaten.messkonzept.systemgrenze.laedt')}</p>
          )}
          {grenze.isError && (
            <StatusRegion ton="fehler" nachricht={t('stammdaten.messkonzept.systemgrenze.ladeFehler')} />
          )}

          {grenze.data !== undefined && (
            <>
              {grenze.data.greiftFallback && !bearbeitet && (
                <StatusRegion ton="fehler" nachricht={t('stammdaten.messkonzept.systemgrenze.fallbackWarnung')} />
              )}

              {grenze.data.waehlbar.length === 0 ? (
                <p className="text-sm">{t('stammdaten.messkonzept.systemgrenze.keineSysteme')}</p>
              ) : bearbeitet ? (
                <fieldset className="space-y-2">
                  <legend id={legendeId} className="text-sm font-medium">
                    {t('stammdaten.messkonzept.systemgrenze.auswahlLegende')}
                  </legend>
                  {grenze.data.waehlbar.map((system) => (
                    <label key={system.systemId} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        checked={auswahl.includes(system.systemId)}
                        onChange={() => {
                          schalte(system.systemId);
                        }}
                      />
                      {system.bezeichnung}
                    </label>
                  ))}
                </fieldset>
              ) : (
                <ul className="space-y-1 text-sm">
                  {grenze.data.systeme.map((system) => (
                    <li key={system.systemId}>{system.bezeichnung}</li>
                  ))}
                </ul>
              )}

              <StatusRegion
                ton="fehler"
                nachricht={speichern.isError ? t('stammdaten.messkonzept.systemgrenze.fehler') : undefined}
              />
              <StatusRegion
                ton="erfolg"
                nachricht={
                  speichern.isSuccess && !bearbeitet
                    ? t('stammdaten.messkonzept.systemgrenze.gespeichert')
                    : undefined
                }
              />

              {grenze.data.waehlbar.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {bearbeitet ? (
                    <>
                      <Button
                        type="button"
                        disabled={speichern.isPending}
                        onClick={() => {
                          speichern.mutate(auswahl, { onSuccess: () => { setzeAuswahl(undefined); } });
                        }}
                      >
                        {speichern.isPending
                          ? t('stammdaten.messkonzept.systemgrenze.speichernLaeuft')
                          : t('stammdaten.messkonzept.systemgrenze.speichern')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setzeAuswahl(undefined);
                        }}
                      >
                        {t('stammdaten.messkonzept.systemgrenze.abbrechen')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        starteBearbeitung(grenze.data);
                      }}
                    >
                      {t('stammdaten.messkonzept.systemgrenze.bearbeiten')}
                    </Button>
                  )}
                </div>
              )}

              <p className="max-w-prose text-xs text-muted-foreground">
                {t('stammdaten.messkonzept.systemgrenze.hinweisNachtraeglich')}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
