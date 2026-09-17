import { useId, useState } from 'react';
import type { Zustellweg } from '@edms/shared';
import { Button } from '../../../shared/ui/button';
import { Badge } from '../../../shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Input } from '../../../shared/ui/input';
import { Label } from '../../../shared/ui/label';
import { Select } from '../../../shared/ui/select';
import { StatusRegion } from '../../../shared/ui/status-region';
import { t } from '../../../shared/i18n/t';
import { NutzerinfoBericht } from './NutzerinfoBericht';
import { useNutzerinfoVerlaufView, type MonatsInfoView } from '../hooks/useNutzerinfoVerlaufView';

export interface NutzerinfoVerlaufAbschnittProps {
  readonly endkundeId: string;
  readonly headingId: string;
}

const ZUSTELLWEGE: readonly Zustellweg[] = ['brief', 'email', 'persoenlich', 'portal_bereitgestellt'];

/**
 * Der Verlauf der monatlichen Nutzerinformation eines Endkunden (TB-06).
 *
 * **Was diese Ansicht ausdrücklich nicht schönt.** Ein Mehrverbrauch wird als
 * Mehrverbrauch benannt und hervorgehoben — das Merkblatt verlangt die
 * Angabe von „Einsparungen und/oder Mehrverbräuchen", und es ist ohnehin das
 * Gesprächsthema mit dem Kunden. Und eine erzeugte, aber nicht zugestellte
 * Information wird als offen ausgewiesen: Erzeugen ist nicht informieren, und
 * solange nichts zugestellt ist, ist die Auflage nicht erfüllt.
 *
 * **Warum die Zustellung hier von Hand vermerkt wird.** Es gibt weder ein
 * Nutzerportal noch einen Versandweg im System. Wer den Kunden auf einem
 * anderen Weg informiert hat, trägt das hier nach — sonst existiert der
 * Nachweis nicht, den TB-06 verlangt. Der Tag ist ein Pflichtfeld und kein
 * „jetzt": Nachgetragen wird ein Vorgang von gestern, nicht von eben.
 */
