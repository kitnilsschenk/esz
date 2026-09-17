import type { ReactNode } from 'react';
import type { LueckenTyp, VollstaendigkeitItem } from '@edms/shared';
import { DataList, kurzId, type DataListColumn } from '../shared';
import { Badge, type BadgeProps } from '../../../../shared/ui/badge';
import { useVollstaendigkeitListeView } from '../../hooks/monitoring';
import { t } from '../../../../shared/i18n/t';

// Badge-Einfärbung je Lückentyp (Phase 4c-Feinschliff, Design-System):
// strukturelle Lücken (kein Messkonzept/Zähler/Messkanal) UND eine fehlende
// aktive Einwilligung blockieren jede weitere Verarbeitung vollständig —
// `destructive`. Eine fehlende Mindestauflösungs-Zusage ist demgegenüber
// EIN weicheres Nachweis-Defizit (Prozess kann anlaufen, muss aber
// nachgezogen werden) — `warning`.
const LUECKEN_BADGE_VARIANTE: Readonly<Record<LueckenTyp, NonNullable<BadgeProps['variant']>>> = {
  kein_messkonzept: 'destructive',
  kein_zaehler: 'destructive',
  kein_messkanal: 'destructive',
  kein_aktiver_consent: 'destructive',
  keine_mindestaufloesungs_zusage: 'warning',
};

function LueckenZelle({ item }: { readonly item: VollstaendigkeitItem }): ReactNode {
  if (item.luecken.length === 0) {
    return <span className="text-sm text-muted-foreground">{t('stammdaten.monitoring.tabelle.keineLuecken')}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {item.luecken.map((luecke) => (
        <Badge key={luecke} variant={LUECKEN_BADGE_VARIANTE[luecke]}>
          {t(`stammdaten.common.enums.lueckenTyp.${luecke}`)}
        </Badge>
      ))}
    </div>
  );
}

/**
 * Vollständigkeits-/Lücken-Dashboard (`ADR-0008 §23 / D11 Phase 4c Pass 2`,
 * DE-02): zeigt je Endkunde die fehlenden Stammdaten (v1: Endkunde-Rollup,
 * `ebene` ist in diesem Pass IMMER `'endkunde'`, `systemId`/`zaehlerId` NUR
 * für spätere granularere Ebenen vorgesehen und daher hier NICHT gerendert)
 * — AUSSCHLIESSLICH Metadaten, KEINE PII/Verbrauchsfelder (§6.5). KEINE
 * Detail-Route/Zeilen-Aktion in diesem Pass (reine Übersicht). Lücken je
 * Endkunde als `Badge`s je Lückentyp (statt Komma-Liste als Fließtext,
 * Phase 4c-Feinschliff) — Einfärbung s. `LUECKEN_BADGE_VARIANTE`.
 */
export function VollstaendigkeitTabelle(): ReactNode {
  const view = useVollstaendigkeitListeView();

  const columns: readonly DataListColumn<VollstaendigkeitItem>[] = [
    { key: 'endkundeId', header: t('stammdaten.monitoring.tabelle.endkundeId'), render: (item) => kurzId(item.endkundeId) },
    {
      key: 'ebene',
      header: t('stammdaten.monitoring.tabelle.ebene'),
      render: (item) => t(`stammdaten.common.enums.vollstaendigkeitEbene.${item.ebene}`),
    },
    { key: 'luecken', header: t('stammdaten.monitoring.tabelle.luecken'), render: (item) => <LueckenZelle item={item} /> },
    { key: 'geprueftAm', header: t('stammdaten.monitoring.tabelle.geprueftAm'), render: (item) => item.geprueftAm },
  ];

  return (
    <DataList<VollstaendigkeitItem>
      caption={t('stammdaten.monitoring.tabelle.caption')}
      columns={columns}
      items={view.items}
      getRowKey={(item) => item.endkundeId}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      emptyMessage={t('stammdaten.monitoring.tabelle.leer')}
      pagination={{
        hasNextPage: view.hasNextPage,
        isFetchingNextPage: view.isFetchingNextPage,
        onLoadMore: view.loadMore,
        loadMoreLabel: t('stammdaten.common.weitereLaden'),
      }}
    />
  );
}
