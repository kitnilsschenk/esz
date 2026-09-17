import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { AnalyticsVerfahrenRepository } from './persistence/analytics-verfahren.repository';
import { TAGE_PRO_JAHR_DEFAULT, baselineNormiert, referenzMonat } from './domain/witterung-gtz';

/**
 * Deckungsgleich mit `tests/golden/verfahren/witterung_gtz_vdi3807@1.json`
 * ("toleranz_kwh": 0.001) — die DB-Spalte `analytics.verfahren_version.
 * golden_vectors` (V0019, gegen die Dev-DB verifiziert) speichert NUR das
 * rohe `vektoren`-ARRAY (KEIN umschließendes `{toleranz_kwh, vektoren}`-
 * Objekt wie die Repo-Datei) — Toleranz/`tage_pro_jahr` sind daher hier
 * fest verdrahtet (identisch zum Repo-Kanon), NICHT aus der DB gelesen.
 */
const TOLERANZ_KWH = 0.001;

interface GoldenVektor {
  readonly vektor: string;
  readonly g: number;
  readonly d_m: number;
  readonly b_a_kwh: number;
  readonly gtz_base_kd: number | null;
  readonly gtz_m_ist_kd: number;
  readonly erwartet_r_m_kwh: number;
  readonly zusatz?: { readonly gtz_norm_kd: number; readonly erwartet_b_norm_kwh: number };
}

/**
 * ADR-0006 Arbeitsauftrag Priorität 6 — Bootstrap-Fail-closed-Check: rechnet
 * beim App-Start JEDEN Golden Vector aus `analytics.verfahren_version.
 * golden_vectors` (DB-Spiegel, D-GV) mit dem tatsächlichen Rechenkern
 * (`domain/witterung-gtz.ts`) nach. Weicht auch nur EIN Vektor stärker als
 * die dokumentierte Toleranz ab, wirft dieser Service — die App startet dann
 * NICHT (`OnModuleInit` wirft, Nest bricht den Bootstrap ab). Schützt gegen
 * eine künftige, unbemerkte Formel-/Kern-Änderung, die von den (durch
 * `witterung-gtz.spec.ts` bereits abgedeckten) Unit-Tests aus irgendeinem
 * Grund nicht erfasst würde (z. B. ein versehentlich NICHT ausgeführter
 * Test-Lauf in einer CI-Fehlkonfiguration) — die DB-Kopie der Vektoren ist
 * die "versiegelte Spec" (D-GV-Kommentar V0019), unabhängig vom
 * Test-Runner-Zustand.
 *
 * Läuft über ALLE aktiven Verfahrensversionen (`findAlleAktiven()`), NICHT
 * nur `witterung_gtz_vdi3807@1` — zukunftssicher für weitere Verfahren, ohne
 * diesen Service anzufassen. Ein Verfahren, dessen `golden_vectors`-Struktur
 * dieser Service (noch) nicht versteht, wird übersprungen (mit Warnung),
 * NICHT hart abgelehnt — nur `witterung_gtz_vdi3807` hat aktuell einen
 * Kern, den dieser Service kennt.
 *
 * REGRESSION-FIX (Integrationstest-Lauf, dieses Arbeitspaket): mehrere
 * BESTEHENDE, von diesem Paket unabhängige Test-Harnesses (`health-test-
 * app.ts`, `auth-session.contract.integration.spec.ts`) booten die REALE
 * `AppModule` ABSICHTLICH gegen einen FRISCHEN, UNMIGRIERTEN Testcontainer
 * (kein `migrateTestPostgres()`-Aufruf — sie testen ausschließlich globale
 * Guards/Interceptors/Health-Routen, brauchen also gar kein Fachschema). Das
 * `analytics`-Schema existiert dort schlicht NICHT — das ist ein
 * LEGITIMER, bereits etablierter Test-Zustand, KEIN Kern-Drift-Symptom.
 * `onModuleInit()` unterscheidet daher fail-closed (echte Formel-/
 * Katalog-Abweichung -> App-Start abgebrochen) von "Schema fehlt komplett"
 * (PG `42P01`, `relation ... does not exist` -> NUR Warnung, App startet
 * weiter) — s. `istSchemaFehltFehler()`.
 */
