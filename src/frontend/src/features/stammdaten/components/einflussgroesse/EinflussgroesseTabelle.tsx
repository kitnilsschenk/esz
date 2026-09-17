import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DataList, kurzId, type DataListColumn } from '../shared';
import { Card, CardContent } from '../../../../shared/ui/card';
import { Button } from '../../../../shared/ui/button';
import { useEinflussgroesseListeView, type EinflussgroesseZeileView } from '../../hooks/einflussgroesse';
import { t } from '../../../../shared/i18n/t';
import { formatiereKalenderdatum } from '../../../../shared/format/datum';

export interface EinflussgroesseTabelleProps {
  readonly systemId: string;
}

/**
 * Einflussgrößen-Liste EINES Systems (ADR-0006 Teil B, B8/B10). Zeigt
 * Klartext-Werte (`wertNum`/`wertCode`, pii=true) — bewusst KEIN
 * `PiiMaskedField` (Ausnahme zur „Listen sind PII-frei"-Regel, s.
 * `hooks/einflussgroesse/useKannEinflussgroesseLesen.ts`).
 *
 * DREI Zustände, in dieser Reihenfolge geprüft:
 * 1. Ohne `read:einflussgroesse` (`kannLesen=false`): NUR ein
 *    Zugriffsverweigert-Hinweis, KEIN CTA, KEINE Tabelle.
 * 2. Vor dem ersten Klick (`angefordert=false`): NUR ein Zweck-Hinweistext
 *    + der CTA „Einflussgrößen anzeigen" — der auditierte Klartext-Aufruf
 *    wird NICHT automatisch beim Render ausgelöst.
 * 3. Nach dem Klick: `DataList` mit den geladenen Zeilen + einem dezenten
 *    Klartext-Einsichts-Hinweis + Korrigieren-Link je Zeile (trägt
 *    `?groesseCode=` für die `wert_art`-bewusste Validierung des
 *    Korrigieren-Formulars, s. `einflussgroesseKorrigierenFormSchema.ts`).
 */
export function EinflussgroesseTabelle({ systemId }: EinflussgroesseTabelleProps): ReactNode {
  const view = useEinflussgroesseListeView(systemId);

  if (!view.kannLesen) {
    return <p role="alert">{t('stammdaten.einflussgroesse.zugriffVerweigert')}</p>;
  }

  if (!view.angefordert) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm text-muted-foreground">{t('stammdaten.einflussgroesse.liste.hinweisVorAnzeige')}</p>
          <Button type="button" onClick={view.anzeigen}>
            {t('stammdaten.einflussgroesse.liste.anzeigenAction')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const columns: readonly DataListColumn<EinflussgroesseZeileView>[] = [
    { key: 'id', header: t('stammdaten.einflussgroesse.tabelle.id'), render: (item) => kurzId(item.id) },
    { key: 'groesse', header: t('stammdaten.einflussgroesse.tabelle.groesse'), render: (item) => item.groesseCodeLabel },
    { key: 'wert', header: t('stammdaten.einflussgroesse.tabelle.wert'), render: (item) => item.wertAnzeige },
    { key: 'gueltigAbMonat', header: t('stammdaten.einflussgroesse.tabelle.gueltigAbMonat'), render: (item) => formatiereKalenderdatum(item.gueltigAbMonat) },
    { key: 'gueltigBisMonat', header: t('stammdaten.einflussgroesse.tabelle.gueltigBisMonat'), render: (item) => formatiereKalenderdatum(item.gueltigBisMonat) },
    { key: 'betroffenerTyp', header: t('stammdaten.einflussgroesse.tabelle.betroffenerTyp'), render: (item) => item.betroffenerTypLabel },
    { key: 'quelleTyp', header: t('stammdaten.einflussgroesse.tabelle.quelleTyp'), render: (item) => item.quelleTypLabel },
    { key: 'rechtsgrundlage', header: t('stammdaten.einflussgroesse.tabelle.rechtsgrundlage'), render: (item) => item.rechtsgrundlageLabel },
    { key: 'anlassCode', header: t('stammdaten.einflussgroesse.tabelle.anlassCode'), render: (item) => item.anlassCodeLabel },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('stammdaten.einflussgroesse.liste.klartextHinweis')}</p>
      <DataList<EinflussgroesseZeileView>
        caption={t('stammdaten.einflussgroesse.liste.caption')}
        columns={columns}
        items={view.zeilen}
        getRowKey={(item) => item.id}
        isPending={view.isPending}
        isError={view.isError}
        loadingMessage={t('stammdaten.common.laedt')}
        errorMessage={t('stammdaten.common.fehler')}
        emptyMessage={t('stammdaten.einflussgroesse.liste.leer')}
        actionHeader={t('stammdaten.common.aktion')}
        renderRowAction={(item) => (
          <Link
            to={`/stammdaten/systeme/${systemId}/einflussgroessen/${item.id}/korrigieren?groesseCode=${item.groesseCode}`}
            aria-label={`${t('stammdaten.einflussgroesse.liste.korrigierenAction')} ${item.groesseCodeLabel} (${kurzId(item.id)})`}
            className="text-link underline-offset-4 hover:underline"
          >
            {t('stammdaten.einflussgroesse.liste.korrigierenAction')}
          </Link>
        )}
      />
    </div>
  );
}
