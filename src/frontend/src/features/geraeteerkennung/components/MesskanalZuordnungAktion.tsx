import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { StatusRegion } from '../../../shared/ui/status-region';
import { t } from '../../../shared/i18n/t';
import { EntityForm } from '../../stammdaten/components/shared';
import { zuordnungFormDefaultValues, zuordnungFormSchema } from '../api';
import { useMesskanalZuordnungView } from '../hooks/useMesskanalZuordnungView';

export interface MesskanalZuordnungAktionProps {
  readonly messkanalId: string;
}

/**
 * „Diesen Messkanal einer Gerätegruppe zuordnen" (TB-05, [Q3] Kap. 5).
 *
 * **Die Aktion sitzt hier und nicht beim Endkunden**, weil der Messkanal an
 * dieser Stelle bereits im Kontext ist. Auf der Endkundenseite müsste ihn
 * jemand aus einer Liste von Pseudonym-IDs heraussuchen.
 *
 * Es gibt bewusst KEIN „Ändern": Eine bestehende Zuordnung wird beendet und
 * eine neue angelegt (am Endkunden), sonst verschöbe sich rückwirkend die
 * Quote der Vergangenheit.
 */
export function MesskanalZuordnungAktion({ messkanalId }: MesskanalZuordnungAktionProps): ReactNode {
  const view = useMesskanalZuordnungView(messkanalId);

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('geraeteerkennung.zuordnenForm.titel')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('geraeteerkennung.zuordnenForm.beschreibung')}</p>
        {/*
          Die Untermessung wird hier NICHT abgefragt: Sie steht am Messkanal
          („Ändern"-Abschnitt dieser Seite) und wird von dort übernommen. Zwei
          Eingabestellen für dieselbe Aussage hiessen, dass irgendwann eine von
          beiden falsch ist — und die Einsparberechnung liest nur die eine.
        */}
        <p className="text-sm text-muted-foreground">{t('geraeteerkennung.zuordnenForm.untermessungHerkunft')}</p>

        {view.isPending && <p className="text-sm text-muted-foreground">{t('stammdaten.common.laedt')}</p>}
        {view.isError && <StatusRegion ton="fehler" nachricht={view.ladeFehlerMeldung} />}

        {view.ohneGruppen && (
          <p className="text-sm">
            {view.ohneGruppenMeldung}{' '}
            {view.endkundeId !== undefined && (
              <Link
                to={`/stammdaten/endkunden/${view.endkundeId}`}
                className="text-link underline-offset-4 hover:underline"
              >
                {t('geraeteerkennung.zuordnenForm.zumEndkunden')}
              </Link>
            )}
          </p>
        )}

        {!view.isPending && !view.isError && !view.ohneGruppen && (
          <EntityForm
            schema={zuordnungFormSchema}
            defaultValues={zuordnungFormDefaultValues}
            submitLabel={t('geraeteerkennung.zuordnenForm.action')}
            isSubmitting={view.isSubmitting}
            {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
            {...(view.erfolgsMeldung !== undefined ? { submitSuccessMessage: view.erfolgsMeldung } : {})}
            onValidSubmit={view.zuordnen}
            fields={[
              {
                name: 'geraetegruppeId',
                label: t('geraeteerkennung.zuordnenForm.gruppeLabel'),
                kind: 'select',
                options: view.gruppenOptionen,
                hint: t('geraeteerkennung.zuordnenForm.gruppeHinweis'),
              },
              {
                name: 'methode',
                label: t('geraeteerkennung.zuordnenForm.methodeLabel'),
                kind: 'select',
                options: view.methodenOptionen,
                hint: t('geraeteerkennung.zuordnenForm.methodeHinweis'),
              },
              {
                name: 'genauigkeitPct',
                label: t('geraeteerkennung.zuordnenForm.genauigkeitLabel'),
                kind: 'number',
                min: 0.01,
                max: 100,
                step: 'any',
                required: false,
                hint: t('geraeteerkennung.zuordnenForm.genauigkeitHinweis'),
              },
              {
                name: 'anteilProzent',
                label: t('geraeteerkennung.zuordnenForm.anteilLabel'),
                kind: 'number',
                min: 0.01,
                max: 100,
                step: 'any',
                hint: t('geraeteerkennung.zuordnenForm.anteilHinweis'),
              },
              {
                name: 'gueltigVon',
                label: t('geraeteerkennung.zuordnenForm.gueltigVonLabel'),
                kind: 'date',
                hint: t('geraeteerkennung.zuordnenForm.gueltigVonHinweis'),
              },
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}
