import { useId } from 'react';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Input } from '../../../shared/ui/input';
import { Label } from '../../../shared/ui/label';
import { Select } from '../../../shared/ui/select';
import { StatusRegion } from '../../../shared/ui/status-region';
import { t } from '../../../shared/i18n/t';
import { useGeraeteerkennungView } from '../hooks/useGeraeteerkennungView';

export interface GeraeteerkennungAbschnittProps {
  readonly endkundeId: string;
  readonly headingId: string;
}

/**
 * Geräte- und Anlagengruppen eines Endkunden (TB-05, [Q3] Kap. 5).
 *
 * **Der Abschnitt zeigt, was hier zusammengehört, und lässt weg, was
 * woanders hingehört.** Gruppen werden hier angelegt — sie hängen am
 * Endkunden. Die Zuordnung eines Messkanals wird hier nur ANGEZEIGT und
 * beendet; angelegt wird sie auf der Detailseite des Messkanals, weil der
 * Kanal dort schon im Kontext ist. Wer sie hier anlegen wollte, müsste sich
 * erst durch System → Zähler → Messkanal klicken, um eine Kennung zu finden,
 * die er auf der anderen Seite bereits vor sich hat.
 *
 * **Die Quote darf unbekannt sein.** Ohne Tageswerte steht dort kein „0 %",
 * sondern ein Hinweis, warum sie nicht bestimmbar ist. Eine Null sähe aus wie
 * ein Ergebnis.
 */
