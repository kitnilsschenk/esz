import type { ReactNode } from 'react';
import type { EndkundeListItem } from '@edms/shared';
import { useStandortUebersichtView } from '../../hooks/standort';
import { EndkundenTabelle } from '../endkunde';
import { StandortBaumAnsicht } from './StandortBaumAnsicht';
import { kurzId } from '../shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { Button } from '../../../../shared/ui/button';
import { t } from '../../../../shared/i18n/t';

/**
 * Globale Standort-Übersicht (`/stammdaten/standorte`) — behebt das
 * Auffindbarkeits-Problem aus dem Nutzertest: der Standort-/Gebäudebaum war
 * bislang AUSSCHLIESSLICH über Stammdaten → Endkunden → EINEN bestimmten
 * Endkunden öffnen → Abschnitt „Standorte" erreichbar (vier Ebenen tief,
 * so die Begründung der inzwischen entfernten `nav/`-Ablage). Diese Ansicht
 * lässt den
 * Endkunden HIER wählen (`EndkundenTabelle`, wiederverwendet — KEINE eigene
 * Such-/Paginierungslogik) und zeigt darunter GENAU dieselbe
 * `StandortBaumAnsicht` wie die bestehende Sub-Ressourcen-Route
 * `/stammdaten/endkunden/:endkundeId/standorte` (die weiterhin unverändert
 * über `EndkundeDetailAnsicht` erreichbar bleibt — Deep-Links brechen nicht).
 *
 * Ist GENAU EIN Endkunde vorhanden, entfällt die Auswahl vollständig
 * (`useStandortUebersichtView`s `nurEinEndkunde`) — direkt der Baum.
 */
export function StandortUebersichtAnsicht(): ReactNode {
  const view = useStandortUebersichtView();

  if (view.isPending) {
    return (
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {t('stammdaten.common.laedt')}
      </p>
    );
  }

  if (view.isError) {
    return (
      <p role="alert" className="text-sm font-medium text-destructive-text">
        {t('stammdaten.common.fehler')}
      </p>
    );
  }

  if (view.endkunden.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('stammdaten.standort.uebersicht.keineEndkunden')}</p>;
  }

  return (
    <div className="space-y-6">
      {view.ausgewaehlteEndkundeId === undefined && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t('stammdaten.standort.uebersicht.auswahlSectionTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('stammdaten.standort.uebersicht.auswahlHinweis')}</p>
            <EndkundenTabelle
              renderRowAction={(item: EndkundeListItem) => (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`${t('stammdaten.standort.uebersicht.auswaehlenAction')} ${kurzId(item.id)}`}
                  onClick={() => view.waehleEndkunde(item.id)}
                >
                  {t('stammdaten.standort.uebersicht.auswaehlenAction')}
                </Button>
              )}
            />
          </CardContent>
        </Card>
      )}
      {view.ausgewaehlteEndkundeId !== undefined && (
        <>
          {!view.nurEinEndkunde && (
            <Button type="button" size="sm" variant="outline" onClick={view.wechsleEndkunde}>
              {t('stammdaten.standort.uebersicht.andererEndkundeAction')}
            </Button>
          )}
          <StandortBaumAnsicht endkundeId={view.ausgewaehlteEndkundeId} />
        </>
      )}
    </div>
  );
}
