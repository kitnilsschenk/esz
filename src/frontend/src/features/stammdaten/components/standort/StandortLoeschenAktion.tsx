import { useState, type ReactNode } from 'react';
import { useStandortLoeschenView } from '../../hooks/standort';
import { Button } from '../../../../shared/ui/button';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { t } from '../../../../shared/i18n/t';

export interface StandortLoeschenAktionProps {
  readonly endkundeId: string;
  readonly standortId: string;
  readonly onErfolg: () => void;
}

/**
 * „Hart löschen"-Aktion (D2.6, "Korrektur von Fehlanlagen" — NUR
 * Blattknoten ohne jede Verortungshistorie, sonst 409). `ConfirmDialog`
 * (analog `EndkundeSperrenAktion`) — echtes Hard-DELETE, daher zusätzlich
 * `variant="destructive"` UND eine deutliche Warnung im Dialogtext.
 */
export function StandortLoeschenAktion({ endkundeId, standortId, onErfolg }: StandortLoeschenAktionProps): ReactNode {
  const view = useStandortLoeschenView(endkundeId, standortId, onErfolg);
  const [dialogOffen, setDialogOffen] = useState(false);

  return (
    <div className="space-y-3">
      <StatusRegion ton="fehler" nachricht={view.submitErrorMessage} />
        <StatusRegion ton="erfolg" nachricht={view.erfolgsMeldung} />
      <Button type="button" variant="destructive" disabled={view.isSubmitting} onClick={() => setDialogOffen(true)}>
        {t('stammdaten.standort.aktionen.loeschenAction')}
      </Button>
      <ConfirmDialog
        titel={t('stammdaten.standort.aktionen.loeschenDialogTitel')}
        beschreibung={t('stammdaten.standort.aktionen.loeschenDialogBeschreibung')}
        bestaetigenLabel={t('stammdaten.standort.aktionen.loeschenAction')}
        abbrechenLabel={t('stammdaten.common.abbrechen')}
        variant="destructive"
        offen={dialogOffen}
        onSchliessen={() => setDialogOffen(false)}
        onBestaetigen={() => {
          setDialogOffen(false);
          view.loeschen();
        }}
      />
    </div>
  );
}
