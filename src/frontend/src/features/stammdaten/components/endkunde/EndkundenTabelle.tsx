import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { EndkundeListItem } from '@edms/shared';
import { DataList, kurzId, type DataListColumn } from '../shared';
import { useEndkundeLabelsView, useEndkundenListeView } from '../../hooks/endkunde';
import { t } from '../../../../shared/i18n/t';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';

export interface EndkundenTabelleProps {
  /**
   * Überschreibt die Standard-Zeilen-Aktion (Link zum Endkunde-Detail) — z. B.
   * für die Standort-Übersichtsseite (`StandortUebersichtAnsicht`), die STATT
   * zum Detail zu navigieren den gewählten Endkunden lokal auswählt (kein
   * neuer Listen-/Such-Aufbau, `.claude/skills/edms-frontend/SKILL.md`:
   * „Shared-Fabriken/Primitives nicht duplizieren"). `undefined` (Default)
   * belässt das ursprüngliche Verhalten unverändert (`EndkundenListePage`).
   */
  readonly renderRowAction?: (item: EndkundeListItem) => ReactNode;
}

/**
 * Endkunden-Liste (`ADR-0008 §23 / D11`): Pseudonym-`id` (gekürzt),
 * `verarbeitungsStatus`, DE-04-Flag, `createdAt` — KEIN
 * Name (Linie 2, die API liefert hier ohnehin nur PII-freie
 * `EndkundeListItem`s). Cursor-Pagination via `DataList`s „Weitere laden".
 */
export function EndkundenTabelle({ renderRowAction }: EndkundenTabelleProps = {}): ReactNode {
  const view = useEndkundenListeView();
  // Auflage A3: Angefragt wird GENAU die dargestellte Menge — nicht der
  // Gesamtbestand. `view.items` waechst durch "Weitere laden" seitenweise;
  // der Query-Key bindet die sortierte Id-Menge, ein Zurueckblaettern loest
  // daher keinen neuen (auditierten) Aufruf aus.
  const labels = useEndkundeLabelsView(view.items.map((item) => item.id));

  const columns: readonly DataListColumn<EndkundeListItem>[] = [
    {
      key: 'name',
      header: t('stammdaten.endkunde.tabelle.name'),
      // Faellt IMMER auf die Kurz-Id zurueck: fehlende Berechtigung, noch
      // nicht geladen, serverseitig gefiltert (gesperrt/geschreddert) und
      // unbekannte Id sind fuer die Darstellung derselbe Fall (A4 — der
      // Server begruendet die Filterung nicht, also konstruiert die UI daraus
      // auch keine Aussage).
      render: (item) => labels.anzeigeName(item.id),
    },
    { key: 'id', header: t('stammdaten.endkunde.tabelle.id'), render: (item) => kurzId(item.id) },
    {
      key: 'verarbeitungsStatus',
      header: t('stammdaten.endkunde.tabelle.verarbeitungsStatus'),
      render: (item) => t(`stammdaten.endkunde.status.verarbeitung.${item.verarbeitungsStatus}`),
    },
    {
      key: 'vonWissAuswertungAusgenommen',
      header: t('stammdaten.endkunde.tabelle.vonWissAuswertungAusgenommen'),
      render: (item) => (item.vonWissAuswertungAusgenommen ? t('stammdaten.common.ja') : t('stammdaten.common.nein')),
    },
    { key: 'createdAt', header: t('stammdaten.endkunde.tabelle.createdAt'), render: (item) => formatiereZeitpunkt(item.createdAt) },
  ];

  return (
    <div className="space-y-2">
      {/*
        Auflage A8: ein STATISCHER, nicht blockierender Hinweis — bewusst KEIN
        Zweck-Token wie beim Lastgang. Der Name ist ein Stammdatum, das diese
        Rolle ohnehin als Dauerrecht hat; eine Bestaetigung bei jedem
        Seitenaufbau waere Ritual und entwertete die Signalwirkung des echten
        break-glass-Gates.
      */}
      {labels.zeigtKlartext && (
        <p className="text-xs text-muted-foreground">{t('stammdaten.endkunde.klartextHinweis')}</p>
      )}
      <DataList<EndkundeListItem>
        caption={t('stammdaten.endkunde.tabelle.caption')}
        columns={columns}
        items={view.items}
        getRowKey={(item) => item.id}
        isPending={view.isPending}
        isError={view.isError}
        loadingMessage={t('stammdaten.common.laedt')}
        errorMessage={t('stammdaten.common.fehler')}
        emptyMessage={t('stammdaten.endkunde.tabelle.leer')}
        actionHeader={t('stammdaten.common.aktion')}
        renderRowAction={
          renderRowAction ??
          ((item) => (
            <Link
              to={`/stammdaten/endkunden/${item.id}`}
              aria-label={`${t('stammdaten.endkunde.tabelle.detailsAnzeigen')} ${kurzId(item.id)}`}
              className="text-link underline-offset-4 hover:underline"
            >
              {t('stammdaten.endkunde.tabelle.detailsAnzeigen')}
            </Link>
          ))
        }
        filter={{
          label: t('stammdaten.common.filter.label'),
          platzhalter: t('stammdaten.common.filter.platzhalter'),
          // Name UND Kennung: Ohne `read:endkunde_pii` liefert `anzeigeName`
          // die Kurz-Id zurueck — das Feld tut also auch fuer Rollen etwas,
          // die keinen Klartext sehen.
          trifftZu: (item, suchbegriff) =>
            labels.anzeigeName(item.id).toLowerCase().includes(suchbegriff) ||
            item.id.toLowerCase().includes(suchbegriff),
        }}
        filterHinweis={t('stammdaten.common.filter.hinweis')}
        filterLeerMessage={t('stammdaten.common.filter.leer')}
        filterErgebnisAnsage={(sichtbar, gesamt) =>
          `${t('stammdaten.common.filter.ergebnisPraefix')} ${String(sichtbar)} ${t('stammdaten.common.filter.ergebnisVon')} ${String(gesamt)} ${t('stammdaten.common.filter.ergebnisSuffix')}`
        }
        pagination={{
          hasNextPage: view.hasNextPage,
          isFetchingNextPage: view.isFetchingNextPage,
          onLoadMore: view.loadMore,
          loadMoreLabel: t('stammdaten.common.weitereLaden'),
        }}
      />
    </div>
  );
}
