// Einzige Stelle, die für die Verbrauchs-Ressource `apiClient.GET(...)`
// aufruft (`.claude/rules/frontend-react.md`). NUR-lesend (`read:verbrauch_aggregat`,
// KEIN break-glass) — Route A des Messwerte-Contracts
// (`schemas/openapi/messwerte.openapi.yaml`). Route B
// (`messkanalZeitreiheLesen`, break-glass `read:verbrauch_detail`) ist NICHT
// Teil dieses Auftrags.

import { apiClient, toApiProblemError, type MesswertZeitreiheAntwort, type VerbrauchAggregatAntwort } from '@edms/shared';
import type { VerbrauchAnfrage } from './verbrauchKeys';
import type { BreakGlassZweckCode } from './breakGlassConstants';

/**
 * `read:verbrauch_aggregat` — aggregierter Verbrauch je Standortknoten (inkl.
 * Unterknoten, sofern `inklusiveUnterknoten`), PII-frei. `von`/`bis` MÜSSEN
 * bereits UTC-ISO-Zeitstempel an einer für `aufloesung` gültigen
 * Bucket-Grenze sein (Mitternacht für `tag`/`stunde`, Monatsanfang für
 * `monat`) — die Normalisierung übernimmt `hooks/verbrauch/verbrauchZeitraum.ts`,
 * DAMIT die von hier zurückgelieferten `zeitpunkt`-Werte exakt mit den vom
 * Aufrufer selbst berechneten Bucket-Grenzen übereinstimmen (Lücken-Erkennung,
 * s. `useVerbrauchView`).
 */
export async function fetchVerbrauch(standortId: string, anfrage: VerbrauchAnfrage): Promise<VerbrauchAggregatAntwort> {
  const { data, error } = await apiClient.GET('/messwerte/standorte/{standortId}/verbrauch', {
    params: {
      path: { standortId },
      query: {
        von: anfrage.von,
        bis: anfrage.bis,
        aufloesung: anfrage.aufloesung,
        inklusiveUnterknoten: anfrage.inklusiveUnterknoten,
      },
    },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export interface MesskanalZeitreiheAnfrage {
  /** Abfrage-Zeitfenster `[von, bis)` (UTC, `bis` EXKLUSIV) — die tatsächlich angezeigte Spanne. */
  readonly von: string;
  readonly bis: string;
  /**
   * Break-glass-Zugriffszweck (ADR-0008 §16/D4) — eigenes, ggf. abweichendes
   * Fenster `[zugriffszweckVon, zugriffszweckBis]` (dient NUR der
   * PDP-Fensterprüfung `<= MAX_FENSTER_TAGE`, unabhängig von `von`/`bis`
   * oben). Diese UI setzt beide Fenster IMMER identisch (kein Anwendungsfall
   * für ein abweichendes Zweck-Fenster in diesem Pass).
   */
  readonly zugriffszweck: {
    readonly zweckCode: BreakGlassZweckCode;
    readonly zaehlerId: string;
    readonly von: string;
    readonly bis: string;
  };
}

/**
 * `read:verbrauch_detail` (break-glass, ADR-0008 §16/D4, Route B) — Roh-
 * Zeitreihe EINES Messkanals inkl. `qualitaet`/`herkunft`. **Deny-by-default**:
 * ohne vollständig aufgelösten, whitelisted Zweck lehnt der PDP mit 403 ab
 * (auch dieser Fall wird auditiert, `stammdaten.verbrauch_detail.einsicht`).
 * Ausschließlich hinter dem zweckgebundenen CTA „Lastgang ansehen"
 * (`MesskanalLastgangDialog`) — NIEMALS automatisch/im Hintergrund aufgerufen
 * (Betriebs-UI-Konzept Punkt 3.4, DS-07-Innensicht).
 */
export async function fetchMesskanalZeitreihe(messkanalId: string, anfrage: MesskanalZeitreiheAnfrage): Promise<MesswertZeitreiheAntwort> {
  const { data, error } = await apiClient.GET('/messwerte/messkanaele/{messkanalId}', {
    params: {
      path: { messkanalId },
      query: { von: anfrage.von, bis: anfrage.bis },
      header: {
        'X-Edms-Zugriffszweck': anfrage.zugriffszweck.zweckCode,
        'X-Edms-Zugriffszweck-Zaehler-Id': anfrage.zugriffszweck.zaehlerId,
        'X-Edms-Zugriffszweck-Von': anfrage.zugriffszweck.von,
        'X-Edms-Zugriffszweck-Bis': anfrage.zugriffszweck.bis,
      },
    },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
