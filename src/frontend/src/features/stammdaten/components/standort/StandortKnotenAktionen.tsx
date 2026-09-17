import { useState, type ReactNode } from 'react';
import type { StandortLabelItem, StandortStruktur } from '@edms/shared';
import { StandortKindAnlegenFormular } from './StandortKindAnlegenFormular';
import { StandortStrukturAendernFormular } from './StandortStrukturAendernFormular';
import { StandortPiiAendernFormular } from './StandortPiiAendernFormular';
import { StandortVerschiebenFormular } from './StandortVerschiebenFormular';
import { StandortStilllegenAktion } from './StandortStilllegenAktion';
import { StandortLoeschenAktion } from './StandortLoeschenAktion';
import { StandortZaehlerVerortung } from './StandortZaehlerVerortung';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { Button } from '../../../../shared/ui/button';
import { t } from '../../../../shared/i18n/t';

export interface StandortKnotenAktionenProps {
  readonly endkundeId: string;
  readonly knoten: StandortStruktur;
  readonly anzeigeName: string;
  readonly istPlatzhalter: boolean;
  readonly labelItem: StandortLabelItem | undefined;
  readonly alleKnoten: readonly StandortStruktur[];
  readonly anzeigeNameFuer: (standortId: string) => string;
  readonly onKindAngelegt: (standortId: string) => void;
}

type AktivesPanel = 'keine' | 'kindAnlegen' | 'struktur' | 'pii' | 'verschieben' | 'zaehler';

/**
 * Aktions-Panel des aktuell im Baum AUSGEWÄHLTEN Knotens — orchestriert alle
 * schreibenden Aktionen (`create:standort`/`update:standort`/
 * `delete:standort`/Zähler-Verortung, ADR-0010 D5) als jeweils EIN
 * inline-Formular „auf einmal" (`aktivesPanel`, kein separates Routing für
 * jede Aktion — der Baum bleibt die zentrale Navigationsfläche). Alle
 * schreibenden Affordanzen sind über `useKannStammdatenAnlegen` (Rolle
 * `betrieb`) rollen-gated — rein kosmetisch, die Backend-Guards sind die
 * alleinige Durchsetzungsinstanz (`.claude/rules/backend-nestjs.md`).
 *
 * „PII bearbeiten" erscheint NUR, wenn das Label dieses Knotens bereits
 * aufgelöst ist (`!istPlatzhalter`) — ohne aufgelöstes Label gäbe es nichts
 * Sinnvolles vorzubefüllen (s. `StandortPiiAendernFormular`-Klassen-Dok:
 * `geo` wird ohnehin nie vorbefüllt).
 */
export function StandortKnotenAktionen(props: StandortKnotenAktionenProps): ReactNode {
  const { endkundeId, knoten, anzeigeName, istPlatzhalter, labelItem, alleKnoten, anzeigeNameFuer, onKindAngelegt } = props;
  const kannBearbeiten = useKannStammdatenAnlegen();
  const [aktivesPanel, setAktivesPanel] = useState<AktivesPanel>('keine');

  function schliessen(): void {
    setAktivesPanel('keine');
  }

  function togglePanel(panel: AktivesPanel): void {
    setAktivesPanel((bisher) => (bisher === panel ? 'keine' : panel));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('stammdaten.standort.aktionen.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('stammdaten.standort.aktionen.ausgewaehlterKnoten')}
            </dt>
            <dd className="text-sm text-foreground">
              {t(`stammdaten.common.enums.standortTyp.${knoten.typ}`)} —{' '}
              <span className={istPlatzhalter ? 'italic text-muted-foreground' : undefined}>{anzeigeName}</span>
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('stammdaten.standort.aktionen.status')}</dt>
            <dd className="text-sm text-foreground">{t(`stammdaten.common.enums.betriebsStatus.${knoten.status}`)}</dd>
          </div>
        </dl>

        {kannBearbeiten && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={aktivesPanel === 'kindAnlegen' ? 'default' : 'outline'} onClick={() => togglePanel('kindAnlegen')}>
              {t('stammdaten.standort.aktionen.kindAnlegenAction')}
            </Button>
            <Button type="button" size="sm" variant={aktivesPanel === 'struktur' ? 'default' : 'outline'} onClick={() => togglePanel('struktur')}>
              {t('stammdaten.standort.aktionen.strukturBearbeitenAction')}
            </Button>
            {!istPlatzhalter && (
              <Button type="button" size="sm" variant={aktivesPanel === 'pii' ? 'default' : 'outline'} onClick={() => togglePanel('pii')}>
                {t('stammdaten.standort.aktionen.piiBearbeitenAction')}
              </Button>
            )}
            <Button type="button" size="sm" variant={aktivesPanel === 'verschieben' ? 'default' : 'outline'} onClick={() => togglePanel('verschieben')}>
              {t('stammdaten.standort.aktionen.verschiebenAction')}
            </Button>
            <Button type="button" size="sm" variant={aktivesPanel === 'zaehler' ? 'default' : 'outline'} onClick={() => togglePanel('zaehler')}>
              {t('stammdaten.standort.aktionen.zaehlerVerwaltenAction')}
            </Button>
          </div>
        )}

        {aktivesPanel === 'kindAnlegen' && kannBearbeiten && (
          <StandortKindAnlegenFormular
            endkundeId={endkundeId}
            parentId={knoten.id}
            onErfolg={(neueId) => {
              schliessen();
              onKindAngelegt(neueId);
            }}
            onAbbrechen={schliessen}
          />
        )}
        {aktivesPanel === 'struktur' && kannBearbeiten && (
          <StandortStrukturAendernFormular endkundeId={endkundeId} knoten={knoten} onAbbrechen={schliessen} />
        )}
        {aktivesPanel === 'pii' && kannBearbeiten && !istPlatzhalter && (
          <StandortPiiAendernFormular
            endkundeId={endkundeId}
            knoten={knoten}
            aktuelleBezeichnung={labelItem?.bezeichnung ?? ''}
            aktuelleAnschrift={labelItem?.anschrift ?? null}
            onErfolg={schliessen}
            onAbbrechen={schliessen}
          />
        )}
        {aktivesPanel === 'verschieben' && kannBearbeiten && (
          <StandortVerschiebenFormular
            endkundeId={endkundeId}
            knoten={knoten}
            alleKnoten={alleKnoten}
            anzeigeNameFuer={anzeigeNameFuer}
            onErfolg={schliessen}
            onAbbrechen={schliessen}
          />
        )}
        {aktivesPanel === 'zaehler' && <StandortZaehlerVerortung standortId={knoten.id} />}

        {kannBearbeiten && (
          <div className="flex flex-wrap gap-4 border-t border-border pt-4">
            {knoten.status === 'aktiv' && <StandortStilllegenAktion endkundeId={endkundeId} standortId={knoten.id} onErfolg={schliessen} />}
            <StandortLoeschenAktion endkundeId={endkundeId} standortId={knoten.id} onErfolg={schliessen} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
