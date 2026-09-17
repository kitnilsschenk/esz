import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { EnergietraegerBaselineDetail } from '@edms/shared';
import { DataList, DetailView, type DataListColumn } from '../shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { useMesskonzeptVersionDetailView } from '../../hooks/messkonzept';
import { t } from '../../../../shared/i18n/t';
import { SystemgrenzeAbschnitt } from './SystemgrenzeAbschnitt';
import { BaselinePeriodenAbschnitt } from './BaselinePeriodenAbschnitt';

export interface MesskonzeptVersionDetailAnsichtProps {
  readonly endkundeId: string;
  readonly versionNr: number;
}

const ENERGIETRAEGER_COLUMNS: readonly DataListColumn<EnergietraegerBaselineDetail>[] = [
  {
    key: 'energietraeger',
    header: t('stammdaten.messkonzept.detail.energietraegerTabelle.energietraeger'),
    render: (zeile) => t(`stammdaten.common.enums.energietraeger.${zeile.energietraeger}`),
  },
  {
    key: 'baselineWert',
    header: t('stammdaten.messkonzept.detail.energietraegerTabelle.baselineWert'),
    render: (zeile) => zeile.baselineWert ?? t('stammdaten.messkonzept.detail.energietraegerTabelle.keineAngabe'),
  },
  {
    key: 'baselineEinheit',
    header: t('stammdaten.messkonzept.detail.energietraegerTabelle.baselineEinheit'),
    render: (zeile) => zeile.baselineEinheit ?? t('stammdaten.messkonzept.detail.energietraegerTabelle.keineAngabe'),
  },
  {
    key: 'baselineMethode',
    header: t('stammdaten.messkonzept.detail.energietraegerTabelle.baselineMethode'),
    render: (zeile) => zeile.baselineMethode ?? t('stammdaten.messkonzept.detail.energietraegerTabelle.keineAngabe'),
  },
  {
    key: 'baselineBegruendung',
    header: t('stammdaten.messkonzept.detail.energietraegerTabelle.baselineBegruendung'),
    render: (zeile) => zeile.baselineBegruendung ?? t('stammdaten.messkonzept.detail.energietraegerTabelle.keineAngabe'),
  },
  {
    key: 'baselineBeleg',
    header: t('stammdaten.messkonzept.detail.energietraegerTabelle.baselineBeleg'),
    // TB-02 (V0065): Anzahl, Aktenzeichen und Ablageort in EINER Spalte —
    // sie beantworten zusammen die eine Frage „worauf stuetzt sich diese
    // Baseline?". Drei Spalten waeren in einer ohnehin breiten Tabelle drei
    // meist leere.
    render: (zeile) => {
      // `?? null` an jeder Stelle: Der generierte Typ fuehrt die Felder als
      // optional (`string | null | undefined`), weil sie in der Spec nicht
      // `required` sind — eine Bestandszeile aus der Zeit vor V0065 liefert
      // sie schlicht nicht mit.
      const kandidaten: readonly (string | null)[] = [
        zeile.baselineAbrechnungenAnzahl === null || zeile.baselineAbrechnungenAnzahl === undefined
          ? null
          : `${String(zeile.baselineAbrechnungenAnzahl)} ${t('stammdaten.messkonzept.detail.energietraegerTabelle.abrechnungenSuffix')}`,
        zeile.baselineBelegAktenzeichen ?? null,
        zeile.baselineBelegAblageort ?? null,
      ];
      const teile = kandidaten.filter((teil): teil is string => teil !== null && teil.length > 0);
      return teile.length === 0 ? t('stammdaten.messkonzept.detail.energietraegerTabelle.keineAngabe') : teile.join(' · ');
    },
  },
  {
    // ADR-0007 O-B3b — sichtbar machen, WARUM ein Endkunde im
    // Foerderjahres-Nachweis als `ausgeschlossen` erscheint. Ohne diese Spalte
    // waere das gesetzte Merkmal nur ueber die API einsehbar, der Ausschluss
    // im Nachweis also unerklaerlich.
    key: 'energietraegerSubstitution',
    header: t('stammdaten.messkonzept.detail.energietraegerTabelle.energietraegerSubstitution'),
    render: (zeile) =>
      zeile.energietraegerSubstitution
        ? t('stammdaten.messkonzept.detail.energietraegerTabelle.substitutionJa')
        : t('stammdaten.messkonzept.detail.energietraegerTabelle.substitutionNein'),
  },
];

