import type { ReactNode } from 'react';
import { verketteHinweise, EntityForm, type EntityFormFieldConfig } from '../shared';
import { systemAnlegenFormDefaultValues, systemAnlegenFormSchema, type SystemAnlegenFormValues } from '../../api/system';
import { useSystemAnlegenView } from '../../hooks/system';
import { t } from '../../../../shared/i18n/t';

/**
 * System-Anlegen-Formular (`ADR-0008 §23 / D11 Pass 1`): Zod-validiert
 * (`systemAnlegenFormSchema`), erzeugt einen frischen `Idempotency-Key` je
 * Submit (`useSystemAnlegen`). `endkundeId` ist eine Fremdschlüssel-Auswahl
 * (`select`, Optionen aus `useSystemAnlegenView`s Endkunden-Liste) —
 * Referenzkonsistenz prüft ausschließlich der Server.
 */
export function SystemAnlegenFormular(): ReactNode {
  const view = useSystemAnlegenView();

  const endkundeHinweis = verketteHinweise(view.endkundeOptionenHinweis);

  const fields: readonly EntityFormFieldConfig[] = [
    {
      name: 'endkundeId',
      label: t('stammdaten.system.form.endkundeId'),
      kind: 'select',
      placeholder: t('stammdaten.system.form.endkundeIdPlatzhalter'),
      options: view.endkundeOptionen,
      ...(endkundeHinweis !== undefined ? { hint: endkundeHinweis } : {}),
    },
    { name: 'bezeichnung', label: t('stammdaten.system.form.bezeichnung'), kind: 'text', hint: t('stammdaten.system.form.bezeichnungHinweis') },
    { name: 'systemgrenze', label: t('stammdaten.system.form.systemgrenze'), kind: 'textarea', hint: t('stammdaten.system.form.systemgrenzeHinweis') },
    {
      name: 'systembeschreibung',
      label: t('stammdaten.system.form.systembeschreibung'),
      kind: 'textarea',
      hint: t('stammdaten.system.form.systembeschreibungHinweis'),
      required: false,
    },
  ];

  return (
    <EntityForm<SystemAnlegenFormValues>
      schema={systemAnlegenFormSchema}
      fields={fields}
      defaultValues={systemAnlegenFormDefaultValues}
      submitLabel={t('stammdaten.system.createPage.submitAction')}
      isSubmitting={view.isSubmitting}
      {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
      onValidSubmit={view.submit}
    />
  );
}
