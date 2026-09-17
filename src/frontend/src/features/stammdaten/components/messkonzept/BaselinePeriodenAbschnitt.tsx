import { useId, useState, type ReactNode } from 'react';
import type { BaselineEinheit, BaselinePerioden, BaselinePeriodeSetzen } from '@edms/shared';
import { Button } from '../../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { formatiereKalenderdatum } from '../../../../shared/format/datum';
import { t } from '../../../../shared/i18n/t';
import { useBaselinePerioden, useBaselinePeriodenSetzen } from '../../api/messkonzept';

export interface BaselinePeriodenAbschnittProps {
  readonly mvetId: string;
  readonly energietraegerLabel: string;
  readonly headingId: string;
}

const EINHEITEN: readonly BaselineEinheit[] = ['kWh', 'MWh', 'GJ', 'm³', 'l', 'kg', 't'];

/** Eine Zeile im Bearbeitungszustand — alles als String, wie das Formular es hält. */
interface ZeileEntwurf {
  readonly schluessel: string;
  readonly von: string;
  readonly bis: string;
  readonly menge: string;
  readonly einheit: string;
}

function leereZeile(): ZeileEntwurf {
  return { schluessel: crypto.randomUUID(), von: '', bis: '', menge: '', einheit: '' };
}

function zahl(wert: number): string {
  return wert.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

/**
 * Die Baseline-Bezugszeiträume eines Messkonzept-Energieträgers.
 *
 * **Warum es diese Ansicht gibt.** Aus diesen Zeiträumen bildet der
 * Berechnungslauf GTZ_base als Mittelwert der Gradtagzahl-Summen je Periode —
 * den Nenner der Witterungsbereinigung. Sie standen seit V0019 im Schema und
 * waren nur per SQL zu setzen; wer das nicht konnte, musste GTZ_base von Hand
 * angeben. Eine geratene Gradtagzahl macht jede Einsparzahl falsch, ohne dass
 * irgendwo ein Fehler erscheint — genau das ist in diesem Projekt schon
 * einmal passiert.
 *
 * **Warum die Tabelle so viel zurückmeldet.** `bis` ist ausschließlich: Eine
 * Abrechnung über 2023 endet mit `bis = 2024-01-01`. Wer das verwechselt,
 * verliert ein Jahr und merkt es erst an der Einsparzahl. Die Ansicht zeigt
 * deshalb zu jeder Periode die Tage und den letzten enthaltenen Tag, und sie
 * stellt den Mittelwert der Mengen neben die Baseline, die er belegen soll.
 */
export function BaselinePeriodenAbschnitt({
  mvetId,
  energietraegerLabel,
  headingId,
}: BaselinePeriodenAbschnittProps): ReactNode {
  const daten = useBaselinePerioden(mvetId);
  const speichern = useBaselinePeriodenSetzen(mvetId);
  const [entwurf, setzeEntwurf] = useState<readonly ZeileEntwurf[] | undefined>(undefined);
  const tabellenId = useId();

  const bearbeitet = entwurf !== undefined;

  function starteBearbeitung(vorhanden: BaselinePerioden): void {
    setzeEntwurf(
      vorhanden.perioden.length === 0
        ? [leereZeile()]
        : vorhanden.perioden.map((periode) => ({
            schluessel: periode.id,
            von: periode.von,
            bis: periode.bis,
            menge: periode.menge === null ? '' : String(periode.menge),
            einheit: periode.einheit ?? '',
          })),
    );
  }

  function aendere(schluessel: string, feld: keyof Omit<ZeileEntwurf, 'schluessel'>, wert: string): void {
    setzeEntwurf((vorher) =>
      (vorher ?? []).map((zeile) => (zeile.schluessel === schluessel ? { ...zeile, [feld]: wert } : zeile)),
    );
  }

  function entferne(schluessel: string): void {
    setzeEntwurf((vorher) => (vorher ?? []).filter((zeile) => zeile.schluessel !== schluessel));
  }

  // Leere Zeilen fallen beim Speichern weg — wer eine Zeile hinzufuegt und
  // dann doch nicht braucht, soll sie nicht erst entfernen muessen.
  function zuNutzlast(zeilen: readonly ZeileEntwurf[]): BaselinePeriodeSetzen[] {
    return zeilen
      .filter((zeile) => zeile.von !== '' && zeile.bis !== '')
      .map((zeile) => {
        const menge = zeile.menge === '' ? undefined : Number.parseFloat(zeile.menge.replace(',', '.'));
        return {
          von: zeile.von,
          bis: zeile.bis,
          ...(menge !== undefined && Number.isFinite(menge) ? { menge } : {}),
          ...(zeile.einheit === '' ? {} : { einheit: zeile.einheit as BaselineEinheit }),
        };
      });
  }

  return (
    <section aria-labelledby={headingId}>
      <Card>
        <CardHeader>
          <CardTitle id={headingId} as="h2">
            {t('stammdaten.messkonzept.baselinePerioden.titel')} · {energietraegerLabel}
          </CardTitle>
          <p className="max-w-prose text-sm text-muted-foreground">
            {t('stammdaten.messkonzept.baselinePerioden.beschreibung')}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {daten.isPending && (
            <p className="text-sm text-muted-foreground">{t('stammdaten.messkonzept.baselinePerioden.laedt')}</p>
          )}
          {daten.isError && (
            <StatusRegion ton="fehler" nachricht={t('stammdaten.messkonzept.baselinePerioden.ladeFehler')} />
          )}

          {daten.data !== undefined && (
            <>
              {/*
                Die Fehlmeldung steht als FEHLER und nicht als Hinweis: Ohne
                Periode bleibt fuer GTZ_base nur eine von Hand gesetzte
                Gradtagzahl. Das ist kein neutraler Anfangszustand.
              */}
              {!daten.data.gtzBaseErmittelbar && !bearbeitet && (
                <StatusRegion
                  ton="fehler"
                  nachricht={t('stammdaten.messkonzept.baselinePerioden.keineWarnung')}
                />
              )}

              {bearbeitet ? (
                <div className="space-y-3">
                  <table className="w-full text-sm" aria-describedby={tabellenId}>
                    <caption id={tabellenId} className="mb-2 text-left text-sm font-medium">
                      {t('stammdaten.messkonzept.baselinePerioden.tabelle.caption')}
                    </caption>
                    <thead>
                      <tr className="text-left">
                        <th scope="col" className="pb-1 pr-2 font-medium">
                          {t('stammdaten.messkonzept.baselinePerioden.spalte.von')}
                        </th>
                        <th scope="col" className="pb-1 pr-2 font-medium">
                          {t('stammdaten.messkonzept.baselinePerioden.spalte.bis')}
                        </th>
                        <th scope="col" className="pb-1 pr-2 font-medium">
                          {t('stammdaten.messkonzept.baselinePerioden.spalte.menge')}
                        </th>
                        <th scope="col" className="pb-1 pr-2 font-medium">
                          {t('stammdaten.messkonzept.baselinePerioden.spalte.einheit')}
                        </th>
                        <th scope="col" className="pb-1 font-medium">
                          <span className="sr-only">{t('stammdaten.messkonzept.baselinePerioden.spalte.aktion')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {entwurf.map((zeile, index) => (
                        <tr key={zeile.schluessel}>
                          <td className="py-1 pr-2">
                            <input
                              type="date"
                              className="w-full rounded-md border border-input bg-background px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`${t('stammdaten.messkonzept.baselinePerioden.aria.von')} ${String(index + 1)}`}
                              value={zeile.von}
                              onChange={(ereignis) => {
                                aendere(zeile.schluessel, 'von', ereignis.target.value);
                              }}
                            />
                          </td>
                          <td className="py-1 pr-2">
                            <input
                              type="date"
                              className="w-full rounded-md border border-input bg-background px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`${t('stammdaten.messkonzept.baselinePerioden.aria.bis')} ${String(index + 1)}`}
                              value={zeile.bis}
                              onChange={(ereignis) => {
                                aendere(zeile.schluessel, 'bis', ereignis.target.value);
                              }}
                            />
                          </td>
                          <td className="py-1 pr-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              className="w-full rounded-md border border-input bg-background px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`${t('stammdaten.messkonzept.baselinePerioden.aria.menge')} ${String(index + 1)}`}
                              value={zeile.menge}
                              onChange={(ereignis) => {
                                aendere(zeile.schluessel, 'menge', ereignis.target.value);
                              }}
                            />
                          </td>
                          <td className="py-1 pr-2">
                            <select
                              className="w-full rounded-md border border-input bg-background px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`${t('stammdaten.messkonzept.baselinePerioden.aria.einheit')} ${String(index + 1)}`}
                              value={zeile.einheit}
                              onChange={(ereignis) => {
                                aendere(zeile.schluessel, 'einheit', ereignis.target.value);
                              }}
                            >
                              <option value="">{t('stammdaten.messkonzept.baselinePerioden.einheitLeer')}</option>
                              {EINHEITEN.map((einheit) => (
                                <option key={einheit} value={einheit}>
                                  {einheit}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                entferne(zeile.schluessel);
                              }}
                            >
                              {`${t('stammdaten.messkonzept.baselinePerioden.zeileEntfernen')} ${String(index + 1)}`}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setzeEntwurf((vorher) => [...(vorher ?? []), leereZeile()]);
                    }}
                  >
                    {t('stammdaten.messkonzept.baselinePerioden.zeileHinzufuegen')}
                  </Button>
                  <p className="max-w-prose text-xs text-muted-foreground">
                    {t('stammdaten.messkonzept.baselinePerioden.bisHinweis')}
                  </p>
                </div>
              ) : daten.data.perioden.length === 0 ? (
                <p className="text-sm">{t('stammdaten.messkonzept.baselinePerioden.leer')}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {daten.data.perioden.map((periode) => (
                    <li key={periode.id}>
                      {formatiereKalenderdatum(periode.von)} – {formatiereKalenderdatum(periode.letzterTag)}{' '}
                      <span className="text-muted-foreground">
                        ({`${zahl(periode.tage)} ${t('stammdaten.messkonzept.baselinePerioden.tage')}`}
                        {periode.menge !== null
                          ? `, ${zahl(periode.menge)}${periode.einheit === null ? '' : ` ${periode.einheit}`}`
                          : ''}
                        )
                      </span>
                      {periode.laengeAuffaellig && (
                        <span className="ml-2 text-destructive">
                          {t('stammdaten.messkonzept.baselinePerioden.laengeAuffaellig')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/*
                Die beiden Abgleiche stehen NUR im Lesezustand: Waehrend des
                Bearbeitens beziehen sie sich auf den gespeicherten Stand und
                waeren irrefuehrend.
              */}
              {!bearbeitet && daten.data.anzahlWeichtAb && (
                <StatusRegion
                  ton="fehler"
                  nachricht={
                    `${t('stammdaten.messkonzept.baselinePerioden.anzahlWeichtAbPraefix')} ` +
                    `${String(daten.data.abrechnungenAnzahlDeklariert ?? 0)} ` +
                    `${t('stammdaten.messkonzept.baselinePerioden.anzahlWeichtAbMitte')} ` +
                    `${String(daten.data.perioden.length)} ` +
                    `${t('stammdaten.messkonzept.baselinePerioden.anzahlWeichtAbSchluss')}`
                  }
                />
              )}
              {!bearbeitet && daten.data.mengeMittel !== null && daten.data.baselineWert !== null && (
                <p className="max-w-prose text-sm text-muted-foreground">
                  {`${t('stammdaten.messkonzept.baselinePerioden.mengeMittelPraefix')} ` +
                    `${zahl(daten.data.mengeMittel)} ${daten.data.baselineEinheit ?? ''} · ` +
                    `${t('stammdaten.messkonzept.baselinePerioden.mengeMittelBaseline')} ` +
                    `${zahl(daten.data.baselineWert)} ${daten.data.baselineEinheit ?? ''}. ` +
                    `${t('stammdaten.messkonzept.baselinePerioden.mengeMittelHinweis')}`}
                </p>
              )}

              <StatusRegion
                ton="fehler"
                nachricht={
                  speichern.isError
                    ? (speichern.error.detail ?? t('stammdaten.messkonzept.baselinePerioden.fehler'))
                    : undefined
                }
              />
              <StatusRegion
                ton="erfolg"
                nachricht={
                  speichern.isSuccess && !bearbeitet
                    ? t('stammdaten.messkonzept.baselinePerioden.gespeichert')
                    : undefined
                }
              />

              <div className="flex flex-wrap gap-2">
                {bearbeitet ? (
                  <>
                    <Button
                      type="button"
                      disabled={speichern.isPending}
                      onClick={() => {
                        speichern.mutate(zuNutzlast(entwurf), {
                          onSuccess: () => {
                            setzeEntwurf(undefined);
                          },
                        });
                      }}
                    >
                      {speichern.isPending
                        ? t('stammdaten.messkonzept.baselinePerioden.speichernLaeuft')
                        : t('stammdaten.messkonzept.baselinePerioden.speichern')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setzeEntwurf(undefined);
                      }}
                    >
                      {t('stammdaten.messkonzept.baselinePerioden.abbrechen')}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      starteBearbeitung(daten.data);
                    }}
                  >
                    {t('stammdaten.messkonzept.baselinePerioden.bearbeiten')}
                  </Button>
                )}
              </div>

              <p className="max-w-prose text-xs text-muted-foreground">
                {t('stammdaten.messkonzept.baselinePerioden.hinweisNachtraeglich')}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
