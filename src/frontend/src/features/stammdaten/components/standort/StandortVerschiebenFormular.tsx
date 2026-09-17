import type { ReactNode } from 'react';
import type { StandortStruktur } from '@edms/shared';
import { standortVerschiebenFormSchema, type StandortVerschiebenFormValues } from '../../api/standort';
import { EntityForm, type EntityFormFieldConfig } from '../shared';
import { useStandortVerschiebenView } from '../../hooks/standort';
import { Button } from '../../../../shared/ui/button';
import { t } from '../../../../shared/i18n/t';

export interface StandortVerschiebenFormularProps {
  readonly endkundeId: string;
  readonly knoten: StandortStruktur;
  readonly alleKnoten: readonly StandortStruktur[];
  readonly anzeigeNameFuer: (standortId: string) => string;
  readonly onErfolg: () => void;
  readonly onAbbrechen: () => void;
}

/**
 * „Standort verschieben"-Formular (Reparent, D6). Der Server lehnt Zyklen
 * (D2.2), Tiefenlimit-Verletzungen (D2.3) und Mandanten-Fremdzugriff (D2.1)
 * ab — `useStandortVerschiebenView` übersetzt einen solchen Fehler in eine
 * verständliche deutsche Meldung (NICHT den rohen Server-Fehlertext).
 */
export function StandortVerschiebenFormular({
  endkundeId,
  knoten,
  alleKnoten,
  anzeigeNameFuer,
  onErfolg,
  onAbbrechen,
}: StandortVerschiebenFormularProps): ReactNode {
  const view = useStandortVerschiebenView(endkundeId, knoten, alleKnoten, anzeigeNameFuer, onErfolg);

  const fields: readonly EntityFormFieldConfig[] = [
    {
      name: 'neuerParentId',
      label: t('stammdaten.standort.form.verschiebenZiel'),
      kind: 'select',
      placeholder: t('stammdaten.standort.form.verschiebenZielPlatzhalter'),
      options: view.zielOptionen,
    },
  ];

  return (
    <div className="space-y-4">
      <EntityForm<StandortVerschiebenFormValues>
        schema={standortVerschiebenFormSchema}
        fields={fields}
        defaultValues={{ neuerParentId: '' }}
        submitLabel={t('stammdaten.standort.form.verschiebenAction')}
        isSubmitting={view.isSubmitting}
        {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
        onValidSubmit={view.submit}
      />
      <Button type="button" variant="outline" size="sm" onClick={onAbbrechen}>
        {t('stammdaten.common.abbrechen')}
      </Button>
    </div>
  );
}
