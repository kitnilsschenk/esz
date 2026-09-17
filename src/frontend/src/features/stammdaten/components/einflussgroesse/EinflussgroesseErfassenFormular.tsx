import type { ReactNode } from 'react';
import { EntityForm, type EntityFormFieldConfig } from '../shared';
import { useEinflussgroesseErfassenView } from '../../hooks/einflussgroesse';
import type { EinflussgroesseErfassenFormValues } from '../../api/einflussgroesse';
import { t } from '../../../../shared/i18n/t';

export interface EinflussgroesseErfassenFormularProps {
  readonly systemId: string;
}

/**
 * Einflussgröße-Erfassen-Formular (`POST
 * .../systeme/{systemId}/einflussgroessen`, `create:einflussgroesse`).
 * ALLE Felder bleiben immer sichtbar (`EntityForm` kennt kein dynamisches
 * Ein-/Ausblenden je Auswahl) — die `wert_art`-XOR-Regel (Größe →
 * `wertNum` XOR `wertCode`) UND die Art.-14-Bedingung (Anschlussnutzer als
 * betroffene Person) laufen über `einflussgroesseErfassenFormSchema`s
 * `superRefine` + erklärende `hint`-Texte je Feld (analog
 * `standortAnlegenFormSchema`/`standortPiiAendernFormSchema` — dort ist
 * dasselbe Muster für die `typ`-abhängige `adresse`-Pflicht etabliert).
 */
export function EinflussgroesseErfassenFormular({ systemId }: EinflussgroesseErfassenFormularProps): ReactNode {
  const view = useEinflussgroesseErfassenView(systemId);

  const fields: readonly EntityFormFieldConfig[] = [
    {
      name: 'groesseCode',
      label: t('stammdaten.einflussgroesse.form.groesseCode'),
      kind: 'select',
      placeholder: t('stammdaten.einflussgroesse.form.groesseCodePlatzhalter'),
      options: view.groesseCodeOptionen,
    },
    {
      name: 'wertNum',
      label: t('stammdaten.einflussgroesse.form.wertNum'),
      kind: 'text',
      required: false,
      hint: t('stammdaten.einflussgroesse.form.wertNumHinweis'),
    },
    {
      name: 'wertCode',
      label: t('stammdaten.einflussgroesse.form.wertCode'),
      kind: 'text',
      required: false,
      hint: t('stammdaten.einflussgroesse.form.wertCodeHinweis'),
    },
    {
      name: 'gueltigAbMonat',
      label: t('stammdaten.einflussgroesse.form.gueltigAbMonat'),
      kind: 'date',
      hint: t('stammdaten.einflussgroesse.form.gueltigAbMonatHinweis'),
    },
    {
      name: 'gueltigBisMonat',
      label: t('stammdaten.einflussgroesse.form.gueltigBisMonat'),
      kind: 'date',
      required: false,
      hint: t('stammdaten.einflussgroesse.form.gueltigBisMonatHinweis'),
    },
    {
      name: 'betroffenerTyp',
      label: t('stammdaten.einflussgroesse.form.betroffenerTyp'),
      kind: 'select',
      placeholder: t('stammdaten.einflussgroesse.form.betroffenerTypPlatzhalter'),
      options: view.betroffenerTypOptionen,
    },
    {
      name: 'quelleTyp',
      label: t('stammdaten.einflussgroesse.form.quelleTyp'),
      kind: 'select',
      placeholder: t('stammdaten.einflussgroesse.form.quelleTypPlatzhalter'),
      options: view.quelleTypOptionen,
    },
    {
      name: 'rechtsgrundlage',
      label: t('stammdaten.einflussgroesse.form.rechtsgrundlage'),
      kind: 'select',
      placeholder: t('stammdaten.einflussgroesse.form.rechtsgrundlagePlatzhalter'),
      options: view.rechtsgrundlageOptionen,
    },
    {
      name: 'abwaegungRef',
      label: t('stammdaten.einflussgroesse.form.abwaegungRef'),
      kind: 'text',
      required: false,
      hint: t('stammdaten.einflussgroesse.form.abwaegungRefHinweis'),
    },
    {
      name: 'art14InformationAt',
      label: t('stammdaten.einflussgroesse.form.art14InformationAt'),
      kind: 'date',
      required: false,
      hint: t('stammdaten.einflussgroesse.form.art14InformationAtHinweis'),
    },
    {
      name: 'standortId',
      label: t('stammdaten.einflussgroesse.form.standortId'),
      kind: 'text',
      required: false,
      hint: t('stammdaten.einflussgroesse.form.standortIdHinweis'),
    },
    {
      name: 'anlassCode',
      label: t('stammdaten.einflussgroesse.form.anlassCode'),
      kind: 'select',
      placeholder: t('stammdaten.einflussgroesse.form.anlassCodePlatzhalter'),
      options: view.anlassCodeOptionen,
      required: false,
    },
  ];

  return (
    <EntityForm<EinflussgroesseErfassenFormValues>
      schema={view.schema}
      fields={fields}
      defaultValues={view.defaultValues}
      submitLabel={t('stammdaten.einflussgroesse.createPage.submitAction')}
      isSubmitting={view.isSubmitting}
      {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
      onValidSubmit={view.submit}
    />
  );
}
