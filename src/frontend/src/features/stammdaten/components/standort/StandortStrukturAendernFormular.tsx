import type { ReactNode } from 'react';
import type { StandortAendernFormValues } from '../../api/standort';
import type { StandortStruktur } from '@edms/shared';
import { EntityForm, type EntityFormFieldConfig } from '../shared';
import { useStandortStrukturAendernView } from '../../hooks/standort';
import { Button } from '../../../../shared/ui/button';
import { t } from '../../../../shared/i18n/t';

export interface StandortStrukturAendernFormularProps {
  readonly endkundeId: string;
  readonly knoten: StandortStruktur;
  readonly onAbbrechen: () => void;
}

/**
 * „Standort-Struktur ändern"-Formular (`typ`/`sortierung` NUR — NICHT
 * `status`/PII, D2.6/D5, eigene Aktionen dafür). Beide Felder werden immer
 * vorbefüllt+mitgeschickt (s. `standortAendernFormSchema.ts`).
 */
export function StandortStrukturAendernFormular({ endkundeId, knoten, onAbbrechen }: StandortStrukturAendernFormularProps): ReactNode {
  const view = useStandortStrukturAendernView(endkundeId, knoten);

  const fields: readonly EntityFormFieldConfig[] = [
    {
      name: 'typ',
      label: t('stammdaten.standort.form.typ'),
      kind: 'select',
      placeholder: t('stammdaten.standort.form.typPlatzhalter'),
      options: view.typOptionen,
    },
    { name: 'sortierung', label: t('stammdaten.standort.form.sortierung'), kind: 'text' },
    {
      name: 'klimareferenz',
      label: t('stammdaten.standort.form.klimareferenz'),
      kind: 'text',
      hint: t('stammdaten.standort.form.klimareferenzHinweis'),
    },
  ];

  return (
    <div className="space-y-4">
      <EntityForm<StandortAendernFormValues>
        schema={view.schema}
        fields={fields}
        defaultValues={view.defaultValues}
        submitLabel={t('stammdaten.standort.form.strukturSpeichernAction')}
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
