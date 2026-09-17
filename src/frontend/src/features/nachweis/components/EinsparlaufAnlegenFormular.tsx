import type { ReactNode } from 'react';
import { EntityForm, verketteHinweise, type EntityFormFieldConfig } from '../../stammdaten/components/shared';
import {
  einsparlaufAnlegenFormDefaultValues,
  einsparlaufAnlegenFormSchema,
  type EinsparlaufAnlegenFormValues,
} from '../api';
import { useEinsparlaufAnlegenView } from '../hooks';
import { t } from '../../../shared/i18n/t';

export interface EinsparlaufAnlegenFormularProps {
  readonly foerderjahrId: string;
  readonly preflightId: string;
  /** Steuert, ob der Förderjahr-Nachweis überhaupt zur Wahl steht (fail-closed). */
  readonly preflightIstGruen: boolean;
}

/**
 * Formular „Einspar-Lauf starten". Förderjahr und Vollständigkeitsprüfung
 * stehen bereits fest — der Lauf wird immer AUS einer Prüfung heraus
 * gestartet. Ist sie nicht bestanden, enthält die Auswahl „Art" nur noch den
 * Zwischenstand.
 */
export function EinsparlaufAnlegenFormular({
  foerderjahrId,
  preflightId,
  preflightIstGruen,
}: EinsparlaufAnlegenFormularProps): ReactNode {
  const view = useEinsparlaufAnlegenView(foerderjahrId, preflightId, preflightIstGruen);

  const artHinweis = verketteHinweise(
    t('nachweis.einsparlauf.form.artHinweis'),
    preflightIstGruen ? undefined : t('nachweis.einsparlauf.form.artHinweisGesperrt'),
  );
  const vorgaengerHinweis = verketteHinweise(
    t('nachweis.einsparlauf.form.ersetztEinsparlaufIdHinweis'),
    view.vorgaengerOptionenHinweis,
  );

  const fields: readonly EntityFormFieldConfig[] = [
    {
      name: 'art',
      label: t('nachweis.einsparlauf.form.art'),
      kind: 'select',
      placeholder: t('nachweis.einsparlauf.form.artPlatzhalter'),
      options: view.artOptionen,
      ...(artHinweis !== undefined ? { hint: artHinweis } : {}),
    },
    {
      name: 'ausloeser',
      label: t('nachweis.einsparlauf.form.ausloeser'),
      kind: 'select',
      placeholder: t('nachweis.einsparlauf.form.ausloeserPlatzhalter'),
      options: view.ausloeserOptionen,
      hint: t('nachweis.einsparlauf.form.ausloeserHinweis'),
    },
    {
      name: 'ersetztEinsparlaufId',
      label: t('nachweis.einsparlauf.form.ersetztEinsparlaufId'),
      kind: 'select',
      placeholder: t('nachweis.einsparlauf.form.ersetztEinsparlaufIdPlatzhalter'),
      options: view.vorgaengerOptionen,
      required: false,
      ...(vorgaengerHinweis !== undefined ? { hint: vorgaengerHinweis } : {}),
    },
  ];

  return (
    <EntityForm<EinsparlaufAnlegenFormValues>
      schema={einsparlaufAnlegenFormSchema}
      fields={fields}
      defaultValues={einsparlaufAnlegenFormDefaultValues}
      submitLabel={t('nachweis.einsparlauf.createPage.submitAction')}
      isSubmitting={view.isSubmitting}
      {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
      onValidSubmit={view.submit}
    />
  );
}
