import { Injectable } from '@nestjs/common';

export const KLIMA_QUELLEN = ['synthetic', 'dwd'] as const;
export type KlimaQuelleWahl = (typeof KLIMA_QUELLEN)[number];

/** CDC-Verzeichnis der Stations-Tageswerte (Klima, täglich). */
const STANDARD_BASIS_URL = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/kl';

/** Ein CDC-Tagesarchiv liegt bei ~40 KB (recent) bzw. ~2 MB (historical). 32 MB sind großzügig und trotzdem eine Grenze. */
const STANDARD_MAX_DOWNLOAD_BYTES = 32 * 1024 * 1024;
const STANDARD_TIMEOUT_MS = 30_000;

function parseWahl(raw: string | undefined): KlimaQuelleWahl {
  const wert = raw ?? 'synthetic';
  if (!(KLIMA_QUELLEN as readonly string[]).includes(wert)) {
    throw new Error(
      `EDMS_KLIMA_QUELLE='${wert}' ist ungueltig (erlaubt: ${KLIMA_QUELLEN.join('|')}) — fail-closed (Studio-Konvention, s. SyntheticOnlyConfigService).`,
    );
  }
  return wert as KlimaQuelleWahl;
}

function parseBasisUrl(raw: string | undefined): string {
  const wert = (raw ?? STANDARD_BASIS_URL).replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(wert);
  } catch {
    throw new Error(`EDMS_DWD_BASIS_URL='${wert}' ist keine gueltige URL — fail-closed.`);
  }

  const istLokal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  if (url.protocol !== 'https:' && !istLokal) {
    // Klimadaten sind öffentlich, aber ein ungesicherter Transport ließe
    // einen Dritten die Zahlen ändern, aus denen die Baseline entsteht.
    // Ausnahme nur für den lokalen Test-Doppelgänger (Integrationstest).
    throw new Error(`EDMS_DWD_BASIS_URL='${wert}' muss https sein (Ausnahme nur localhost) — fail-closed.`);
  }

  return wert;
}

function parsePositiveZahl(name: string, raw: string | undefined, standard: number): number {
  if (raw === undefined) {
    return standard;
  }
  const wert = Number.parseInt(raw, 10);
  if (!Number.isFinite(wert) || wert <= 0) {
    throw new Error(`${name}='${raw}' ist ungueltig (positive Ganzzahl erwartet) — fail-closed.`);
  }
  return wert;
}

/**
 * Welche Klimaquelle gebunden wird — und mit welchen Grenzen der reale Abruf
 * läuft.
 *
 * **Default `synthetic`**, aus demselben Grund wie bei
 * `EDMS_SYNTHETIC_ONLY` (ADR-0008 §22): eine Instanz, die nicht ausdrücklich
 * für den Realbetrieb konfiguriert wurde, greift nicht nach außen. Tests, CI
 * und jede frische Dev-Instanz bleiben damit ohne Netzzugriff und ohne
 * Fremddaten — auch dann, wenn niemand daran gedacht hat.
 *
 * `EDMS_KLIMA_QUELLE=dwd` schaltet auf `opendata.dwd.de` um. Das ist KEIN
 * Real-PII-Schalter: Klimadaten sind nicht personenbezogen, und der Abruf
 * überträgt ausschließlich eine öffentliche Stationsnummer (Auflage A-4).
 * `EDMS_SYNTHETIC_ONLY` bleibt davon unberührt und gilt weiter für alles
 * andere.
 */
@Injectable()
export class KlimaQuelleConfigService {
  readonly quelle: KlimaQuelleWahl;
  readonly dwdBasisUrl: string;
  readonly dwdTimeoutMs: number;
  readonly dwdMaxDownloadBytes: number;

  constructor() {
    this.quelle = parseWahl(process.env['EDMS_KLIMA_QUELLE']);
    this.dwdBasisUrl = parseBasisUrl(process.env['EDMS_DWD_BASIS_URL']);
    this.dwdTimeoutMs = parsePositiveZahl('EDMS_DWD_TIMEOUT_MS', process.env['EDMS_DWD_TIMEOUT_MS'], STANDARD_TIMEOUT_MS);
    this.dwdMaxDownloadBytes = parsePositiveZahl(
      'EDMS_DWD_MAX_DOWNLOAD_BYTES',
      process.env['EDMS_DWD_MAX_DOWNLOAD_BYTES'],
      STANDARD_MAX_DOWNLOAD_BYTES,
    );
  }
}
