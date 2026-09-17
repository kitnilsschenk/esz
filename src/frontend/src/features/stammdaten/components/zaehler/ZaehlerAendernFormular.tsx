import type { ReactNode } from 'react';
import { EntityForm, type EntityFormFieldConfig } from '../shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { zaehlerAendernFormSchema, type ZaehlerAendernFormValues } from '../../api/zaehler';
import { useZaehlerAendernView } from '../../hooks/zaehler';
import { t } from '../../../../shared/i18n/t';

export interface ZaehlerAendernFormularProps {
  readonly zaehlerId: string;
}

/**
 * Zähler-Ändern-Formular (`ADR-0008 §23 / D11 Pass 1`): vorbefüllt aus dem
 * bereits geladenen Detail (analog `SystemAendernFormular`). Rendert
 * bewusst NICHTS, solange die Vorbefüllwerte noch nicht vorliegen.
 */
export function ZaehlerAendernFormular({ zaehlerId }: ZaehlerAendernFormularProps): ReactNode {
  const view = useZaehlerAendernView(zaehlerId);

  if (!view.isReady) {
    return null;
  }

  const fields: readonly EntityFormFieldConfig[] = [
    { name: 'geraetetyp', label: t('stammdaten.zaehler.form.geraetetyp'), kind: 'text', hint: t('stammdaten.zaehler.form.geraetetypHinweis') },
  ];

  return (
    <section aria-labelledby="zaehler-aendern-heading">
      <Card>
        <CardHeader>
          <CardTitle id="zaehler-aendern-heading" as="h2">
            {t('stammdaten.zaehler.aendernSection.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EntityForm<ZaehlerAendernFormValues>
            schema={zaehlerAendernFormSchema}
            fields={fields}
            defaultValues={view.defaultValues}
            submitLabel={t('stammdaten.zaehler.aendernSection.submitAction')}
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
