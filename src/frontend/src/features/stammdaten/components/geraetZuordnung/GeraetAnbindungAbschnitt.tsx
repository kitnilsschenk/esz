import type { ReactNode } from 'react';
import type { GeraetAnbindung } from '@edms/shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { Badge } from '../../../../shared/ui/badge';
import { Button } from '../../../../shared/ui/button';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { EntityForm, type EntityFormFieldConfig } from '../shared';
import {
  geraetAnbindenFormDefaultValues,
  geraetAnbindenFormSchema,
  type GeraetAnbindenFormValues,
} from '../../api/geraetZuordnung';
import {
  geraetAnbindungAnzeige,
  useGeraetAnbindungAnlegenView,
  useGeraetAnbindungBeendenView,
} from '../../hooks/geraetZuordnung';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import { t } from '../../../../shared/i18n/t';

export interface GeraetAnbindungAbschnittProps {
  readonly zaehlerId: string;
  /** Das `geraetAnbindung`-Feld des Zählers — `null` = derzeit keine aktive Zuordnung. */
  readonly anbindung: GeraetAnbindung | null;
  readonly headingId: string;
}

/**
 * Abschnitt „Geräte-Anbindung" auf der Zähler-Detailseite — die Stelle, an der
 * ein Zähler mit dem Funkgerät verbunden wird, über das seine Messwerte
 * hereinkommen.
 *
 * **Die Kennung des Geräts wird nie angezeigt.** Der Server gibt sie nach dem
 * Anbinden nicht wieder heraus; sie ist verschlüsselt abgelegt und nur über
 * einen eigenen, gesonderten Vorgang auflösbar. Der Abschnitt zeigt deshalb
 * nur, DASS und SEIT WANN eine Anbindung besteht.
 *
 * **Ein Gerätetausch ist zwei Schritte** — erst beenden, dann neu anbinden.
 * Das entspricht dem Server, der pro Zähler höchstens eine aktive Anbindung
 * zulässt; ein „ersetzen"-Knopf würde eine Atomarität vortäuschen, die es
 * nicht gibt.
 */
export function GeraetAnbindungAbschnitt({ zaehlerId, anbindung, headingId }: GeraetAnbindungAbschnittProps): ReactNode {
  const anzeige = geraetAnbindungAnzeige(anbindung);
  const kannAendern = useKannStammdatenAnlegen();
  const anlegenView = useGeraetAnbindungAnlegenView(zaehlerId);
  const beendenView = useGeraetAnbindungBeendenView(zaehlerId, anzeige.geraetZuordnungId ?? '');

  const fields: readonly EntityFormFieldConfig[] = [
    {
      name: 'devEui',
      label: t('stammdaten.geraetAnbindung.form.devEui'),
      kind: 'text',
      autoComplete: 'off',
      hint: t('stammdaten.geraetAnbindung.form.devEuiHinweis'),
    },
  ];

  return (
    <section aria-labelledby={headingId}>
      <Card>
        <CardHeader>
          <CardTitle id={headingId} as="h2">
            {t('stammdaten.geraetAnbindung.detail.sectionTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {anzeige.istAngebunden ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="success">{anzeige.statusLabel}</Badge>
                <p className="text-sm text-foreground">
                  {t('stammdaten.geraetAnbindung.detail.angebundenSeit')} {anzeige.angebundenSeitLabel}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">{t('stammdaten.geraetAnbindung.detail.kennungHinweis')}</p>
              {kannAendern && (
                <>
                  <StatusRegion ton="fehler" nachricht={beendenView.submitErrorMessage} />
                  <StatusRegion ton="erfolg" nachricht={beendenView.erfolgsMeldung} />
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={beendenView.beenden}
                    disabled={beendenView.isSubmitting}
                  >
                    {t('stammdaten.geraetAnbindung.detail.beendenAction')}
                  </Button>
                </>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t('stammdaten.geraetAnbindung.detail.nichtAngebundenHinweis')}</p>
              {kannAendern && (
                <EntityForm<GeraetAnbindenFormValues>
                  schema={geraetAnbindenFormSchema}
                  fields={fields}
                  defaultValues={geraetAnbindenFormDefaultValues}
                  submitLabel={t('stammdaten.geraetAnbindung.detail.anbindenAction')}
                  isSubmitting={anlegenView.isSubmitting}
                  {...(anlegenView.submitErrorMessage !== undefined
                    ? { submitErrorMessage: anlegenView.submitErrorMessage }
                    : {})}
                  onValidSubmit={anlegenView.anbinden}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
