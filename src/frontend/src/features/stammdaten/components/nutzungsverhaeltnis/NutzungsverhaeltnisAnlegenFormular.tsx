import type { ReactNode } from 'react';
import { verketteHinweise, EntityForm, type EntityFormFieldConfig } from '../shared';
import {
  nutzungsverhaeltnisAnlegenFormDefaultValues,
  nutzungsverhaeltnisAnlegenFormSchema,
  type NutzungsverhaeltnisAnlegenFormValues,
} from '../../api/nutzungsverhaeltnis';
import { useNutzungsverhaeltnisAnlegenView } from '../../hooks/nutzungsverhaeltnis';
import { t } from '../../../../shared/i18n/t';

/**
 * Nutzungsverhältnis-Anlegen-Formular (`ADR-0008 §23 / D11 Pass 1`):
 * Zod-validiert, erzeugt einen frischen `Idempotency-Key` je Submit.
 * `endkundeId`/`anschlussnutzerId`/`systemId` sind Fremdschlüssel-Auswahlen,
 * `datenklasse`/`rolle` feste Enum-Auswahlen (alle `select`, Optionen aus
 * `useNutzungsverhaeltnisAnlegenView`). Referenzkonsistenz prüft
 * AUSSCHLIESSLICH der Server (400/409, problem+json → `submitErrorMessage`).
 */
export function NutzungsverhaeltnisAnlegenFormular(): ReactNode {
  const view = useNutzungsverhaeltnisAnlegenView();

  const endkundeHinweis = verketteHinweise(view.endkundeOptionenHinweis);
  const anschlussnutzerHinweis = verketteHinweise(view.anschlussnutzerOptionenHinweis);
  const systemHinweis = verketteHinweise(view.systemOptionenHinweis);

  const fields: readonly EntityFormFieldConfig[] = [
    {
      name: 'endkundeId',
      label: t('stammdaten.nutzungsverhaeltnis.form.endkundeId'),
      kind: 'select',
      placeholder: t('stammdaten.nutzungsverhaeltnis.form.endkundeIdPlatzhalter'),
      options: view.endkundeOptionen,
      ...(endkundeHinweis !== undefined ? { hint: endkundeHinweis } : {}),
    },
    {
      name: 'anschlussnutzerId',
      label: t('stammdaten.nutzungsverhaeltnis.form.anschlussnutzerId'),
      kind: 'select',
      placeholder: t('stammdaten.nutzungsverhaeltnis.form.anschlussnutzerIdPlatzhalter'),
      options: view.anschlussnutzerOptionen,
      ...(anschlussnutzerHinweis !== undefined ? { hint: anschlussnutzerHinweis } : {}),
    },
    {
      name: 'systemId',
      label: t('stammdaten.nutzungsverhaeltnis.form.systemId'),
      kind: 'select',
      placeholder: t('stammdaten.nutzungsverhaeltnis.form.systemIdPlatzhalter'),
      options: view.systemOptionen,
      ...(systemHinweis !== undefined ? { hint: systemHinweis } : {}),
    },
    {
      name: 'datenklasse',
      label: t('stammdaten.nutzungsverhaeltnis.form.datenklasse'),
      kind: 'select',
      placeholder: t('stammdaten.nutzungsverhaeltnis.form.datenklassePlatzhalter'),
      options: view.datenklasseOptionen,
      hint: t('stammdaten.nutzungsverhaeltnis.form.datenklasseHinweis'),
    },
    {
      name: 'rolle',
      label: t('stammdaten.nutzungsverhaeltnis.form.rolle'),
      kind: 'select',
      placeholder: t('stammdaten.nutzungsverhaeltnis.form.rollePlatzhalter'),
      options: view.rolleOptionen,
    },
    { name: 'gueltigVon', label: t('stammdaten.nutzungsverhaeltnis.form.gueltigVon'), kind: 'date', hint: t('stammdaten.nutzungsverhaeltnis.form.gueltigVonHinweis') },
  ];

  return (
    <EntityForm<NutzungsverhaeltnisAnlegenFormValues>
      schema={nutzungsverhaeltnisAnlegenFormSchema}
      fields={fields}
      defaultValues={nutzungsverhaeltnisAnlegenFormDefaultValues}
      submitLabel={t('stammdaten.nutzungsverhaeltnis.createPage.submitAction')}
      isSubmitting={view.isSubmitting}
      {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
      onValidSubmit={view.submit}
    />
  );
}
