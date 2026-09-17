import type { ReactNode } from 'react';
import { EntityForm, enumSelectOptions, type EntityFormFieldConfig } from '../../stammdaten/components/shared';
import {
  DEFINITION_QUELLE_WERTE,
  foerderjahrAnlegenFormDefaultValues,
  foerderjahrAnlegenFormSchema,
  type FoerderjahrAnlegenFormValues,
} from '../api';
import { definitionQuelleLabel, useFoerderjahrAnlegenView } from '../hooks';
import { t } from '../../../shared/i18n/t';

/**
 * Formular „Förderjahr anlegen" (Zod-validiert, frischer Idempotenz-Schlüssel
 * je Absenden). Ein Förderjahr ist append-only — es lässt sich später weder
 * ändern noch löschen; die Feldhinweise sagen deshalb, worauf es beim
 * Ausfüllen ankommt.
 *
 * **Die Tagesfelder sind optional und bleiben es.** Ein Förderjahr, das dem
 * Kalender folgt, braucht sie nicht; eines aus einem Bewilligungsbescheid
 * beginnt aber selten am Monatsersten, und Kap. 9.1 des Technischen
 * Merkblatts v2.2 verlangt dann die zeitanteilige Ermittlung. Sie zu
 * verlangen hiesse, jedem Kalenderjahr-Fall zwei Pflichtfelder aufzuerlegen;
 * sie wegzulassen hiesse, den Bescheid-Fall auf Monatsgrenzen zu runden.
 */
export function FoerderjahrAnlegenFormular(): ReactNode {
  const view = useFoerderjahrAnlegenView();

  const fields: readonly EntityFormFieldConfig[] = [
    {
      name: 'code',
      label: t('nachweis.foerderjahr.form.code'),
      kind: 'text',
      hint: t('nachweis.foerderjahr.form.codeHinweis'),
    },
    {
      name: 'nummer',
      label: t('nachweis.foerderjahr.form.nummer'),
      kind: 'number',
      min: 1,
      max: 20,
      step: 1,
      hint: t('nachweis.foerderjahr.form.nummerHinweis'),
    },
    {
      name: 'vonMonat',
      label: t('nachweis.foerderjahr.form.vonMonat'),
      kind: 'date',
      hint: t('nachweis.foerderjahr.form.vonMonatHinweis'),
    },
    {
      name: 'bisMonat',
      label: t('nachweis.foerderjahr.form.bisMonat'),
      kind: 'date',
      hint: t('nachweis.foerderjahr.form.bisMonatHinweis'),
    },
    // Die beiden Tagesfelder stehen DIREKT unter den Monaten, die sie
    // praezisieren — und nicht am Ende des Formulars: Wer den Zeitraum
    // eintraegt, entscheidet in diesem Moment, ob Monate genuegen.
    {
      name: 'vonTag',
      label: t('nachweis.foerderjahr.form.vonTag'),
      kind: 'date',
      hint: t('nachweis.foerderjahr.form.vonTagHinweis'),
      required: false,
    },
    {
      name: 'bisTag',
      label: t('nachweis.foerderjahr.form.bisTag'),
      kind: 'date',
      hint: t('nachweis.foerderjahr.form.bisTagHinweis'),
      required: false,
    },
    {
      name: 'definitionQuelle',
      label: t('nachweis.foerderjahr.form.definitionQuelle'),
      kind: 'select',
      placeholder: t('nachweis.foerderjahr.form.definitionQuellePlatzhalter'),
      options: enumSelectOptions(DEFINITION_QUELLE_WERTE, definitionQuelleLabel),
      hint: t('nachweis.foerderjahr.form.definitionQuelleHinweis'),
    },
    {
      name: 'vorhabenRef',
      label: t('nachweis.foerderjahr.form.vorhabenRef'),
      kind: 'text',
      hint: t('nachweis.foerderjahr.form.vorhabenRefHinweis'),
    },
    {
      name: 'bescheidRef',
      label: t('nachweis.foerderjahr.form.bescheidRef'),
      kind: 'text',
      hint: t('nachweis.foerderjahr.form.bescheidRefHinweis'),
      required: false,
    },
  ];

  return (
    <EntityForm<FoerderjahrAnlegenFormValues>
      schema={foerderjahrAnlegenFormSchema}
      fields={fields}
      defaultValues={foerderjahrAnlegenFormDefaultValues}
      submitLabel={t('nachweis.foerderjahr.createPage.submitAction')}
      isSubmitting={view.isSubmitting}
      {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
      onValidSubmit={view.submit}
    />
  );
}
