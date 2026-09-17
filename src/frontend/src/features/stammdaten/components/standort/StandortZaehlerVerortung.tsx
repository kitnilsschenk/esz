import type { ReactNode } from 'react';
import type { ZaehlerUnterKnotenItem } from '@edms/shared';
import {
  zaehlerVerortungAnlegenFormSchema,
  zaehlerVerortungBeendenFormSchema,
  type ZaehlerVerortungAnlegenFormValues,
  type ZaehlerVerortungBeendenFormValues,
} from '../../api/standort';
import { useStandortZaehlerView } from '../../hooks/standort';
import { DataList, EntityForm, kurzId, type DataListColumn, type EntityFormFieldConfig } from '../shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { t } from '../../../../shared/i18n/t';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';

export interface StandortZaehlerVerortungProps {
  readonly standortId: string;
}

const anlegenFields: readonly EntityFormFieldConfig[] = [
  { name: 'zaehlerId', label: t('stammdaten.standort.zaehler.form.zaehlerId'), kind: 'text' },
  { name: 'gueltigVon', label: t('stammdaten.standort.zaehler.form.gueltigVon'), kind: 'date' },
];

const beendenFields: readonly EntityFormFieldConfig[] = [
  { name: 'zaehlerId', label: t('stammdaten.standort.zaehler.form.zaehlerId'), kind: 'text' },
  { name: 'gueltigBis', label: t('stammdaten.standort.zaehler.form.gueltigBis'), kind: 'date' },
];

/**
 * Zähler-Verortung EINES Standort-Knotens (D3) — zeigt die aktuell
 * verorteten Zähler (Kern-Query D6, PII-frei), ein „Verorten"-Formular
 * (öffnet automatisch eine neue Zeitscheibe UND schließt — sofern
 * vorhanden — die offene Vorgänger-Verortung dieses Zählers atomar, D3
 * "Umsetzen") sowie ein „Verortung beenden"-Formular. Der `verlauf`-
 * Abschnitt stellt beide Aktionen DIESER Sitzung als Ereignis-Liste dar
 * ("Zähler X wurde hier zugeordnet/die Verortung wurde beendet, jeweils
 * zum Zeitpunkt Y") — NICHT als stilles Überschreiben eines einzelnen
 * "aktueller Standort"-Felds (s. `useStandortZaehlerView`-Klassen-Dok für
 * die Begründung, warum dies KEINE vollständige, persistente Historie ist).
 */
export function StandortZaehlerVerortung({ standortId }: StandortZaehlerVerortungProps): ReactNode {
  const view = useStandortZaehlerView(standortId);

  const columns: readonly DataListColumn<ZaehlerUnterKnotenItem>[] = [
    { key: 'id', header: t('stammdaten.standort.zaehler.tabelle.id'), render: (item) => kurzId(item.id) },
    { key: 'geraetetyp', header: t('stammdaten.standort.zaehler.tabelle.geraetetyp'), render: (item) => item.geraetetyp },
    {
      key: 'energietraeger',
      header: t('stammdaten.standort.zaehler.tabelle.energietraeger'),
      render: (item) => t(`stammdaten.common.enums.energietraeger.${item.energietraeger}`),
    },
    {
      key: 'status',
      header: t('stammdaten.standort.zaehler.tabelle.status'),
      render: (item) => t(`stammdaten.common.enums.betriebsStatus.${item.status}`),
    },
  ];

  return (
    <div className="space-y-4">
      <DataList<ZaehlerUnterKnotenItem>
        caption={t('stammdaten.standort.zaehler.tabelle.caption')}
        columns={columns}
        items={view.zaehler}
        getRowKey={(item) => item.id}
        isPending={view.isPending}
        isError={view.isError}
        loadingMessage={t('stammdaten.common.laedt')}
        errorMessage={view.errorMessage ?? t('stammdaten.common.fehler')}
        emptyMessage={t('stammdaten.standort.zaehler.tabelle.leer')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h3">{t('stammdaten.standort.zaehler.verortenSectionTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <EntityForm<ZaehlerVerortungAnlegenFormValues>
              schema={zaehlerVerortungAnlegenFormSchema}
              fields={anlegenFields}
              defaultValues={{ zaehlerId: '', gueltigVon: '' }}
              submitLabel={t('stammdaten.standort.zaehler.verortenAction')}
              isSubmitting={view.anlegenIsSubmitting}
              {...(view.anlegenSubmitErrorMessage !== undefined ? { submitErrorMessage: view.anlegenSubmitErrorMessage } : {})}
              onValidSubmit={view.anlegenSubmit}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h3">{t('stammdaten.standort.zaehler.beendenSectionTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <EntityForm<ZaehlerVerortungBeendenFormValues>
              schema={zaehlerVerortungBeendenFormSchema}
              fields={beendenFields}
              defaultValues={{ zaehlerId: '', gueltigBis: '' }}
              submitLabel={t('stammdaten.standort.zaehler.beendenAction')}
              isSubmitting={view.beendenIsSubmitting}
              {...(view.beendenSubmitErrorMessage !== undefined ? { submitErrorMessage: view.beendenSubmitErrorMessage } : {})}
              onValidSubmit={view.beendenSubmit}
            />
          </CardContent>
        </Card>
      </div>
      {view.verlauf.length > 0 && (
        <section aria-labelledby="standort-zaehler-verlauf-heading">
          <h3 id="standort-zaehler-verlauf-heading" className="text-sm font-bold text-foreground">
            {t('stammdaten.standort.zaehler.verlaufSectionTitle')}
          </h3>
          <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
            {view.verlauf.map((eintrag, index) => (
              // Index als Key: `verlauf` ist ein reiner, nur wachsender
              // Anzeige-Log dieser Sitzung ohne stabile fachliche Id je
              // Eintrag (kein `eslint-plugin-react` in diesem Repo, das
              // dies ohnehin flaggen würde — s. `eslint.config.mjs`).
              <li key={index}>
                {eintrag.typ === 'zugeordnet'
                  ? t('stammdaten.standort.zaehler.verlaufZugeordnetPraefix')
                  : t('stammdaten.standort.zaehler.verlaufBeendetPraefix')}{' '}
                {kurzId(eintrag.zaehlerId)} — {formatiereZeitpunkt(eintrag.zeitpunkt)}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
