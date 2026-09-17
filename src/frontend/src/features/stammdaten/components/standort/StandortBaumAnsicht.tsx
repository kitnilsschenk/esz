import { useState, type ReactNode } from 'react';
import { useStandortBaumView } from '../../hooks/standort';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import { StandortBaum } from './StandortBaum';
import { StandortKindAnlegenFormular } from './StandortKindAnlegenFormular';
import { StandortKnotenAktionen } from './StandortKnotenAktionen';
import { VerbrauchAnsicht } from '../verbrauch';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { Button } from '../../../../shared/ui/button';
import { t } from '../../../../shared/i18n/t';

export interface StandortBaumAnsichtProps {
  readonly endkundeId: string;
}

/**
 * Standort-/Gebäudestruktur EINES Endkunden (ADR-0010) — verdrahtet die
 * Baum-Struktur-Query, die Label-Batch-Query (D5, ZWEI getrennte Queries,
 * s. `useStandortBaumView`) und das Aktions-Panel des aktuell ausgewählten
 * Knotens. Zwei-Spalten-Layout ab `lg`: Baum links, Aktionen rechts — der
 * Baum bleibt die zentrale Navigationsfläche, JEDE schreibende Aktion
 * (Anlegen/Ändern/Verschieben/Stilllegen/Löschen/Zähler-Verortung) läuft
 * inline im rechten Panel, kein separates Routing je Aktion.
 */
export function StandortBaumAnsicht({ endkundeId }: StandortBaumAnsichtProps): ReactNode {
  const view = useStandortBaumView(endkundeId);
  const kannBearbeiten = useKannStammdatenAnlegen();
  const [wurzelFormularOffen, setWurzelFormularOffen] = useState(false);

  const aktiverKnoten = view.alleKnoten.find((eintrag) => eintrag.id === view.aktiveId);
  const aktiverKnotenView = view.knoten.find((eintrag) => eintrag.id === view.aktiveId);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle as="h2">{t('stammdaten.standort.baum.sectionTitle')}</CardTitle>
            {kannBearbeiten && (
              <Button type="button" size="sm" variant="outline" onClick={() => setWurzelFormularOffen((bisher) => !bisher)}>
                {t('stammdaten.standort.form.wurzelAnlegenAction')}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {wurzelFormularOffen && kannBearbeiten && (
              <StandortKindAnlegenFormular
                endkundeId={endkundeId}
                parentId={null}
                onErfolg={(neueId) => {
                  setWurzelFormularOffen(false);
                  view.setAktiveId(neueId);
                }}
                onAbbrechen={() => setWurzelFormularOffen(false)}
              />
            )}
            <StandortBaum
              knoten={view.knoten}
              aktiveId={view.aktiveId}
              onAktivWechseln={view.setAktiveId}
              onToggleExpand={view.toggleExpand}
              isPending={view.isPending}
              isError={view.isError}
              istLeer={view.istLeer}
              loadingMessage={t('stammdaten.common.laedt')}
              errorMessage={view.errorMessage ?? t('stammdaten.common.fehler')}
              emptyMessage={t('stammdaten.standort.baum.leer')}
              ariaLabel={t('stammdaten.standort.baum.ariaLabel')}
            />
          </CardContent>
        </Card>
        {aktiverKnoten !== undefined && aktiverKnotenView !== undefined && (
          <StandortKnotenAktionen
            endkundeId={endkundeId}
            knoten={aktiverKnoten}
            anzeigeName={aktiverKnotenView.anzeigeName}
            istPlatzhalter={aktiverKnotenView.istPlatzhalter}
            labelItem={view.labelItemFuer(aktiverKnoten.id)}
            alleKnoten={view.alleKnoten}
            anzeigeNameFuer={view.anzeigeNameFuer}
            onKindAngelegt={view.setAktiveId}
          />
        )}
      </div>
      {aktiverKnoten !== undefined && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t('stammdaten.verbrauch.sectionTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* `key` erzwingt einen frischen Filter-/Zeitraum-Zustand bei Knotenwechsel (kein "Verbrauch von Knoten A" unter Knoten B stehen lassen). */}
            <VerbrauchAnsicht key={aktiverKnoten.id} standortId={aktiverKnoten.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
