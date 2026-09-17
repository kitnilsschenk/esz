import type { ReactNode } from 'react';
import {
  AusfallKachel,
  EinstiegKachel,
  LueckenKachel,
  NutzerinfoKachel,
  Schnellzugriffe,
  UnverorteteZaehlerKachel,
} from '../components';
import { PageHeader } from '../../stammdaten/components/shared';
import { t } from '../../../shared/i18n/t';

/**
 * Neue Startseite „Arbeitsplatz" (Betriebs-UI-Konzept Punkt 1, Priorität 1 —
 * größter Wahrnehmungssprung, reine Frontend-Komposition bestehender
 * Endpunkte). Ersetzt den bisherigen `HealthStatusPanel`-Health-Check als
 * erste Zeile der App (Health bleibt erreichbar: `/verwaltung/systemstatus`
 * + Ampel-Punkt in `AuthStatusHeader`, s. dortige Klassen-Dok).
 *
 * Kachel-Reihenfolge = fachliche Priorität (TB-04 vor DE-02 vor
 * Auffindbarkeit): `AusfallKachel` (Kachel 1, sanktionsbewehrt) →
 * `LueckenKachel` (Kachel 2) → `UnverorteteZaehlerKachel` (Kachel 3,
 * Backend-Bedarf — s. dortige Klassen-Dok) → zwei Einstiegs-Kacheln
 * (Baseline & Einsparung, BAFA-Export). Die letzten beiden waren graue
 * „bald"-Platzhalter, solange es die Bereiche nicht gab; jetzt führen sie
 * hin. Eine Kennzahl tragen sie bewusst nicht — s. `EinstiegKachel`.
 * JEDE Kachel lädt unabhängig — kein einzelner langsamer Endpunkt blockiert
 * die ganze Seite.
 */
export function DashboardPage(): ReactNode {
  return (
    <section aria-labelledby="dashboard-heading">
      <PageHeader headingId="dashboard-heading" title={t('dashboard.pageTitle')} />
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AusfallKachel />
          <LueckenKachel />
          <UnverorteteZaehlerKachel />
          {/*
            Nach den Datenqualitaets-Kacheln: Erst muss klar sein, ob die
            Zahlen taugen, dann ob sie beim Kunden angekommen sind.
          */}
          <NutzerinfoKachel />
          <EinstiegKachel
            titel={t('dashboard.kachel.baseline.titel')}
            beschreibung={t('dashboard.kachel.baseline.beschreibung')}
            ctaLabel={t('dashboard.kachel.baseline.ctaLabel')}
            ctaTo="/berechnung/laeufe"
          />
          <EinstiegKachel
            titel={t('dashboard.kachel.bafaExport.titel')}
            beschreibung={t('dashboard.kachel.bafaExport.beschreibung')}
            ctaLabel={t('dashboard.kachel.bafaExport.ctaLabel')}
            ctaTo="/nachweis/foerderjahre"
          />
        </div>
        <Schnellzugriffe />
      </div>
    </section>
  );
}

export default DashboardPage;
