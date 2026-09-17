import type { ReactNode } from 'react';
import { EntityForm, type EntityFormFieldConfig } from '../shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { systemAendernFormSchema, type SystemAendernFormValues } from '../../api/system';
import { useSystemAendernView } from '../../hooks/system';
import { t } from '../../../../shared/i18n/t';

export interface SystemAendernFormularProps {
  readonly systemId: string;
}

/**
 * System-Ändern-Formular (`ADR-0008 §23 / D11 Pass 1`): vorbefüllt aus dem
 * bereits geladenen Detail (`useSystemAendernView`, teilt sich den
 * TanStack-Query-Cache mit der Detail-Ansicht). Rendert bewusst NICHTS,
 * solange die Vorbefüllwerte noch nicht vorliegen (`isReady`) — die
 * umschließende `SystemDetailAnsicht` zeigt in diesem Fall bereits ihren
 * eigenen Lade-/Fehlerzustand.
 */
export function SystemAendernFormular({ systemId }: SystemAendernFormularProps): ReactNode {
  const view = useSystemAendernView(systemId);

  if (!view.isReady) {
    return null;
  }

  const fields: readonly EntityFormFieldConfig[] = [
    { name: 'bezeichnung', label: t('stammdaten.system.form.bezeichnung'), kind: 'text', hint: t('stammdaten.system.form.bezeichnungHinweis') },
    { name: 'systemgrenze', label: t('stammdaten.system.form.systemgrenze'), kind: 'textarea', hint: t('stammdaten.system.form.systemgrenzeHinweis') },
    {
      name: 'systembeschreibung',
      label: t('stammdaten.system.form.systembeschreibung'),
      kind: 'textarea',
      hint: t('stammdaten.system.form.systembeschreibungHinweis'),
      required: false,
    },
    {
      name: 'standortId',
      label: t('stammdaten.system.form.standortId'),
      kind: 'select',
      placeholder: t('stammdaten.system.form.standortIdPlatzhalter'),
      options: view.standortOptionen,
      hint: t('stammdaten.system.form.standortIdHinweis'),
      required: false,
    },
  ];

  return (
    <section aria-labelledby="system-aendern-heading">
      <Card>
        <CardHeader>
          <CardTitle id="system-aendern-heading" as="h2">
            {t('stammdaten.system.aendernSection.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EntityForm<SystemAendernFormValues>
            schema={systemAendernFormSchema}
            fields={fields}
            defaultValues={view.defaultValues}
            submitLabel={t('stammdaten.system.aendernSection.submitAction')}
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
