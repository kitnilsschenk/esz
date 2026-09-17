import type { ReactNode } from 'react';
import { EntityForm, type EntityFormFieldConfig } from '../shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { nutzungsverhaeltnisBeendenFormSchema, type NutzungsverhaeltnisBeendenFormValues } from '../../api/nutzungsverhaeltnis';
import { useNutzungsverhaeltnisBeendenView } from '../../hooks/nutzungsverhaeltnis';
import { t } from '../../../../shared/i18n/t';

export interface NutzungsverhaeltnisBeendenFormularProps {
  readonly nutzungsverhaeltnisId: string;
}

/**
 * „Beenden"-Formular (`ADR-0008 §23 / D11 Pass 1`, PATCH mit `gueltigBis`-
 * Body). `NutzungsverhaeltnisDetailAnsicht` rendert diese Komponente nur,
 * solange das Verhältnis noch NICHT beendet ist
 * (`useNutzungsverhaeltnisDetailView().istBeendet`).
 */
export function NutzungsverhaeltnisBeendenFormular({ nutzungsverhaeltnisId }: NutzungsverhaeltnisBeendenFormularProps): ReactNode {
  const view = useNutzungsverhaeltnisBeendenView(nutzungsverhaeltnisId);

  const fields: readonly EntityFormFieldConfig[] = [
    { name: 'gueltigBis', label: t('stammdaten.nutzungsverhaeltnis.form.gueltigBis'), kind: 'date', hint: t('stammdaten.nutzungsverhaeltnis.form.gueltigBisHinweis') },
  ];

  return (
    <section aria-labelledby="nutzungsverhaeltnis-beenden-heading">
      <Card>
        <CardHeader>
          <CardTitle id="nutzungsverhaeltnis-beenden-heading" as="h2">
            {t('stammdaten.nutzungsverhaeltnis.beendenSection.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EntityForm<NutzungsverhaeltnisBeendenFormValues>
            schema={nutzungsverhaeltnisBeendenFormSchema}
            fields={fields}
            defaultValues={view.defaultValues}
            submitLabel={t('stammdaten.nutzungsverhaeltnis.beendenSection.submitAction')}
            isSubmitting={view.isSubmitting}
            {...(view.erfolgsMeldung !== undefined ? { submitSuccessMessage: view.erfolgsMeldung } : {})}
            {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
            onValidSubmit={view.submit}
          />
        </CardContent>
      </Card>
    </section>
  );
}
