import type { ReactNode } from 'react';
import { EntityForm, type EntityFormFieldConfig } from '../shared';
import {
  messkanalAnlegenFormDefaultValues,
  messkanalAnlegenFormSchema,
  type MesskanalAnlegenFormValues,
} from '../../api/messkanal';
import { useMesskanalAnlegenView } from '../../hooks/messkanal';
import { t } from '../../../../shared/i18n/t';

export interface MesskanalAnlegenFormularProps {
  readonly zaehlerId: string;
}

/**
 * Messkanal-Anlegen-Formular (`ADR-0008 §23 / D11 Pass 1`, Sub-Ressource
 * EINES Zählers): Zod-validiert (`messkanalAnlegenFormSchema`), erzeugt
 * einen frischen `Idempotency-Key` je Submit. `zaehlerId` kommt aus der
 * Route (`useMesskanalAnlegenView(zaehlerId)`), ist KEIN Formularfeld.
 */
export function MesskanalAnlegenFormular({ zaehlerId }: MesskanalAnlegenFormularProps): ReactNode {
  const view = useMesskanalAnlegenView(zaehlerId);

  const fields: readonly EntityFormFieldConfig[] = [
    { name: 'messgroesse', label: t('stammdaten.messkanal.form.messgroesse'), kind: 'text', hint: t('stammdaten.messkanal.form.messgroesseHinweis') },
    { name: 'einheit', label: t('stammdaten.messkanal.form.einheit'), kind: 'text', hint: t('stammdaten.messkanal.form.einheitHinweis') },
    {
      name: 'art',
      label: t('stammdaten.messkanal.form.art'),
      kind: 'select',
      placeholder: t('stammdaten.messkanal.form.artPlatzhalter'),
      options: view.artOptionen,
      hint: t('stammdaten.messkanal.form.artHinweis'),
    },
    {
      name: 'richtung',
      label: t('stammdaten.messkanal.form.richtung'),
      kind: 'select',
      options: view.richtungOptionen,
      hint: t('stammdaten.messkanal.form.richtungHinweis'),
    },
    {
      name: 'istUntermessung',
      label: t('stammdaten.messkanal.form.istUntermessung'),
      kind: 'checkbox',
      hint: t('stammdaten.messkanal.form.istUntermessungHinweis'),
    },
    {
      name: 'obisKennzahl',
      label: t('stammdaten.messkanal.form.obisKennzahl'),
      kind: 'text',
      hint: t('stammdaten.messkanal.form.obisKennzahlHinweis'),
      required: false,
    },
  ];

  return (
    <EntityForm<MesskanalAnlegenFormValues>
      schema={messkanalAnlegenFormSchema}
      fields={fields}
      defaultValues={messkanalAnlegenFormDefaultValues}
      submitLabel={t('stammdaten.messkanal.createPage.submitAction')}
      isSubmitting={view.isSubmitting}
      {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
      onValidSubmit={view.submit}
    />
  );
}
