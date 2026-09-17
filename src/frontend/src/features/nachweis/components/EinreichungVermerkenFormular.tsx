import type { ReactNode } from 'react';
import { EntityForm, type EntityFormFieldConfig } from '../../stammdaten/components/shared';
import { einreichungVermerkenFormSchema, type EinreichungVermerkenFormValues } from '../api';
import { useEinreichungVermerkenView } from '../hooks';
import { t } from '../../../shared/i18n/t';

export interface EinreichungVermerkenFormularProps {
  readonly exportId: string;
  /**
   * Aktueller Zeitpunkt als UTC-ISO-String — belegt das Feld
   * „Übermittelt am" vor. Wird hereingereicht statt hier gebildet, damit die
   * Vorbelegung im Test bestimmbar bleibt und sich nicht bei jedem Render
   * ändert.
   */
  readonly jetztIso: string;
}

/**
 * Formular „Einreichung vermerken".
 *
 * Der Wortlaut ist mit Bedacht gewählt: Vermerkt wird, was die bedienende
 * Person als übermittelt ERKLÄRT. Das System stellt nichts zu und weiß nichts
 * vom Empfang — der Empfangsbeleg ist ein eigenes, später zu füllendes Feld.
 */
export function EinreichungVermerkenFormular({ exportId, jetztIso }: EinreichungVermerkenFormularProps): ReactNode {
  const view = useEinreichungVermerkenView(exportId, jetztIso);

  const fields: readonly EntityFormFieldConfig[] = [
    {
      name: 'art',
      label: t('nachweis.einreichung.form.art'),
      kind: 'select',
      placeholder: t('nachweis.einreichung.form.artPlatzhalter'),
      options: view.artOptionen,
      hint: t('nachweis.einreichung.form.artHinweis'),
    },
    {
      name: 'uebermittlungsweg',
      label: t('nachweis.einreichung.form.uebermittlungsweg'),
      kind: 'select',
      placeholder: t('nachweis.einreichung.form.uebermittlungswegPlatzhalter'),
      options: view.uebermittlungswegOptionen,
      hint: t('nachweis.einreichung.form.uebermittlungswegHinweis'),
    },
    {
      name: 'uebermitteltAt',
      label: t('nachweis.einreichung.form.uebermitteltAt'),
      kind: 'datetime',
      hint: t('nachweis.einreichung.form.uebermitteltAtHinweis'),
    },
    {
      name: 'empfaenger',
      label: t('nachweis.einreichung.form.empfaenger'),
      kind: 'text',
      hint: t('nachweis.einreichung.form.empfaengerHinweis'),
    },
    {
      name: 'anfrageRef',
      label: t('nachweis.einreichung.form.anfrageRef'),
      kind: 'text',
      hint: t('nachweis.einreichung.form.anfrageRefHinweis'),
      required: false,
    },
    {
      name: 'belegRef',
      label: t('nachweis.einreichung.form.belegRef'),
      kind: 'text',
      hint: t('nachweis.einreichung.form.belegRefHinweis'),
      required: false,
    },
    {
      name: 'ersetztEinreichungId',
      label: t('nachweis.einreichung.form.ersetztEinreichungId'),
      kind: 'text',
      hint: t('nachweis.einreichung.form.ersetztEinreichungIdHinweis'),
      required: false,
    },
    {
      name: 'korrekturGrundCode',
      label: t('nachweis.einreichung.form.korrekturGrundCode'),
      kind: 'select',
      placeholder: t('nachweis.einreichung.form.korrekturGrundCodePlatzhalter'),
      options: view.korrekturGrundOptionen,
      hint: t('nachweis.einreichung.form.korrekturGrundCodeHinweis'),
      required: false,
    },
  ];

  return (
    <EntityForm<EinreichungVermerkenFormValues>
      schema={einreichungVermerkenFormSchema}
      fields={fields}
      defaultValues={view.defaultValues}
      submitLabel={t('nachweis.einreichung.vermerken.submitAction')}
      isSubmitting={view.isSubmitting}
      {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
      onValidSubmit={view.submit}
    />
  );
}
