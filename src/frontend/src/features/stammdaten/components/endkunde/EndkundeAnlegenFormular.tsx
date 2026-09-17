import type { ReactNode } from 'react';
import { EntityForm, type EntityFormFieldConfig } from '../shared';
import { endkundeFormDefaultValues, endkundeFormSchema, type EndkundeFormValues } from '../../api/endkunde';
import { useEndkundeAnlegenView } from '../../hooks/endkunde';
import { t } from '../../../../shared/i18n/t';

/**
 * Endkunde-Anlegen-Formular (`ADR-0008 §23 / D11`): Zod-validiert
 * (`endkundeFormSchema`), erzeugt einen frischen `Idempotency-Key` je Submit
 * (`useEndkundeAnlegen`, `api/shared/idempotencyKey.ts`). `consentStatus`
 * ist bewusst KEIN Formularfeld (Server-Default `fehlt`, nicht setzbar —
 * Consent-ADR).
 */
export function EndkundeAnlegenFormular(): ReactNode {
  const view = useEndkundeAnlegenView();

  const fields: readonly EntityFormFieldConfig[] = [
    { name: 'name', label: t('stammdaten.endkunde.form.name'), kind: 'text', autoComplete: 'name' },
    { name: 'anschrift', label: t('stammdaten.endkunde.form.anschrift'), kind: 'textarea' },
    {
      name: 'kontakt',
      label: t('stammdaten.endkunde.form.kontakt'),
      kind: 'text',
      hint: t('stammdaten.endkunde.form.kontaktHinweis'),
      required: false,
    },
    {
      name: 'endkundengruppe',
      label: t('stammdaten.endkunde.form.endkundengruppe'),
      kind: 'text',
      hint: t('stammdaten.endkunde.form.endkundengruppeHinweis'),
      required: false,
    },
  ];

  return (
    <EntityForm<EndkundeFormValues>
      schema={endkundeFormSchema}
      fields={fields}
      defaultValues={endkundeFormDefaultValues}
      submitLabel={t('stammdaten.endkunde.createPage.submitAction')}
      isSubmitting={view.isSubmitting}
      {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
      onValidSubmit={view.submit}
    />
  );
}