export function GeraeteerkennungAbschnitt({
  endkundeId,
  headingId,
}: GeraeteerkennungAbschnittProps): React.ReactElement {
  const view = useGeraeteerkennungView(endkundeId);
  const gruppeId = useId();
  const grundId = useId();
  const jahrId = useId();
  const traegerId = useId();

  return (
    <section aria-labelledby={headingId}>
      <Card>
        <CardHeader>
          <CardTitle as="h2" id={headingId}>
            {t('geraeteerkennung.titel')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">{t('geraeteerkennung.beschreibung')}</p>

          {view.isPending && <p className="text-sm text-muted-foreground">{t('geraeteerkennung.laedt')}</p>}
          {view.isError && <StatusRegion ton="fehler" nachricht={view.ladeFehlerMeldung} />}

          {/* --- Gruppen --- */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">{t('geraeteerkennung.gruppenTitel')}</h3>
            {!view.isPending && view.gruppen.length === 0 && (
              <p className="text-sm text-muted-foreground">{view.gruppenLeerMeldung}</p>
            )}
            {view.gruppen.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {view.gruppen.map((gruppe) => (
                  <li key={gruppe.id}>
                    <Badge variant="secondary">{gruppe.bezeichnung}</Badge>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[16rem] flex-1 space-y-1">
                <Label htmlFor={gruppeId}>{t('geraeteerkennung.gruppeAnlegenLabel')}</Label>
                <Input
                  id={gruppeId}
                  value={view.neueGruppe}
                  onChange={(event) => {
                    view.setzeNeueGruppe(event.target.value);
                  }}
                />
                <p className="text-xs text-muted-foreground">{t('geraeteerkennung.gruppeAnlegenHinweis')}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={view.isSubmitting || view.neueGruppe.trim().length < 2}
                onClick={view.legeGruppeAn}
              >
                {t('geraeteerkennung.gruppeAnlegenAction')}
              </Button>
            </div>
          </div>

          {/* --- Zuordnungen --- */}
          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium">{t('geraeteerkennung.zuordnungenTitel')}</h3>
            <p className="text-sm text-muted-foreground">{t('geraeteerkennung.zuordnungenHinweis')}</p>

            {!view.isPending && view.zuordnungen.length === 0 && (
              <p className="text-sm text-muted-foreground">{view.zuordnungenLeerMeldung}</p>
            )}

            {view.zuordnungen.length > 0 && (
              <>
                <ul className="space-y-3">
                  {view.zuordnungen.map((zuordnung) => (
                    <li key={zuordnung.schluessel} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{zuordnung.gruppeBezeichnung}</p>
                        {zuordnung.wirksam ? (
                          <Badge>{t('geraeteerkennung.zuordnung.wirksamBadge')}</Badge>
                        ) : (
                          <Badge variant="outline">{t('geraeteerkennung.zuordnung.beendetBadge')}</Badge>
                        )}
                      </div>
                      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                        <dt className="text-muted-foreground">{t('geraeteerkennung.zuordnung.methodeLabel')}</dt>
                        <dd>{zuordnung.methodeLabel}</dd>
                        <dt className="text-muted-foreground">
                          {t('geraeteerkennung.zuordnung.genauigkeitLabel')}
                        </dt>
                        <dd>{zuordnung.genauigkeitLabel}</dd>
                        <dt className="text-muted-foreground">
                          {t('geraeteerkennung.zuordnung.topologieLabel')}
                        </dt>
                        <dd>{zuordnung.topologieLabel}</dd>
                        <dt className="text-muted-foreground">{t('geraeteerkennung.zuordnung.anteilLabel')}</dt>
                        <dd>{zuordnung.anteilLabel}</dd>
                        <dt className="text-muted-foreground">{t('geraeteerkennung.zuordnung.zeitraumLabel')}</dt>
                        <dd>{zuordnung.zeitraumLabel}</dd>
                        {zuordnung.beendetGrund !== null && (
                          <>
                            <dt className="text-muted-foreground">
                              {t('geraeteerkennung.zuordnung.beendetLabel')}
                            </dt>
                            <dd>{zuordnung.beendetGrund}</dd>
                          </>
                        )}
                      </dl>
                      {zuordnung.wirksam && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          disabled={view.isSubmitting || view.beendenGrund.trim().length < 3}
                          onClick={() => {
                            view.beende(zuordnung.geraetegruppeId, zuordnung.messkanalId);
                          }}
                        >
                          {t('geraeteerkennung.beendenAction')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="space-y-1">
                  <Label htmlFor={grundId}>{t('geraeteerkennung.beendenGrundLabel')}</Label>
                  <Input
                    id={grundId}
                    value={view.beendenGrund}
                    onChange={(event) => {
                      view.setzeBeendenGrund(event.target.value);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">{t('geraeteerkennung.beendenGrundHinweis')}</p>
                </div>
              </>
            )}
          </div>

          {/* --- Quote --- */}
          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium">{t('geraeteerkennung.quote.titel')}</h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={jahrId}>{t('geraeteerkennung.quote.foerderjahrLabel')}</Label>
                <Select
                  id={jahrId}
                  value={view.foerderjahrId}
                  onChange={(event) => {
                    view.setzeFoerderjahrId(event.target.value);
                  }}
                >
                  <option value="">{t('geraeteerkennung.quote.foerderjahrPlaceholder')}</option>
                  {view.foerderjahre.map((jahr) => (
                    <option key={jahr.id} value={jahr.id}>
                      {jahr.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={traegerId}>{t('geraeteerkennung.quote.energietraegerLabel')}</Label>
                <Input
                  id={traegerId}
                  value={view.energietraeger}
                  onChange={(event) => {
                    view.setzeEnergietraeger(event.target.value);
                  }}
                />
              </div>
            </div>

            {view.foerderjahrId === '' && (
              <p className="text-sm text-muted-foreground">{t('geraeteerkennung.quote.waehlenHinweis')}</p>
            )}
            {view.quoteLaedt && <p className="text-sm text-muted-foreground">{t('geraeteerkennung.quote.laedt')}</p>}

            {view.quote !== undefined && (
              <div className="space-y-3">
                {view.quote.ohneTageswerteHinweis !== undefined && (
                  <StatusRegion ton="hinweis" nachricht={view.quote.ohneTageswerteHinweis} />
                )}

                <p
                  className={
                    view.quote.erreicht === false ? 'font-medium text-destructive-text' : 'font-medium'
                  }
                >
                  {view.quote.erreicht === undefined
                    ? t('geraeteerkennung.quote.unbekannt')
                    : view.quote.erreicht
                      ? t('geraeteerkennung.quote.erreicht')
                      : t('geraeteerkennung.quote.nichtErreicht')}
                </p>

                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  <dt className="text-muted-foreground">{t('geraeteerkennung.quote.istLabel')}</dt>
                  <dd className="font-semibold">{view.quote.quoteLabel ?? '—'}</dd>
                  <dt className="text-muted-foreground">{t('geraeteerkennung.quote.sollLabel')}</dt>
                  <dd>{view.quote.sollLabel}</dd>
                  <dt className="text-muted-foreground">{t('geraeteerkennung.quote.zugeordnetLabel')}</dt>
                  <dd>{view.quote.zugeordnetLabel}</dd>
                  <dt className="text-muted-foreground">{t('geraeteerkennung.quote.gesamtLabel')}</dt>
                  <dd>{view.quote.gesamtLabel}</dd>
                </dl>

                {view.quote.entbehrlichHinweis !== undefined && (
                  <p className="text-sm text-muted-foreground">{view.quote.entbehrlichHinweis}</p>
                )}

                {view.quote.gruppen.length > 0 && (
                  <div className="space-y-1">
                    <h4 className="text-sm font-medium">{t('geraeteerkennung.quote.gruppenTitel')}</h4>
                    <ul className="space-y-1 text-sm">
                      {view.quote.gruppen.map((gruppe) => (
                        <li key={gruppe.id} className="flex justify-between gap-3">
                          <span>{gruppe.bezeichnung}</span>
                          <span className="text-muted-foreground">{gruppe.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <StatusRegion ton="fehler" nachricht={view.submitErrorMessage} />
          <StatusRegion ton="erfolg" nachricht={view.erfolgsMeldung} />
        </CardContent>
      </Card>
    </section>
  );
}
