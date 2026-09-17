import { useId, type ReactNode } from 'react';
import type { GrundlastHerleitung } from '@edms/shared';
import { Button } from '../../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { Input } from '../../../../shared/ui/input';
import { Label } from '../../../../shared/ui/label';
import { Select } from '../../../../shared/ui/select';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { formatiereKalenderdatum } from '../../../../shared/format/datum';
import { t } from '../../../../shared/i18n/t';
import { useBerechnungslaufAnlegenView } from '../../hooks/berechnung/useBerechnungslaufAnlegenView';

export interface BerechnungslaufAnlegenFormularProps {
  readonly endkundeId: string;
}

// OHNE `Record<…, string>`-Annotation: Die `as const`-Literale sind
// genau die `MessageKey`s, die `t()` zur Compile-Zeit prueft. Eine
// Verbreiterung auf `string` haette diese Pruefung ausgeschaltet.
const HINDERNIS_TEXTE = {
  keine_baseline: 'stammdaten.berechnung.anlegen.hindernis.keineBaseline',
  einheit_nicht_verwertbar: 'stammdaten.berechnung.anlegen.hindernis.einheitNichtVerwertbar',
  keine_zaehler: 'stammdaten.berechnung.anlegen.hindernis.keineZaehler',
  keine_daten: 'stammdaten.berechnung.anlegen.hindernis.keineDaten',
  gtz_base_fehlt: 'stammdaten.berechnung.anlegen.hindernis.gtzBaseFehlt',
  systemgrenze_fallback: 'stammdaten.berechnung.anlegen.hindernis.systemgrenzeFallback',
  grundlast_wird_angepasst: 'stammdaten.berechnung.anlegen.hindernis.grundlastWirdAngepasst',
  station_nur_aus_laeufen: 'stammdaten.berechnung.anlegen.hindernis.stationNurAusLaeufen',
} as const;

function zahl(wert: number, stellen = 1): string {
  return wert.toLocaleString('de-DE', { maximumFractionDigits: stellen });
}

/**
 * „Berechnung starten" — der Weg zum ersten Lauf eines Kunden.
 *
 * **Warum es dieses Formular gibt.** Bis hierher entstand ein
 * Berechnungslauf ausschließlich serverseitig, in der Praxis also per
 * Aufbau-Skript. Damit brach die Kundenkette an ihrer zweiten Stelle ab:
 * Stammdaten, Messkonzept, Systemgrenze und Baseline ließen sich pflegen,
 * aber der Schritt, der aus alldem Zahlen macht, war nicht bedienbar — und
 * alles danach (Einsparlauf, Preflight, Export, Nutzerinformation) setzt ihn
 * voraus.
 *
 * **Warum die Felder vorbelegt sind.** Der Lauf verlangt sechs Parameter.
 * Der heikelste ist der Grundlastanteil: Er teilt die Baseline in einen
 * witterungsunabhängigen und einen witterungsgeführten Anteil. Ein zu
 * kleiner Wert hängt zu viel an den Gradtagzahlen, und die gehen im Sommer
 * gegen null — die Referenz sackt ab, während der Ist-Verbrauch bleibt. Das
 * Ergebnis ist rechnerischer Mehrverbrauch, wo eingespart wurde. Genau das
 * ist in diesem Projekt mit einem geratenen `0,25` passiert.
 *
 * Der Server leitet den Wert deshalb her und liefert die Rechnung mit. Sie
 * steht sichtbar unter dem Feld — nicht damit man sie glaubt, sondern damit
 * man ihr widersprechen kann.
 */
