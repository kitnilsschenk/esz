/**
 * SA-4 (Phase-5-Security-Review) — Startup-Selbstcheck, ANALOG
 * `IngestBrokerModeConfig` (`config/ingest-broker-mode.config.ts`): das
 * `mqtt`-Paket nutzt intern das `debug`-npm-Modul (`DEBUG`-Umgebungsvariable).
 * Ist ein `mqtt*`-Namespace (oder `*`, was JEDEN Namespace einschliesst)
 * darueber aktiviert, koennen Debug-Logs des MQTT-Clients rohe Topic-/
 * Payload-Fragmente ausgeben und damit die Log-Redaction dieses Adapters
 * (RL-2, `mqtt-topic-redaction.util.ts`) UMGEHEN — bislang NUR als
 * Ops-Runbook-Hinweis im `MqttSubscriberAdapter`-Kommentar dokumentiert,
 * aber nicht technisch verhindert. Dieser Check erzwingt es: fail-closed
 * (wirft), statt sich auf ein Betriebs-Runbook zu verlassen.
 *
 * Bewusst KONSERVATIV (moeglicher False-Positive statt False-Negative):
 * die vollstaendige Namespace-/Negations-Semantik der `debug`-Bibliothek
 * (z. B. `DEBUG=*,-mqtt*` deaktiviert `mqtt*` wieder) wird HIER NICHT
 * nachgebildet — ein Negations-Muster (`-...`) senkt das erkannte Risiko
 * NICHT automatisch, weil die tatsaechliche Reihenfolge-/Ueberlappungs-
 * Auswertung der Bibliothek komplex ist und ein Fehlurteil hier (faelschlich
 * "sicher") sicherheitsrelevanter waere als ein Fehlalarm (faelschlich
 * "riskant", aber leicht durch Entfernen/Praezisieren von `DEBUG` behebbar).
 */
export function mqttDebugEnvIstRiskant(debugEnv: string | undefined): boolean {
  if (debugEnv === undefined || debugEnv.trim().length === 0) {
    return false;
  }

  const muster = debugEnv
    .split(',')
    .map((teil) => teil.trim())
    .filter((teil) => teil.length > 0);

  return muster.some((teil) => {
    if (teil.startsWith('-')) {
      // Negations-Muster — s. Begruendung oben: NICHT risikosenkend gewertet.
      return false;
    }
    const normalisiert = teil.toLowerCase();
    return normalisiert === '*' || normalisiert.startsWith('mqtt') || normalisiert.includes('*mqtt');
  });
}

/**
 * Wirft (fail-closed), wenn `process.env.DEBUG` ein `mqtt*`-Risiko traegt.
 * MUSS vor jedem tatsaechlichen MQTT-Verbindungsaufbau laufen (s. Aufruf in
 * `MqttSubscriberAdapter`s Konstruktor — Nest instanziiert den Adapter beim
 * Aufbau des Objektgraphen, VOR `IngestWorkerRunnerService.start()`).
 */
export function assertKeinMqttDebugLeckrisiko(debugEnv: string | undefined = process.env['DEBUG']): void {
  if (mqttDebugEnvIstRiskant(debugEnv)) {
    throw new Error(
      `DEBUG='${debugEnv}' aktiviert ein mqtt*-Namespace-Muster (oder '*') — die 'debug'-Bibliothek des ` +
        'mqtt-Pakets koennte dadurch rohe Topic-/Payload-Fragmente ausgeben und die RL-2-Log-Redaction ' +
        '(mqtt-topic-redaction.util.ts) umgehen (SA-4, ADR-0005 §22). Fail-closed: Startup abgebrochen — ' +
        'DEBUG muss in produktionsnahen Profilen ungesetzt oder auf ein Nicht-mqtt-Muster beschraenkt bleiben.',
    );
  }
}
