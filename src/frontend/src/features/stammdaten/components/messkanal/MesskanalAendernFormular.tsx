import type { ReactNode } from 'react';
import { EntityForm, type EntityFormFieldConfig } from '../shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { messkanalAendernFormSchema, type MesskanalAendernFormValues } from '../../api/messkanal';
import { useMesskanalAendernView } from '../../hooks/messkanal';
import { t } from '../../../../shared/i18n/t';

export interface MesskanalAendernFormularProps {
  readonly messkanalId: string;
}

/**
 * Messkanal-Ändern-Formular (`ADR-0008 §23 / D11 Pass 1`): vorbefüllt aus
 * dem bereits geladenen Detail (analog `ZaehlerAendernFormular`). Rendert
 * bewusst NICHTS, solange die Vorbefüllwerte noch nicht vorliegen.
 */
export function MesskanalAendernFormular({ messkanalId }: MesskanalAendernFormularProps): ReactNode {
  const view = useMesskanalAendernView(messkanalId);

  if (!view.isReady) {
    return null;
  }

  const fields: readonly EntityFormFieldConfig[] = [
    { name: 'einheit', label: t('stammdaten.messkanal.form.einheit'), kind: 'text', hint: t('stammdaten.messkanal.form.einheitHinweis') },
    {
      name: 'richtung',
      label: t('stammdaten.messkanal.form.richtung'),
      kind: 'select',
      options: view.richtungOptionen,
      hint: t('stammdaten.messkanal.form.richtungHinweis'),
    },
    {
      name: 'istUntermessung',
      label: t('stammdaten.messkanal.form.istUntermessung'),
      kind: 'checkbox',
      hint: t('stammdaten.messkanal.form.istUntermessungHinweis'),
    },
    {
      name: 'obisKennzahl',
      label: t('stammdaten.messkanal.form.obisKennzahl'),
      kind: 'text',
      hint: t('stammdaten.messkanal.form.obisKennzahlHinweis'),
      required: false,
    },
  ];

  return (
    <section aria-labelledby="messkanal-aendern-heading">
      <Card>
        <CardHeader>
          <CardTitle id="messkanal-aendern-heading" as="h2">
            {t('stammdaten.messkanal.aendernSection.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EntityForm<MesskanalAendernFormValues>
            schema={messkanalAendernFormSchema}
            fields={fields}
            defaultValues={view.defaultValues}
            submitLabel={t('stammdaten.messkanal.aendernSection.submitAction')}
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
