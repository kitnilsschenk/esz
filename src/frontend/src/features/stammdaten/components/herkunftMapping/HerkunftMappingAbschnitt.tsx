import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../../shared/ui/button';
import { Aufklapper } from '../../../../shared/ui/aufklapper';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { t } from '../../../../shared/i18n/t';
import { DataList, type DataListColumn } from '../shared/DataList';
import { EntityForm } from '../shared/EntityForm';
import { herkunftMappingFormSchema, type HerkunftMappingFormValues } from '../../api/herkunftMapping';
import {
  useHerkunftMappingAnlegenView,
  useHerkunftMappingEntfernenView,
  useHerkunftMappingListeView,
  type HerkunftMappingZeileView,
} from '../../hooks/herkunftMapping';

const LEERE_EINGABE: HerkunftMappingFormValues = {
  quelleCode: '',
  chirpstackTenantId: '',
  chirpstackApplicationId: '',
  endkundeId: '',
  standortId: '',
};

/**
 * Pflege der Herkunfts-Zuordnung (ADR-0011 B2/D3) — der Abschnitt, der aus
 * einer opaken Netzserver-Kennung eine Angabe macht, mit der man im EDMS
 * weiterkommt.
 *
 * **Was hier bewusst NICHT steht: Gebäudenamen.** Der Name eines Standorts
 * liegt feldverschlüsselt und ist personenbezogen; diese Seite ist eine
 * PII-freie Betriebsfläche. Angezeigt werden deshalb EDMS-eigene Kennungen —
 * verkürzt zur Unterscheidbarkeit, vollständig im Tooltip — plus der
 * Standort-Typ als einzige beschreibende Angabe, die ohne PII zu haben ist.
 * Wer den Namen braucht, öffnet den verlinkten Standort.
 *
 * **Warum es kein Ändern gibt.** Eine Zuordnung umzuhängen hieße, unter
 * derselben Kennung eine andere Aussage zu führen. Entfernen und neu anlegen
 * hinterlässt stattdessen zwei Protokollzeilen, aus denen der Übergang
 * hervorgeht — bei einer Tabelle, die mitentscheidet, wessen Messwerte
 * eingespeist werden, ist das die richtige Seite des Kompromisses.
 */
