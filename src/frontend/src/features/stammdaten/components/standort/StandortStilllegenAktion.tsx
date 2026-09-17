import { useState, type ReactNode } from 'react';
import { STANDORT_STILLLEGEN_GRUND_WERTE } from '../../api/standort';
import { useStandortStilllegenView } from '../../hooks/standort';
import { Button } from '../../../../shared/ui/button';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog';
import { Label } from '../../../../shared/ui/label';
import { Select } from '../../../../shared/ui/select';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { t } from '../../../../shared/i18n/t';

export interface StandortStilllegenAktionProps {
  readonly endkundeId: string;
  readonly standortId: string;
  readonly onErfolg: () => void;
}

function grundLabel(grund: (typeof STANDORT_STILLLEGEN_GRUND_WERTE)[number]): string {
  return t(`stammdaten.standort.form.stilllegenGrundOptionen.${grund}`);
}

/**
 * „Stilllegen"-Aktion (D2.6, Zustandswechsel, KEIN Hard-Delete) — analog
 * `EndkundeSperrenAktion`: `ConfirmDialog` VOR der eigentlichen Aktion.
 * `grund` ist whitelisted (Linie 2, kein Freitext) — ein natives `<select>`
 * AUSSERHALB des Dialogs (der Dialog selbst kennt nur ein Bestätigungswort-
 * Eingabefeld, kein beliebiges Formularfeld), der Bestätigen-Button bleibt
 * deaktiviert, bis ein Grund gewählt ist.
 */
export function StandortStilllegenAktion({ endkundeId, standortId, onErfolg }: StandortStilllegenAktionProps): ReactNode {
  const view = useStandortStilllegenView(endkundeId, standortId, onErfolg);
  const [grund, setGrund] = useState('');
  const [dialogOffen, setDialogOffen] = useState(false);

  return (
    <div className="space-y-3">
      <StatusRegion ton="fehler" nachricht={view.submitErrorMessage} />
        <StatusRegion ton="erfolg" nachricht={view.erfolgsMeldung} />
      <div className="space-y-1">
        <Label htmlFor="standort-stilllegen-grund">{t('stammdaten.standort.form.stilllegenGrundLabel')}</Label>
        <Select id="standort-stilllegen-grund" value={grund} onChange={(event) => setGrund(event.target.value)}>
          <option value="">{t('stammdaten.standort.form.stilllegenGrundPlatzhalter')}</option>
          {STANDORT_STILLLEGEN_GRUND_WERTE.map((wert) => (
            <option key={wert} value={wert}>
              {grundLabel(wert)}
            </option>
          ))}
        </Select>
      </div>
      <Button
        type="button"
        variant="destructive"
        disabled={grund.length === 0 || view.isSubmitting}
        onClick={() => setDialogOffen(true)}
      >
        {t('stammdaten.standort.aktionen.stilllegenAction')}
      </Button>
      <ConfirmDialog
        titel={t('stammdaten.standort.aktionen.stilllegenDialogTitel')}
        beschreibung={t('stammdaten.standort.aktionen.stilllegenDialogBeschreibung')}
        bestaetigenLabel={t('stammdaten.standort.aktionen.stilllegenAction')}
        abbrechenLabel={t('stammdaten.common.abbrechen')}
        variant="destructive"
        offen={dialogOffen}
        onSchliessen={() => setDialogOffen(false)}
        onBestaetigen={() => {
          setDialogOffen(false);
          view.stilllegen({ grund });
        }}
      />
    </div>
  );
}