/**
 * Messkonzept-Version-Detail (`ADR-0008 §23 / D11 Phase 4c Pass 2`,
 * Sub-Ressource-Route `/stammdaten/endkunden/:endkundeId/messkonzept/
 * versionen/:versionNr`): NICHT-PII — die 7 TB-01-Pflichtinhalte über
 * `DetailView`s generisches `fields`-Array, die Energieträger/Baseline-Liste
 * über eine eingebettete `DataList` (fixe, bereits geladene Zeilen — KEINE
 * eigene Pagination, `isPending`/`isError` daher fest `false`, die
 * Ladezustände der ÄUSSEREN `DetailView` gelten bereits für die gesamte
 * Seite). Append-only (Linie 3) — KEIN Ändern/Löschen, daher KEIN
 * `Aendern`/`Stilllegen`-Baustein wie bei Zähler/Messkanal.
 */
export function MesskonzeptVersionDetailAnsicht({ endkundeId, versionNr }: MesskonzeptVersionDetailAnsichtProps): ReactNode {
  const view = useMesskonzeptVersionDetailView(endkundeId, versionNr);

  return (
    <DetailView
      headingId="messkonzept-version-detail-heading"
      title={t('stammdaten.messkonzept.detailPage.title')}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      fields={view.fields}
    >
      <section aria-labelledby="messkonzept-version-detail-energietraeger-heading">
        <Card>
          <CardHeader>
            <CardTitle id="messkonzept-version-detail-energietraeger-heading" as="h2">
              {t('stammdaten.messkonzept.detail.energietraegerSectionTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataList<EnergietraegerBaselineDetail>
              caption={t('stammdaten.messkonzept.detail.energietraegerTabelle.caption')}
              columns={ENERGIETRAEGER_COLUMNS}
              items={view.energietraeger}
              getRowKey={(zeile) => zeile.energietraeger}
              isPending={false}
              isError={false}
              loadingMessage={t('stammdaten.common.laedt')}
              errorMessage={t('stammdaten.common.fehler')}
              emptyMessage={t('stammdaten.messkonzept.tabelle.leer')}
            />
          </CardContent>
        </Card>
      </section>
      <p>
        <Link to={`/stammdaten/endkunden/${endkundeId}`} className="text-link underline-offset-4 hover:underline">
          {t('stammdaten.messkonzept.detailPage.backAction')}
        </Link>
      </p>
      {/*
        Ein Abschnitt JE Energietraeger: Die Systemgrenze haengt an der
        Energietraeger-Zeile, nicht an der Version — Strom und Waerme koennen
        verschiedene Systeme umfassen.
      */}
      {(view.energietraeger ?? []).map((eintrag) => (
        <SystemgrenzeAbschnitt
          key={eintrag.mvetId}
          mvetId={eintrag.mvetId}
          energietraegerLabel={t(`stammdaten.common.enums.energietraeger.${eintrag.energietraeger}`)}
          headingId={`messkonzept-systemgrenze-${eintrag.mvetId}`}
        />
      ))}
      {/*
        Die Bezugszeitraeume haengen aus demselben Grund an der
        Energietraeger-Zeile: Strom und Waerme werden getrennt abgerechnet,
        und die Witterungsbereinigung betrifft ohnehin nur den waermegefuehrten
        Anteil.
      */}
      {(view.energietraeger ?? []).map((eintrag) => (
        <BaselinePeriodenAbschnitt
          key={eintrag.mvetId}
          mvetId={eintrag.mvetId}
          energietraegerLabel={t(`stammdaten.common.enums.energietraeger.${eintrag.energietraeger}`)}
          headingId={`messkonzept-baseline-perioden-${eintrag.mvetId}`}
        />
      ))}
    </DetailView>
  );
}