export function BerechnungslaufAnlegenFormular({ endkundeId }: BerechnungslaufAnlegenFormularProps): ReactNode {
  const view = useBerechnungslaufAnlegenView(endkundeId);
  const feldId = useId();
  const stationListeId = `${feldId}-stationen`;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('stammdaten.berechnung.anlegen.titel')}</CardTitle>
        <p className="max-w-prose text-sm text-muted-foreground">
          {t('stammdaten.berechnung.anlegen.beschreibung')}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {view.isPending && <p className="text-sm text-muted-foreground">{t('stammdaten.common.laedt')}</p>}
        {view.isError && (
          <StatusRegion ton="fehler" nachricht={t('stammdaten.berechnung.anlegen.ladeFehler')} />
        )}

        {!view.isPending && !view.isError && view.energietraeger.length === 0 && (
          <StatusRegion ton="fehler" nachricht={t('stammdaten.berechnung.anlegen.keinMesskonzept')} />
        )}

        {view.energietraeger.length > 0 && (
          <>
            <div className="space-y-2">
              <Label htmlFor={`${feldId}-mvet`}>{t('stammdaten.berechnung.anlegen.energietraegerLabel')}</Label>
              <Select
                id={`${feldId}-mvet`}
                value={view.werte.mvetId}
                onChange={(ereignis) => {
                  view.setzeWert('mvetId', ereignis.target.value);
                }}
              >
                <option value="">{t('stammdaten.berechnung.anlegen.energietraegerPlatzhalter')}</option>
                {view.energietraeger.map((eintrag) => (
                  <option key={eintrag.mvetId} value={eintrag.mvetId}>
                    {t(`stammdaten.common.enums.energietraeger.${eintrag.energietraeger}`)}
                  </option>
                ))}
              </Select>
              <p className="max-w-prose text-xs text-muted-foreground">
                {t('stammdaten.berechnung.anlegen.energietraegerHinweis')}
              </p>
            </div>

            {view.vorschlagLaedt && (
              <p className="text-sm text-muted-foreground">{t('stammdaten.berechnung.anlegen.vorschlagLaedt')}</p>
            )}

            {/*
              Hindernisse ZUERST — vor den Feldern. Wer erst unten am
              gesperrten Knopf merkt, dass etwas fehlt, hat den Weg umsonst
              gemacht.
            */}
            {view.hindernisse.map((code) => (
              <StatusRegion key={code} ton="fehler" nachricht={t(HINDERNIS_TEXTE[code])} />
            ))}

            {view.vorschlag !== undefined && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`${feldId}-von`}>{t('stammdaten.berechnung.anlegen.periodeVonLabel')}</Label>
                    <Input
                      id={`${feldId}-von`}
                      type="date"
                      value={view.werte.periodeVon}
                      onChange={(ereignis) => {
                        view.setzeWert('periodeVon', ereignis.target.value);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${feldId}-bis`}>{t('stammdaten.berechnung.anlegen.periodeBisLabel')}</Label>
                    <Input
                      id={`${feldId}-bis`}
                      type="date"
                      value={view.werte.periodeBis}
                      onChange={(ereignis) => {
                        view.setzeWert('periodeBis', ereignis.target.value);
                      }}
                    />
                  </div>
                </div>
                <p className="max-w-prose text-xs text-muted-foreground">
                  {t('stammdaten.berechnung.anlegen.periodeHinweis')}
                  {view.vorschlag.datenVon !== null && view.vorschlag.datenBis !== null && (
                    <>
                      {' '}
                      {t('stammdaten.berechnung.anlegen.datenSpannePraefix')}{' '}
                      {formatiereKalenderdatum(view.vorschlag.datenVon)} –{' '}
                      {formatiereKalenderdatum(view.vorschlag.datenBis)}.
                    </>
                  )}
                </p>

                <div className="space-y-2">
                  <Label htmlFor={`${feldId}-grundlast`}>
                    {t('stammdaten.berechnung.anlegen.grundlastLabel')}
                  </Label>
                  <Input
                    id={`${feldId}-grundlast`}
                    type="text"
                    inputMode="decimal"
                    value={view.werte.grundlastAnteil}
                    onChange={(ereignis) => {
                      view.setzeWert('grundlastAnteil', ereignis.target.value);
                    }}
                  />
                  <GrundlastBegruendung
                    herleitung={view.vorschlag.grundlast}
                    aktuell={view.werte.grundlastAnteil}
                    onUebernehmen={view.uebernimmVorschlag}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${feldId}-station`}>{t('stammdaten.berechnung.anlegen.stationLabel')}</Label>
                  <Input
                    id={`${feldId}-station`}
                    type="text"
                    list={view.vorschlag.stationRefVorschlaege.length > 0 ? stationListeId : undefined}
                    value={view.werte.stationRef}
                    onChange={(ereignis) => {
                      view.setzeWert('stationRef', ereignis.target.value);
                    }}
                  />
                  {view.vorschlag.stationRefVorschlaege.length > 0 && (
                    <datalist id={stationListeId}>
                      {view.vorschlag.stationRefVorschlaege.map((ref) => (
                        <option key={ref} value={ref} />
                      ))}
                    </datalist>
                  )}
                  <p className="max-w-prose text-xs text-muted-foreground">
                    {t('stammdaten.berechnung.anlegen.stationHinweis')}
                  </p>
                </div>
              </>
            )}

            <StatusRegion ton="fehler" nachricht={view.submitErrorMessage} />

            <div className="space-y-2">
              <Button type="button" disabled={!view.absendbar} onClick={view.absenden}>
                {view.isSubmitting
                  ? t('stammdaten.berechnung.anlegen.rechnetLaeuft')
                  : t('stammdaten.berechnung.anlegen.absenden')}
              </Button>
              <p className="max-w-prose text-xs text-muted-foreground">
                {t('stammdaten.berechnung.anlegen.synchronHinweis')}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface GrundlastBegruendungProps {
  readonly herleitung: GrundlastHerleitung | null;
  readonly aktuell: string;
  readonly onUebernehmen: () => void;
}

/**
 * Die Rechnung hinter dem Vorschlag — sichtbar, nicht eingeklappt.
 *
 * Der Grundlastanteil ist die einzige Zahl dieses Formulars, die man nicht
 * nachschlagen kann. Sie ohne Begründung anzuzeigen hieße, sie zu einer
 * Vorgabe zu machen, der man glauben muss.
 */
function GrundlastBegruendung({ herleitung, aktuell, onUebernehmen }: GrundlastBegruendungProps): ReactNode {
  if (herleitung === null) {
    return (
      <p className="max-w-prose text-xs text-destructive-text">
        {t('stammdaten.berechnung.anlegen.grundlastOhneHerleitung')}
      </p>
    );
  }

  const abweichend = aktuell !== String(herleitung.anteilVorschlag);
  return (
    <div className="max-w-prose space-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <p>
        {t('stammdaten.berechnung.anlegen.grundlastHerleitungPraefix')}{' '}
        {zahl(herleitung.sommerMittelKwhTag)} {t('stammdaten.berechnung.anlegen.kwhProTag')}{' '}
        {t('stammdaten.berechnung.anlegen.grundlastHerleitungMitte')} {zahl(herleitung.jahresMittelKwhTag)}{' '}
        {t('stammdaten.berechnung.anlegen.kwhProTag')} ={' '}
        <span className="font-medium text-foreground">{zahl(herleitung.anteilVorschlag, 3)}</span>.
      </p>
      <p>
        {t('stammdaten.berechnung.anlegen.grundlastBasisPraefix')} {formatiereKalenderdatum(herleitung.basisVon)} –{' '}
        {formatiereKalenderdatum(herleitung.basisBis)} ({String(herleitung.basisTage)}{' '}
        {t('stammdaten.berechnung.anlegen.tage')}, {String(herleitung.sommerTage)}{' '}
        {t('stammdaten.berechnung.anlegen.sommertage')}),{' '}
        {herleitung.basisHerkunft === 'baseline_periode'
          ? t('stammdaten.berechnung.anlegen.basisBaseline')
          : t('stammdaten.berechnung.anlegen.basisErsteMessdaten')}
      </p>
      {!herleitung.witterungsgefuehrt && (
        <p className="text-foreground">{t('stammdaten.berechnung.anlegen.nichtWitterungsgefuehrt')}</p>
      )}
      {abweichend && (
        <p>
          {t('stammdaten.berechnung.anlegen.abweichendVomVorschlag')}{' '}
          <button
            type="button"
            className="text-link underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onUebernehmen}
          >
            {t('stammdaten.berechnung.anlegen.vorschlagUebernehmen')}
          </button>
        </p>
      )}
    </div>
  );
}
