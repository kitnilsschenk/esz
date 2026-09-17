import type { ReactNode } from 'react';
import { EntityForm, type EntityFormFieldConfig } from '../shared';
import { endkundeAendernFormSchema, type EndkundeAendernFormValues } from '../../api/endkunde';
import { useEndkundeAendernView } from '../../hooks/endkunde';
import { t } from '../../../../shared/i18n/t';

export interface EndkundeAendernFormularProps {
  readonly endkundeId: string;
}

/**
 * Endkunde-Ändern-Formular (Feature-Pass B). Anders als
 * System/Zähler/Messkanal (dort inline in der jeweiligen `*DetailAnsicht`)
 * lebt dieses Formular auf einer EIGENEN Route
 * (`/stammdaten/endkunden/:endkundeId/aendern`, `EndkundeAendernPage`) — PII-
 * Bearbeitung verdient eine bewusste, eigene Seite statt eines inline
 * mitlaufenden Abschnitts. Rendert bewusst NICHTS außer einem Lade-Hinweis,
 * solange die Vorbefüllwerte noch nicht vorliegen (`isReady`).
 *
 * PII-Vorbefüllung/Maskierung (DSGVO-Review-Hinweis): Ist `stammdatenPii`
 * serverseitig maskiert (`null`, D6 — z. B. ein bereits gesperrter/
 * geschredderter Endkunde), befüllt `useEndkundeAendernView` die PII-Felder
 * bewusst LEER statt mit dem `null`-Wert „zu überschreiben" — ein Submit
 * ohne erneute Eingabe würde sonst echten Klartext mit Leerstring
 * überschreiben. Der Hinweis (`view.piiMaskiert`) macht das für den Nutzer
 * sichtbar, BEVOR er das Formular ausfüllt (kein stilles Überschreiben).
 */
export function EndkundeAendernFormular({ endkundeId }: EndkundeAendernFormularProps): ReactNode {
  const view = useEndkundeAendernView(endkundeId);

  if (!view.isReady) {
    return (
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {t('stammdaten.common.laedt')}
      </p>
    );
  }

  const fields: readonly EntityFormFieldConfig[] = [
    { name: 'name', label: t('stammdaten.endkunde.form.name'), kind: 'text', autoComplete: 'name' },
    { name: 'anschrift', label: t('stammdaten.endkunde.form.anschrift'), kind: 'textarea' },
    {
      name: 'kontakt',
      label: t('stammdaten.endkunde.form.kontakt'),
      kind: 'text',
      hint: t('stammdaten.endkunde.form.kontaktHinweis'),
      required: false,
    },
    {
      name: 'endkundengruppe',
      label: t('stammdaten.endkunde.form.endkundengruppe'),
      kind: 'text',
      hint: t('stammdaten.endkunde.form.endkundengruppeHinweis'),
      required: false,
    },
  ];

  return (
    <div className="space-y-4">
      {view.piiMaskiert && (
        <p
          role="status"
          className="rounded-md border border-warning/60 bg-warning/10 px-4 py-3 text-sm text-foreground"
        >
          {t('stammdaten.endkunde.aendernPage.piiMaskiertHinweis')}
        </p>
      )}
      <EntityForm<EndkundeAendernFormValues>
        schema={endkundeAendernFormSchema}
        fields={fields}
        defaultValues={view.defaultValues}
        submitLabel={t('stammdaten.endkunde.aendernPage.submitAction')}
        isSubmitting={view.isSubmitting}
        {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
        onValidSubmit={view.submit}
      />
    </div>
  );
}