export function NutzerinfoVerlaufAbschnitt({
  endkundeId,
  headingId,
}: NutzerinfoVerlaufAbschnittProps): React.ReactElement {
  const view = useNutzerinfoVerlaufView(endkundeId);
  const [offeneZeile, setzeOffeneZeile] = useState<string | undefined>(undefined);
  const datumId = useId();
  const wegId = useId();

  return (
    <section aria-labelledby={headingId}>
      <Card>
        <CardHeader>
          <CardTitle as="h2" id={headingId}>
            {t('nutzerinfo.verlauf.titel')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('nutzerinfo.verlauf.beschreibung')}</p>

          {view.offenHinweis !== undefined && (
            <StatusRegion ton="hinweis" nachricht={view.offenHinweis} />
          )}

          {view.isPending && <p className="text-sm text-muted-foreground">{t('nutzerinfo.verlauf.laedt')}</p>}
          {view.isError && <StatusRegion ton="fehler" nachricht={view.ladeFehlerMeldung} />}

          {!view.isPending && !view.isError && view.monate.length === 0 && (
            <p className="text-sm text-muted-foreground">{view.leerMeldung}</p>
          )}

          {view.monate.length > 0 && (
            <ul className="space-y-3">
              {view.monate.map((monat) => (
                <MonatsZeile
                  key={monat.id}
                  monat={monat}
                  istOffen={offeneZeile === monat.id}
                  aufKlappen={() => {
                    setzeOffeneZeile(offeneZeile === monat.id ? undefined : monat.id);
                  }}
                />
              ))}
            </ul>
          )}

          {view.monate.some((monat) => !monat.istZugestellt) && (
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-medium">{t('nutzerinfo.verlauf.zustellungTitel')}</h3>
              <p className="text-sm text-muted-foreground">{t('nutzerinfo.verlauf.zustellungHinweis')}</p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={datumId}>{t('nutzerinfo.verlauf.zugestelltAmLabel')}</Label>
                  <Input
                    id={datumId}
                    type="date"
                    value={view.angaben.zugestelltAm}
                    onChange={(event) => {
                      view.setzeAngaben({ ...view.angaben, zugestelltAm: event.target.value });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={wegId}>{t('nutzerinfo.verlauf.zustellwegLabel')}</Label>
                  <Select
                    id={wegId}
                    value={view.angaben.zustellweg}
                    onChange={(event) => {
                      view.setzeAngaben({ ...view.angaben, zustellweg: event.target.value as Zustellweg });
                    }}
                  >
                    {ZUSTELLWEGE.map((weg) => (
                      <option key={weg} value={weg}>
                        {t(`nutzerinfo.zustellweg.${weg}`)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <ul className="space-y-2">
                {view.monate
                  .filter((monat) => !monat.istZugestellt)
                  .map((monat) => (
                    <li key={monat.id} className="flex items-center justify-between gap-3 text-sm">
                      <span>{monat.monatLabel}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={view.isSubmitting || view.angaben.zugestelltAm === ''}
                        onClick={() => {
                          view.vermerke(monat.id);
                        }}
                      >
                        {t('nutzerinfo.verlauf.zustellungAction')}
                      </Button>
                    </li>
                  ))}
              </ul>

              <StatusRegion ton="fehler" nachricht={view.submitErrorMessage} />
              <StatusRegion ton="erfolg" nachricht={view.erfolgsMeldung} />
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

interface MonatsZeileProps {
  readonly monat: MonatsInfoView;
  readonly istOffen: boolean;
  readonly aufKlappen: () => void;
}

function MonatsZeile({ monat, istOffen, aufKlappen }: MonatsZeileProps): React.ReactElement {
  return (
    <li className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium">{monat.monatLabel}</p>
          <p className={monat.istMehrverbrauch ? 'text-destructive-text' : 'text-sm'}>{monat.ergebnisLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {monat.istZugestellt ? (
            <Badge>{t('nutzerinfo.verlauf.zugestelltBadge')}</Badge>
          ) : (
            <Badge variant="outline">{t('nutzerinfo.verlauf.offenBadge')}</Badge>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={aufKlappen} aria-expanded={istOffen}>
            {istOffen ? t('nutzerinfo.verlauf.wenigerAction') : t('nutzerinfo.verlauf.mehrAction')}
          </Button>
        </div>
      </div>

      {istOffen && (
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <dt className="text-muted-foreground">{t('nutzerinfo.verlauf.verbrauchLabel')}</dt>
          <dd>{monat.verbrauchLabel}</dd>
          <dt className="text-muted-foreground">{t('nutzerinfo.verlauf.erwartungLabel')}</dt>
          <dd>{monat.erwartungLabel}</dd>
          <dt className="text-muted-foreground">{t('nutzerinfo.verlauf.gueteLabel')}</dt>
          <dd>{monat.guteLabel}</dd>
          <dt className="text-muted-foreground">{t('nutzerinfo.verlauf.energietraegerLabel')}</dt>
          <dd>{monat.energietraeger}</dd>
          {monat.zugestelltLabel !== undefined && (
            <>
              <dt className="text-muted-foreground">{t('nutzerinfo.verlauf.zugestelltLabel')}</dt>
              <dd>
                {monat.zugestelltLabel}
                {monat.zustellwegLabel === undefined ? '' : ` · ${monat.zustellwegLabel}`}
              </dd>
            </>
          )}
        </dl>
      )}

      {/*
        Der Bericht wird ERST beim Aufklappen geladen (der Hook haengt an
        diesem Zweig). Ein Verlauf mit zwoelf Monaten loeste sonst zwoelf
        Abfragen aus, von denen der Bearbeiter eine sehen will.
      */}
      {istOffen && (
        <div className="mt-4 border-t pt-4">
          <NutzerinfoBericht informationId={monat.id} />
        </div>
      )}
    </li>
  );
}