export function HerkunftMappingAbschnitt(): ReactNode {
  const liste = useHerkunftMappingListeView();
  const anlegen = useHerkunftMappingAnlegenView();
  const entfernen = useHerkunftMappingEntfernenView();

  const columns: readonly DataListColumn<HerkunftMappingZeileView>[] = [
    {
      key: 'tenant',
      header: t('stammdaten.herkunftMapping.tabelle.tenant'),
      render: (zeile) => (
        <code className="font-mono text-xs text-muted-foreground" title={zeile.tenantId}>
          {zeile.tenantIdKurz}
        </code>
      ),
    },
    {
      key: 'application',
      header: t('stammdaten.herkunftMapping.tabelle.application'),
      render: (zeile) => (
        <code className="font-mono text-xs text-muted-foreground" title={zeile.applicationId}>
          {zeile.applicationIdKurz}
        </code>
      ),
    },
    {
      key: 'endkunde',
      header: t('stammdaten.herkunftMapping.tabelle.endkunde'),
      render: (zeile) => (
        <Link
          to={`/stammdaten/endkunden/${zeile.endkundeId}`}
          title={zeile.endkundeId}
          className="text-link underline-offset-4 hover:underline"
        >
          {zeile.endkundeIdKurz}
        </Link>
      ),
    },
    {
      key: 'standort',
      header: t('stammdaten.herkunftMapping.tabelle.standort'),
      render: (zeile) => (
        <div className="space-y-1">
          <code className="font-mono text-xs text-muted-foreground" title={zeile.standortId}>
            {zeile.standortIdKurz}
          </code>
          <p className="text-xs text-muted-foreground">{zeile.standortTypLabel}</p>
        </div>
      ),
    },
    {
      key: 'quelle',
      header: t('stammdaten.herkunftMapping.tabelle.quelle'),
      render: (zeile) => zeile.quelleLabel,
    },
    {
      key: 'angelegt',
      header: t('stammdaten.herkunftMapping.tabelle.angelegt'),
      render: (zeile) => zeile.angelegtLabel,
    },
  ];

  return (
    <div className="space-y-4">
      <DataList<HerkunftMappingZeileView>
        caption={t('stammdaten.herkunftMapping.tabelle.caption')}
        columns={columns}
        items={liste.items}
        getRowKey={(zeile) => zeile.id}
        isPending={liste.isPending}
        isError={liste.isError}
        loadingMessage={t('stammdaten.common.laedt')}
        errorMessage={t('stammdaten.common.fehler')}
        emptyMessage={t('stammdaten.herkunftMapping.tabelle.leer')}
        actionHeader={t('stammdaten.herkunftMapping.tabelle.aktion')}
        renderRowAction={(zeile) => (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={entfernen.laufendeId !== undefined}
            aria-label={`${t('stammdaten.herkunftMapping.tabelle.entfernen')} ${zeile.applicationIdKurz}`}
            onClick={() => {
              entfernen.entfernen(zeile.id);
            }}
          >
            {entfernen.laufendeId === zeile.id
              ? t('stammdaten.herkunftMapping.tabelle.entferntLaeuft')
              : t('stammdaten.herkunftMapping.tabelle.entfernen')}
          </Button>
        )}
      />

      <StatusRegion ton="fehler" nachricht={entfernen.submitErrorMessage} />
      <StatusRegion ton="erfolg" nachricht={entfernen.erfolgsMeldung} />

      {/*
        Zugeklappt: Man kommt auf diese Seite, um zu sehen, was liegen blieb —
        und legt eine Zuordnung als Reaktion darauf an, nicht auf Vorrat.
      */}
      <Aufklapper titel={t('stammdaten.herkunftMapping.formular.titel')}>
          <EntityForm<HerkunftMappingFormValues>
            schema={herkunftMappingFormSchema}
            defaultValues={LEERE_EINGABE}
            submitLabel={t('stammdaten.herkunftMapping.formular.absenden')}
            isSubmitting={anlegen.isSubmitting}
            {...(anlegen.submitErrorMessage !== undefined ? { submitErrorMessage: anlegen.submitErrorMessage } : {})}
            {...(anlegen.erfolgsMeldung !== undefined ? { submitSuccessMessage: anlegen.erfolgsMeldung } : {})}
            onValidSubmit={anlegen.anlegen}
            fields={[
              {
                name: 'chirpstackTenantId',
                label: t('stammdaten.herkunftMapping.formular.tenant'),
                kind: 'text',
                hint: t('stammdaten.herkunftMapping.formular.tenantHinweis'),
              },
              {
                name: 'chirpstackApplicationId',
                label: t('stammdaten.herkunftMapping.formular.application'),
                kind: 'text',
                hint: t('stammdaten.herkunftMapping.formular.applicationHinweis'),
              },
              {
                name: 'endkundeId',
                label: t('stammdaten.herkunftMapping.formular.endkunde'),
                kind: 'text',
                hint: t('stammdaten.herkunftMapping.formular.endkundeHinweis'),
              },
              {
                name: 'standortId',
                label: t('stammdaten.herkunftMapping.formular.standort'),
                kind: 'text',
                hint: t('stammdaten.herkunftMapping.formular.standortHinweis'),
              },
              {
                name: 'quelleCode',
                label: t('stammdaten.herkunftMapping.formular.quelle'),
                kind: 'text',
                required: false,
                hint: t('stammdaten.herkunftMapping.formular.quelleHinweis'),
              },
            ]}
          />
      </Aufklapper>
    </div>
  );
}
