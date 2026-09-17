import type { ReactNode } from 'react';
import type { StandortAnlegenFormValues } from '../../api/standort';
import { EntityForm, type EntityFormFieldConfig } from '../shared';
import { useStandortKindAnlegenView } from '../../hooks/standort';
import { Button } from '../../../../shared/ui/button';
import { t } from '../../../../shared/i18n/t';

export interface StandortKindAnlegenFormularProps {
  readonly endkundeId: string;
  /** `null` = Wurzelknoten anlegen (D2.4: nur `liegenschaft`/`gebaeude`), sonst Kind DIESES Knotens. */
  readonly parentId: string | null;
  readonly onErfolg: (standortId: string) => void;
  readonly onAbbrechen: () => void;
}

/**
 * „Standort anlegen"-Formular — deckt sowohl Wurzel- als auch Kind-Anlage ab
 * (ADR-0010 D1/D2.4/D4). Typ-Auswahl ist bei einer Wurzel auf
 * `liegenschaft`/`gebaeude` beschränkt; bei einem Kind stehen alle 6 Typen
 * zur Wahl — D2.5 erzwingt KEINE Ebenen-Abfolge, die UI zeigt stattdessen
 * nur einen Hinweistext zur kanonischen Reihenfolge (`adresseHinweis` bzw.
 * die Hinweise unter `typ`/`adresse`).
 */
export function StandortKindAnlegenFormular({ endkundeId, parentId, onErfolg, onAbbrechen }: StandortKindAnlegenFormularProps): ReactNode {
  const view = useStandortKindAnlegenView(endkundeId, parentId, onErfolg);

  const fields: readonly EntityFormFieldConfig[] = [
    {
      name: 'typ',
      label: t('stammdaten.standort.form.typ'),
      kind: 'select',
      placeholder: t('stammdaten.standort.form.typPlatzhalter'),
      options: view.typOptionen,
      hint: t('stammdaten.standort.form.typHinweisAbfolge'),
    },
    { name: 'sortierung', label: t('stammdaten.standort.form.sortierung'), kind: 'text' },
    { name: 'bezeichnung', label: t('stammdaten.standort.form.bezeichnung'), kind: 'text' },
    {
      name: 'adresse',
      label: t('stammdaten.standort.form.adresse'),
      kind: 'textarea',
      hint: view.adresseHinweis,
      required: view.istWurzel,
    },
    {
      name: 'klimareferenz',
      label: t('stammdaten.standort.form.klimareferenz'),
      kind: 'text',
      hint: t('stammdaten.standort.form.klimareferenzHinweis'),
    },
  ];

  return (
    <div className="space-y-4">
      <EntityForm<StandortAnlegenFormValues>
        schema={view.schema}
        fields={fields}
        defaultValues={view.defaultValues}
        submitLabel={view.istWurzel ? t('stammdaten.standort.form.wurzelAnlegenAction') : t('stammdaten.standort.form.kindAnlegenAction')}
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
