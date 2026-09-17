import type { ReactNode } from 'react';
import { EntityForm, type EntityFormFieldConfig } from '../shared';
import { useEinflussgroesseKorrigierenView } from '../../hooks/einflussgroesse';
import type { EinflussgroesseKorrigierenFormValues, EinflussWertArt } from '../../api/einflussgroesse';
import { t } from '../../../../shared/i18n/t';

export interface EinflussgroesseKorrigierenFormularProps {
  readonly einflussgroesseId: string;
  readonly systemId: string;
  /** Bekannt, wenn die Aufruferin über `EinflussgroesseTabelle`s `?groesseCode=`-Link navigiert ist (s. `EinflussgroesseKorrigierenPage`). */
  readonly wertArt: EinflussWertArt | undefined;
}

/**
 * Einflussgröße-Korrigieren-Formular (`PATCH
 * .../einflussgroessen/{einflussgroesseId}`, `update:einflussgroesse`).
 * Schließt IMMER das adressierte Intervall (`gueltigBisMonat`); die
 * `korrektur*`-Felder legen ZUSÄTZLICH eine neue Zeile an — ausgelöst durch
 * `korrekturGueltigAbMonat` (dessen Label das explizit macht), s.
 * `einflussgroesseKorrigierenFormSchema.ts`s Kopf-Kommentar für die
 * Design-Begründung (EIN flaches `EntityForm`, kein dynamisches Ein-/
 * Ausblenden).
 */
export function EinflussgroesseKorrigierenFormular({ einflussgroesseId, systemId, wertArt }: EinflussgroesseKorrigierenFormularProps): ReactNode {
  const view = useEinflussgroesseKorrigierenView(einflussgroesseId, systemId, wertArt);

  const fields: readonly EntityFormFieldConfig[] = [
    {
      name: 'gueltigBisMonat',
      label: t('stammdaten.einflussgroesse.form.gueltigBisMonatSchliessen'),
      kind: 'date',
      hint: t('stammdaten.einflussgroesse.form.gueltigAbMonatHinweis'),
    },
    {
      name: 'korrekturGueltigAbMonat',
      label: t('stammdaten.einflussgroesse.form.korrekturGueltigAbMonat'),
      kind: 'date',
      required: false,
      hint: t('stammdaten.einflussgroesse.form.korrekturHinweis'),
    },
    {
      name: 'korrekturWertNum',
      label: t('stammdaten.einflussgroesse.form.korrekturWertNum'),
      kind: 'text',
      required: false,
      hint: t('stammdaten.einflussgroesse.form.wertNumHinweis'),
    },
    {
      name: 'korrekturWertCode',
      label: t('stammdaten.einflussgroesse.form.korrekturWertCode'),
      kind: 'text',
      required: false,
      hint: t('stammdaten.einflussgroesse.form.wertCodeHinweis'),
    },
    {
      name: 'korrekturGueltigBisMonat',
      label: t('stammdaten.einflussgroesse.form.korrekturGueltigBisMonat'),
      kind: 'date',
      required: false,
      hint: t('stammdaten.einflussgroesse.form.gueltigBisMonatHinweis'),
    },
    {
      name: 'korrekturBetroffenerTyp',
      label: t('stammdaten.einflussgroesse.form.korrekturBetroffenerTyp'),
      kind: 'select',
      placeholder: t('stammdaten.einflussgroesse.form.betroffenerTypPlatzhalter'),
      options: view.betroffenerTypOptionen,
      required: false,
    },
    {
      name: 'korrekturQuelleTyp',
      label: t('stammdaten.einflussgroesse.form.korrekturQuelleTyp'),
      kind: 'select',
      placeholder: t('stammdaten.einflussgroesse.form.quelleTypPlatzhalter'),
      options: view.quelleTypOptionen,
      required: false,
    },
    {
      name: 'korrekturRechtsgrundlage',
      label: t('stammdaten.einflussgroesse.form.korrekturRechtsgrundlage'),
      kind: 'select',
      placeholder: t('stammdaten.einflussgroesse.form.rechtsgrundlagePlatzhalter'),
      options: view.rechtsgrundlageOptionen,
      required: false,
    },
    {
      name: 'korrekturAbwaegungRef',
      label: t('stammdaten.einflussgroesse.form.korrekturAbwaegungRef'),
      kind: 'text',
      required: false,
      hint: t('stammdaten.einflussgroesse.form.abwaegungRefHinweis'),
    },
    {
      name: 'korrekturArt14InformationAt',
      label: t('stammdaten.einflussgroesse.form.korrekturArt14InformationAt'),
      kind: 'date',
      required: false,
      hint: t('stammdaten.einflussgroesse.form.art14InformationAtHinweis'),
    },
    {
      name: 'korrekturStandortId',
      label: t('stammdaten.einflussgroesse.form.korrekturStandortId'),
      kind: 'text',
      required: false,
      hint: t('stammdaten.einflussgroesse.form.standortIdHinweis'),
    },
  ];

  return (
    <EntityForm<EinflussgroesseKorrigierenFormValues>
      schema={view.schema}
      fields={fields}
      defaultValues={view.defaultValues}
      submitLabel={t('stammdaten.einflussgroesse.korrigierenSection.submitAction')}
      isSubmitting={view.isSubmitting}
      {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
      onValidSubmit={view.submit}
    />
  );
}