@Injectable()
export class GoldenVectorBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(GoldenVectorBootstrapService.name);

  constructor(private readonly verfahrenRepository: AnalyticsVerfahrenRepository) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.pruefeAlleInTx();
    } catch (error: unknown) {
      if (this.istSchemaFehltFehler(error)) {
        this.logger.warn(
          'Golden-Vector-Bootstrap-Check übersprungen: Schema `analytics` ist in dieser Umgebung nicht migriert ' +
            '(z. B. ein Test-Harness ohne Fachschema-Migrationen) — kein Kern-Drift-Signal, App startet weiter.',
        );
        return;
      }
      throw error;
    }
  }

  /** PG `42P01` ("relation ... does not exist") — s. Klassen-Dok "REGRESSION-FIX". */
  private istSchemaFehltFehler(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { readonly code: unknown }).code === '42P01';
  }

  @Transactional(Propagation.Required)
  private async pruefeAlleInTx(): Promise<void> {
    const verfahrenVersionen = await this.verfahrenRepository.findAlleAktiven();
    if (verfahrenVersionen.length === 0) {
      throw new Error(
        'Golden-Vector-Bootstrap-Check: KEINE aktive Verfahrensversion in analytics.verfahren_version gefunden — fail-closed, App-Start abgebrochen.',
      );
    }

    let geprueft = 0;
    for (const version of verfahrenVersionen) {
      if (version.code === 'witterung_gtz_vdi3807') {
        geprueft += this.pruefeWitterungGtzVdi3807(version.code, version.version, version.goldenVectors);
      } else {
        this.logger.warn(
          `Golden-Vector-Bootstrap-Check: Verfahren '${version.code}@${String(version.version)}' hat keinen bekannten Kern-Adapter in diesem Service — übersprungen.`,
        );
      }
    }

    this.logger.log(`Golden-Vector-Bootstrap-Check: ${String(geprueft)} Vektor(en) erfolgreich gegen den Kern verifiziert.`);
  }

  private pruefeWitterungGtzVdi3807(code: string, version: number, rohVektoren: unknown): number {
    const vektoren = this.parseVektoren(code, version, rohVektoren);

    for (const vektor of vektoren) {
      const rM = referenzMonat({
        baselineJahresWertKwh: vektor.b_a_kwh,
        grundlastAnteil: vektor.g,
        tageImMonat: vektor.d_m,
        tageProJahr: TAGE_PRO_JAHR_DEFAULT,
        gtzMonatIst: vektor.gtz_m_ist_kd,
        gtzBase: vektor.gtz_base_kd,
      });
      const abweichungRm = Math.abs(this.runde3(rM) - vektor.erwartet_r_m_kwh);
      if (abweichungRm > TOLERANZ_KWH) {
        throw new Error(
          `Golden-Vector-Bootstrap-Check FEHLGESCHLAGEN (${code}@${String(version)}, Vektor ${vektor.vektor}): ` +
            `R_m=${String(this.runde3(rM))} kWh weicht um ${String(abweichungRm)} kWh von erwartet ${String(vektor.erwartet_r_m_kwh)} kWh ab ` +
            `(Toleranz ${String(TOLERANZ_KWH)} kWh) — Rechenkern weicht von der versiegelten Spec ab, App-Start fail-closed abgebrochen.`,
        );
      }

      if (vektor.zusatz !== undefined) {
        const bNorm = baselineNormiert({
          baselineJahresWertKwh: vektor.b_a_kwh,
          grundlastAnteil: vektor.g,
          gtzNorm: vektor.zusatz.gtz_norm_kd,
          gtzBase: vektor.gtz_base_kd,
        });
        const abweichungBNorm = Math.abs(this.runde3(bNorm) - vektor.zusatz.erwartet_b_norm_kwh);
        if (abweichungBNorm > TOLERANZ_KWH) {
          throw new Error(
            `Golden-Vector-Bootstrap-Check FEHLGESCHLAGEN (${code}@${String(version)}, Vektor ${vektor.vektor}, B_norm): ` +
              `weicht um ${String(abweichungBNorm)} kWh von erwartet ${String(vektor.zusatz.erwartet_b_norm_kwh)} kWh ab ` +
              `(Toleranz ${String(TOLERANZ_KWH)} kWh).`,
          );
        }
      }
    }

    return vektoren.length;
  }

  /** `analytics.verfahren_version.golden_vectors` speichert das ROHE Vektor-Array (gegen die Dev-DB verifiziert), kein umschließendes Objekt. */
  private parseVektoren(code: string, version: number, roh: unknown): readonly GoldenVektor[] {
    if (!Array.isArray(roh) || roh.length === 0) {
      throw new Error(
        `Golden-Vector-Bootstrap-Check: 'golden_vectors' von '${code}@${String(version)}' ist KEIN nicht-leeres Array — fail-closed, App-Start abgebrochen.`,
      );
    }
    return roh as GoldenVektor[];
  }

  private runde3(wert: number): number {
    return Math.round(wert * 1000) / 1000;
  }
}
