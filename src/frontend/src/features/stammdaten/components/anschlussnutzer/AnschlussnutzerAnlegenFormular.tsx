import type { ReactNode } from 'react';
import { verketteHinweise, EntityForm, type EntityFormFieldConfig } from '../shared';
import {
  anschlussnutzerFormDefaultValues,
  anschlussnutzerFormSchema,
  type AnschlussnutzerFormValues,
} from '../../api/anschlussnutzer';
import { useAnschlussnutzerAnlegenView } from '../../hooks/anschlussnutzer';
import { t } from '../../../../shared/i18n/t';

/**
 * Anschlussnutzer-Anlegen-Formular (`ADR-0008 §23 / D11 Phase 4c Pass 2`,
 * Muster = `EndkundeAnlegenFormular`): Zod-validiert
 * (`anschlussnutzerFormSchema`), erzeugt einen frischen `Idempotency-Key` je
 * Submit. `endkundeId` ist eine Fremdschlüssel-Auswahl (`select`, analog
 * `SystemAnlegenFormular`) — Referenzkonsistenz prüft ausschließlich der
 * Server.
 */
export function AnschlussnutzerAnlegenFormular(): ReactNode {
  const view = useAnschlussnutzerAnlegenView();

  const endkundeHinweis = verketteHinweise(view.endkundeOptionenHinweis);

  const fields: readonly EntityFormFieldConfig[] = [
    {
      name: 'endkundeId',
      label: t('stammdaten.anschlussnutzer.form.endkundeId'),
      kind: 'select',
      placeholder: t('stammdaten.anschlussnutzer.form.endkundeIdPlatzhalter'),
      options: view.endkundeOptionen,
      ...(endkundeHinweis !== undefined ? { hint: endkundeHinweis } : {}),
    },
    { name: 'name', label: t('stammdaten.anschlussnutzer.form.name'), kind: 'text', autoComplete: 'name' },
    {
      name: 'kontakt',
      label: t('stammdaten.anschlussnutzer.form.kontakt'),
      kind: 'text',
      hint: t('stammdaten.anschlussnutzer.form.kontaktHinweis'),
      required: false,
    },
  ];

  return (
    <EntityForm<AnschlussnutzerFormValues>
      schema={anschlussnutzerFormSchema}
      fields={fields}
      defaultValues={anschlussnutzerFormDefaultValues}
      submitLabel={t('stammdaten.anschlussnutzer.createPage.submitAction')}
      isSubmitting={view.isSubmitting}
      {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
      onValidSubmit={view.submit}
    />
  );
}
