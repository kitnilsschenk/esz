import { useState, type ReactNode } from 'react';
import { useVerbrauchView } from '../../hooks/verbrauch';
import { VerbrauchZeitraumFilter } from './VerbrauchZeitraumFilter';
import { VerbrauchBalkendiagramm } from './VerbrauchBalkendiagramm';
import { VerbrauchTabelle } from './VerbrauchTabelle';
import { Button } from '../../../../shared/ui/button';
import { t } from '../../../../shared/i18n/t';

export interface VerbrauchAnsichtProps {
  readonly standortId: string;
}

type Anzeigemodus = 'diagramm' | 'tabelle';

/**
 * Verbrauchsanzeige EINES ausgewählten Standort-Knotens (letztes fehlendes
 * Ausliefer-Stück, `messwerte.openapi.yaml` Route A,
 * `read:verbrauch_aggregat`). Orchestriert Zeitraum-/Auflösungsfilter,
 * Metadaten-Anzeige (Vertrauens-Kontext: einbezogene Zähler/Kanäle, erkannte
 * Lücken), Diagramm/Tabelle-Umschalter (A11y-Pflicht: Daten nie nur
 * grafisch) sowie Lade-/Fehler-/Leer-/Ungültig-Zeitraum-Zustände.
 *
 * Getrennte Diagramme JE Einheit (small multiples, `view.gruppen`) — NIE
 * zwei Einheiten in einem Achsenkreuz (`dataviz`-Skill).
 */
export function VerbrauchAnsicht({ standortId }: VerbrauchAnsichtProps): ReactNode {
  const view = useVerbrauchView(standortId);
  const [modus, setModus] = useState<Anzeigemodus>('diagramm');

  const zeigeInhalt = !view.zeitraumUngueltig && !view.isPending && !view.isError;

  return (
    <div className="space-y-4">
      <VerbrauchZeitraumFilter
        vonDatum={view.vonDatum}
        bisDatum={view.bisDatum}
        aufloesung={view.aufloesung}
        inklusiveUnterknoten={view.inklusiveUnterknoten}
        zeitraumUngueltig={view.zeitraumUngueltig}
        onVonDatumChange={view.setVonDatum}
        onBisDatumChange={view.setBisDatum}
        onAufloesungChange={view.setAufloesung}
        onInklusiveUnterknotenChange={view.setInklusiveUnterknoten}
      />

      {!view.zeitraumUngueltig && view.isPending && (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {t('stammdaten.common.laedt')}
        </p>
      )}

      {view.isError && (
        <p role="alert" className="text-sm font-medium text-destructive-text">
          {t('stammdaten.common.fehler')}
        </p>
      )}

      {zeigeInhalt && view.metadaten && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('stammdaten.verbrauch.metadaten.einbezogeneZaehler')}
            </dt>
            <dd className="text-foreground">{view.metadaten.einbezogeneZaehler}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('stammdaten.verbrauch.metadaten.einbezogeneKanaele')}
            </dt>
            <dd className="text-foreground">
              {view.metadaten.einbezogeneKanaele}
              {view.metadaten.ausgelasseneUntermessungen > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {`+ ${String(view.metadaten.ausgelasseneUntermessungen)} ${t('stammdaten.verbrauch.metadaten.untermessungenAusgelassenSuffix')}`}
                </span>
              )}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('stammdaten.verbrauch.metadaten.erkannteLuecken')}
            </dt>
            <dd className="text-foreground">
              {view.metadaten.erkannteLuecken > 0
                ? `${String(view.metadaten.erkannteLuecken)} ${t('stammdaten.verbrauch.metadaten.erkannteLueckenSuffix')}`
                : t('stammdaten.verbrauch.metadaten.keineLuecken')}
            </dd>
          </div>
        </dl>
      )}

      {zeigeInhalt && view.istLeer && <p className="text-sm text-muted-foreground">{t('stammdaten.verbrauch.leer')}</p>}

      {zeigeInhalt && !view.istLeer && (
        <>
          <div className="flex gap-2" role="group" aria-label={t('stammdaten.verbrauch.ansichtWechsel.ariaLabel')}>
            <Button type="button" size="sm" variant={modus === 'diagramm' ? 'default' : 'outline'} aria-pressed={modus === 'diagramm'} onClick={() => setModus('diagramm')}>
              {t('stammdaten.verbrauch.ansichtWechsel.diagramm')}
            </Button>
            <Button type="button" size="sm" variant={modus === 'tabelle' ? 'default' : 'outline'} aria-pressed={modus === 'tabelle'} onClick={() => setModus('tabelle')}>
              {t('stammdaten.verbrauch.ansichtWechsel.tabelle')}
            </Button>
          </div>

          {modus === 'diagramm' && (
            <div className="space-y-6">
              {view.gruppen.map((gruppe) => {
                const einzigeSerie = gruppe.serien.length === 1 ? gruppe.serien[0] : undefined;
                const titel =
                  einzigeSerie !== undefined
                    ? `${einzigeSerie.messgroesse} (${gruppe.einheit})`
                    : `${t('stammdaten.verbrauch.diagramm.titelPraefix')} (${gruppe.einheit})`;
                return (
                  <VerbrauchBalkendiagramm
                    key={gruppe.einheit}
                    titel={titel}
                    einheit={gruppe.einheit}
                    aufloesung={view.aufloesung}
                    buckets={view.buckets}
                    serien={gruppe.serien}
                  />
                );
              })}
            </div>
          )}

          {modus === 'tabelle' && (
            <VerbrauchTabelle caption={t('stammdaten.verbrauch.tabelle.caption')} zeilen={view.tabelle} aufloesung={view.aufloesung} />
          )}
        </>
      )}
    </div>
  );
}
