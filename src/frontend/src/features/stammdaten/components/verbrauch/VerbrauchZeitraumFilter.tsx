import { useId, type ReactNode } from 'react';
import type { Aufloesung } from '@edms/shared';
import { Input } from '../../../../shared/ui/input';
import { Label } from '../../../../shared/ui/label';
import { Select } from '../../../../shared/ui/select';
import { t } from '../../../../shared/i18n/t';

export interface VerbrauchZeitraumFilterProps {
  readonly vonDatum: string;
  readonly bisDatum: string;
  readonly aufloesung: Aufloesung;
  readonly inklusiveUnterknoten: boolean;
  readonly zeitraumUngueltig: boolean;
  readonly onVonDatumChange: (datum: string) => void;
  readonly onBisDatumChange: (datum: string) => void;
  readonly onAufloesungChange: (aufloesung: Aufloesung) => void;
  readonly onInklusiveUnterknotenChange: (wert: boolean) => void;
}

const AUFLOESUNG_WERTE: readonly Aufloesung[] = ['stunde', 'tag', 'monat'];

/**
 * Zeitraum-/Auflösungswahl der Verbrauchsanzeige — Standard-UI-Elemente,
 * KEIN Diagramm-Bestandteil (`dataviz`-Skill, `interaction.md`: "Filters are
 * standard UI, not chart marks"). Bewusst OHNE Formular-Bibliothek
 * (react-hook-form ist für dieses Repo kein freigegebener Dependency-Plan,
 * s. `EntityForm.tsx`) UND ohne `EntityForm`-Submit-Semantik — dies ist ein
 * LIVE-Filter (jede Änderung löst sofort eine neue Abfrage aus), kein
 * Anlegen-Formular mit einmaligem Submit.
 *
 * Fehlermeldung (`von` nicht vor `bis`) ist per `aria-describedby` mit BEIDEN
 * Datumsfeldern verknüpft und steht in einem `aria-live`-Bereich
 * (`.claude/rules/frontend-react.md`: "Formular-Fehler: aria-live, mit
 * id-Verknüpfung zu Feldern").
 */
export function VerbrauchZeitraumFilter(props: VerbrauchZeitraumFilterProps): ReactNode {
  const {
    vonDatum,
    bisDatum,
    aufloesung,
    inklusiveUnterknoten,
    zeitraumUngueltig,
    onVonDatumChange,
    onBisDatumChange,
    onAufloesungChange,
    onInklusiveUnterknotenChange,
  } = props;
  const formId = useId();
  const vonId = `${formId}-von`;
  const bisId = `${formId}-bis`;
  const aufloesungId = `${formId}-aufloesung`;
  const inklusiveId = `${formId}-inklusive`;
  const fehlerId = `${formId}-fehler`;
  const describedBy = zeitraumUngueltig ? fehlerId : undefined;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor={vonId}>{t('stammdaten.verbrauch.filter.von')}</Label>
          <Input
            id={vonId}
            type="date"
            value={vonDatum}
            {...(zeitraumUngueltig ? { 'aria-invalid': true as const } : {})}
            {...(describedBy !== undefined ? { 'aria-describedby': describedBy } : {})}
            onChange={(event) => onVonDatumChange(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={bisId}>{t('stammdaten.verbrauch.filter.bis')}</Label>
          <Input
            id={bisId}
            type="date"
            value={bisDatum}
            {...(zeitraumUngueltig ? { 'aria-invalid': true as const } : {})}
            {...(describedBy !== undefined ? { 'aria-describedby': describedBy } : {})}
            onChange={(event) => onBisDatumChange(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={aufloesungId}>{t('stammdaten.verbrauch.filter.aufloesung')}</Label>
          <Select id={aufloesungId} value={aufloesung} onChange={(event) => onAufloesungChange(event.target.value as Aufloesung)}>
            {AUFLOESUNG_WERTE.map((wert) => (
              <option key={wert} value={wert}>
                {t(`stammdaten.common.enums.aufloesung.${wert}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <input
            id={inklusiveId}
            type="checkbox"
            checked={inklusiveUnterknoten}
            onChange={(event) => onInklusiveUnterknotenChange(event.target.checked)}
            className="h-4 w-4 rounded border-input text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <Label htmlFor={inklusiveId} className="font-normal">
            {t('stammdaten.verbrauch.filter.inklusiveUnterknoten')}
          </Label>
        </div>
      </div>
      {zeitraumUngueltig && (
        <p id={fehlerId} role="alert" aria-live="polite" className="text-xs font-medium text-destructive-text">
          {t('stammdaten.verbrauch.filter.zeitraumUngueltig')}
        </p>
      )}
    </div>
  );
}
