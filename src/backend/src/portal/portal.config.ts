import { Injectable } from '@nestjs/common';

/**
 * Die Adresse, die im Zugangsbrief steht — Dev-Standard.
 *
 * Bewusst der Dev-Wert und kein Startfehler: Eine frische Instanz soll
 * laufen. Ein falscher Wert im Brief ist trotzdem teuer (gedruckt, verschickt,
 * nicht korrigierbar), deshalb steht er in der Ausgabe-Antwort mit drin und
 * `istStandard` sagt dem Betrieb, dass hier noch niemand etwas konfiguriert
 * hat.
 */
const STANDARD_PORTAL_URL = 'http://localhost:5180/portal';

function parsePortalUrl(raw: string | undefined): string {
  const wert = (raw ?? STANDARD_PORTAL_URL).trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(wert);
  } catch {
    throw new Error(`EDMS_PORTAL_URL='${wert}' ist keine gueltige URL — fail-closed.`);
  }

  const istLokal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  if (url.protocol !== 'https:' && !istLokal) {
    // Die Sitzung haengt an einem `__Host-`-Cookie, und das gibt es ohne
    // `Secure` nicht. Eine http-Adresse im Brief fuehrte den Empfaenger also
    // auf eine Seite, auf der die Anmeldung gar nicht funktionieren KANN.
    throw new Error(`EDMS_PORTAL_URL='${wert}' muss https sein (Ausnahme nur localhost) — fail-closed.`);
  }

  return wert;
}

/** Was das Portal über sich selbst wissen muss, um einen Brief drucken zu können. */
@Injectable()
export class PortalConfigService {
  readonly portalUrl: string;
  /** `true`, solange niemand `EDMS_PORTAL_URL` gesetzt hat — Warnhinweis für den Betrieb. */
  readonly istStandardUrl: boolean;

  constructor() {
    const roh = process.env['EDMS_PORTAL_URL'];
    this.portalUrl = parsePortalUrl(roh);
    this.istStandardUrl = roh === undefined || roh.trim().length === 0;
  }
}
