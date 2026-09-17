import type { ReactNode } from 'react';
import { verketteHinweise, EntityForm, type EntityFormFieldConfig } from '../shared';
import { zaehlerAnlegenFormDefaultValues, zaehlerAnlegenFormSchema, type ZaehlerAnlegenFormValues } from '../../api/zaehler';
import { useZaehlerAnlegenView } from '../../hooks/zaehler';
import { t } from '../../../../shared/i18n/t';

/**
 * Zähler-Anlegen-Formular (`ADR-0008 §23 / D11 Pass 1`): Zod-validiert
 * (`zaehlerAnlegenFormSchema`), erzeugt einen frischen `Idempotency-Key` je
 * Submit (`useZaehlerAnlegen`). `systemId` ist eine Fremdschlüssel-Auswahl,
 * `energietraeger` eine feste Enum-Auswahl (beide `select`, Optionen aus
 * `useZaehlerAnlegenView`). KEIN `geraeteReferenz`-Feld (§12, Backend-DTO).
 */
export function ZaehlerAnlegenFormular(): ReactNode {
  const view = useZaehlerAnlegenView();

  const systemHinweis = verketteHinweise(t('stammdaten.zaehler.form.systemIdHinweis'), view.systemOptionenHinweis);

  const fields: readonly EntityFormFieldConfig[] = [
    {
      name: 'systemId',
      label: t('stammdaten.zaehler.form.systemId'),
      kind: 'select',
      placeholder: t('stammdaten.zaehler.form.systemIdPlatzhalter'),
      options: view.systemOptionen,
      ...(systemHinweis !== undefined ? { hint: systemHinweis } : {}),
    },
    { name: 'geraetetyp', label: t('stammdaten.zaehler.form.geraetetyp'), kind: 'text', hint: t('stammdaten.zaehler.form.geraetetypHinweis') },
    {
      name: 'energietraeger',
      label: t('stammdaten.zaehler.form.energietraeger'),
      kind: 'select',
      placeholder: t('stammdaten.zaehler.form.energietraegerPlatzhalter'),
      options: view.energietraegerOptionen,
      hint: t('stammdaten.zaehler.form.energietraegerHinweis'),
    },
  ];

  return (
    <EntityForm<ZaehlerAnlegenFormValues>
      schema={zaehlerAnlegenFormSchema}
      fields={fields}
      defaultValues={zaehlerAnlegenFormDefaultValues}
      submitLabel={t('stammdaten.zaehler.createPage.submitAction')}
      isSubmitting={view.isSubmitting}
      {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
      onValidSubmit={view.submit}
    />
  );
}
