/**
 * Form einer DevEUI: 16 Hex-Zeichen (IEEE EUI-64).
 *
 * Seit das Topic frei konfigurierbar ist (ADR-0011 C1), traegt die
 * Positions-Regel allein nicht mehr: Ein fremdes Template kann die Kennung an
 * anderer Stelle fuehren als hinter `device`, und dann stuende sie
 * unredigiert im Log — genau das verbietet RL-2. Diese Form-Regel greift
 * unabhaengig vom Template.
 */
const DEVEUI_FORM = /^[0-9A-Fa-f]{16}$/;

/**
 * ADR-0005 §14 (D2) — "die DevEUI steht bereits im Topic-String
 * (`device/{devEUI}/event/up`) — unabhängig vom Payload-Body". Der Worker
 * extrahiert die DevEUI NIE aus dem Topic (nur aus dem Payload-Body, §20
 * Schritt 2/§26.6) — aber JEDER Log-/Quarantaene-Bezug auf den Topic-String
 * MUSS das Geraete-/DevEUI-Segment redigieren (RL-2, `ingest.
 * eingang_quarantaene.topic_redacted` ist NOT NULL, V0011).
 *
 * Generisch (nicht auf ein festes Topic-Muster hartkodiert), ZWEI Regeln:
 * ein Pfadsegment unmittelbar hinter `device`, UND jedes Segment in
 * DevEUI-Form. Die zweite Regel kam mit dem konfigurierbaren Topic dazu
 * (ADR-0011 C1) — ohne sie haengt die Redaktion an einem Template, das wir
 * nicht mehr selbst bestimmen.
 */
export function redigiereMqttTopic(topic: string): string {
  const segmente = topic.split('/');

  return segmente
    .map((segment, index) => {
      // Positions-Regel: Segment unmittelbar hinter `device` (ChirpStack-Standard).
      if (index > 0 && segmente[index - 1] === 'device') {
        return '***';
      }
      // Form-Regel: alles, was wie eine DevEUI aussieht — an welcher Stelle auch immer.
      if (DEVEUI_FORM.test(segment)) {
        return '***';
      }
      return segment;
    })
    .join('/');
}
