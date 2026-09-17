import type { ReactNode } from 'react';
import type { StandortStruktur } from '@edms/shared';
import type { StandortPiiAendernFormValues } from '../../api/standort';
import { EntityForm, type EntityFormFieldConfig } from '../shared';
import { useStandortPiiAendernView } from '../../hooks/standort';
import { Button } from '../../../../shared/ui/button';
import { t } from '../../../../shared/i18n/t';

export interface StandortPiiAendernFormularProps {
  readonly endkundeId: string;
  readonly knoten: StandortStruktur;
  readonly aktuelleBezeichnung: string;
  readonly aktuelleAnschrift: string | null;
  readonly onErfolg: () => void;
  readonly onAbbrechen: () => void;
}

/**
 * „Standort-Label/Adresse ändern"-Formular (Vollersatz, D4/D5). `geo` wird
 * NIE vorbefüllt (keine Lesestufe liefert ihn zurück) — der Warnhinweis
 * macht sichtbar, dass ein leer gelassenes Geo-Feld eine ggf. hinterlegte
 * Angabe LÖSCHT (analog `EndkundeAendernFormular`s `piiMaskiertHinweis`).
 */
export function StandortPiiAendernFormular({
  endkundeId,
  knoten,
  aktuelleBezeichnung,
  aktuelleAnschrift,
  onErfolg,
  onAbbrechen,
}: StandortPiiAendernFormularProps): ReactNode {
  const view = useStandortPiiAendernView(endkundeId, knoten, aktuelleBezeichnung, aktuelleAnschrift, onErfolg);
  const istWurzel = knoten.parentId === null;

  const fields: readonly EntityFormFieldConfig[] = [
    { name: 'bezeichnung', label: t('stammdaten.standort.form.bezeichnung'), kind: 'text' },
    {
      name: 'adresse',
      label: t('stammdaten.standort.form.adresse'),
      kind: 'textarea',
      required: istWurzel,
      hint: istWurzel ? t('stammdaten.standort.form.adresseHinweisWurzel') : t('stammdaten.standort.form.adresseHinweisKind'),
    },
    {
      name: 'geo',
      label: t('stammdaten.standort.form.geo'),
      kind: 'text',
      required: false,
      hint: t('stammdaten.standort.form.geoHinweisVollersatz'),
    },
  ];

  return (
    <div className="space-y-4">
      <EntityForm<StandortPiiAendernFormValues>
        schema={view.schema}
        fields={fields}
        defaultValues={view.defaultValues}
        submitLabel={t('stammdaten.standort.form.piiSpeichernAction')}
        isSubmitting={view.isSubmitting}
        {...(view.erfolgsMeldung !== undefined ? { submitSuccessMessage: view.erfolgsMeldung } : {})}
        {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
        onValidSubmit={view.submit}
      />
      <Button type="button" variant="outline" size="sm" onClick={onAbbrechen}>
        {t('stammdaten.common.abbrechen')}
      </Button>
    </div>
  );
}
