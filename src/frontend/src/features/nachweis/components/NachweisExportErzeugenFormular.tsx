import type { ReactNode } from 'react';
import { EntityForm, type EntityFormFieldConfig } from '../../stammdaten/components/shared';
import {
  nachweisExportErzeugenFormDefaultValues,
  nachweisExportErzeugenFormSchema,
  type NachweisExportErzeugenFormValues,
} from '../api';
import { useNachweisExportErzeugenView } from '../hooks';
import { t } from '../../../shared/i18n/t';

export interface NachweisExportErzeugenFormularProps {
  readonly einsparlaufId: string;
}

/**
 * Formular „Export erzeugen". Bewusst schmal: Es fragt nur nach dem Zweck.
 *
 * Die Darstellung der Klimastation ist nicht wählbar — sie bleibt
 * pseudonymisiert. Der Klarname setzt eine Zweitfreigabe voraus, die es noch
 * nicht gibt; ihn hier anzubieten hieße, einen ungesicherten Weg bequem zu
 * machen.
 */
export function NachweisExportErzeugenFormular({ einsparlaufId }: NachweisExportErzeugenFormularProps): ReactNode {
  const view = useNachweisExportErzeugenView(einsparlaufId);

  const fields: readonly EntityFormFieldConfig[] = [
    {
      name: 'zweck',
      label: t('nachweis.export.form.zweck'),
      kind: 'select',
      placeholder: t('nachweis.export.form.zweckPlatzhalter'),
      options: view.zweckOptionen,
      hint: t('nachweis.export.form.zweckHinweis'),
    },
  ];

  return (
    <EntityForm<NachweisExportErzeugenFormValues>
      schema={nachweisExportErzeugenFormSchema}
      fields={fields}
      defaultValues={nachweisExportErzeugenFormDefaultValues}
      submitLabel={t('nachweis.export.erzeugen.submitAction')}
      isSubmitting={view.isSubmitting}
      {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
      onValidSubmit={view.submit}
    />
  );
}
