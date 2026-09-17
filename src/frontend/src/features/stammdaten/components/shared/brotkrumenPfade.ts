import type { Brotkrume } from '../../../../shared/routing/brotkrumenStore';
import { t } from '../../../../shared/i18n/t';
import { kurzId } from './kurzId';

/**
 * Bausteine für die wiederkehrenden Vorfahren-Glieder eines
 * Brotkrumenpfads. Jede Seite setzt ihren Pfad selbst zusammen
 * (`useBrotkrumen([...])`) — diese Fabriken sorgen nur dafür, dass die
 * Labels und Ziele der oberen Ebenen an EINER Stelle stehen und nicht in
 * zwanzig Seiten getippt werden.
 *
 * Die Labels sind absichtlich DIESELBEN wie in der Navigation
 * (`nav.stammdaten.*`): Wer über den Nav-Eintrag „Zähler & Messkanäle"
 * einsteigt, soll dieses Wort im Pfad wiederfinden — nicht ein Synonym.
 *
 * **Kein Klartext-PII.** Für Endkunde und Anschlussnutzer steht die Kurz-ID
 * im Pfad, nie der Name (s. `useBrotkrumen`-Doku).
 */
export const brotkrume = {
  endkundenListe: (): Brotkrume => ({ label: t('nav.stammdaten.endkunden'), to: '/stammdaten/endkunden' }),
  endkunde: (endkundeId: string): Brotkrume => ({
    label: kurzId(endkundeId),
    to: `/stammdaten/endkunden/${endkundeId}`,
  }),

  systemeListe: (): Brotkrume => ({ label: t('nav.stammdaten.systemgrenzen'), to: '/stammdaten/systeme' }),
  system: (systemId: string): Brotkrume => ({ label: kurzId(systemId), to: `/stammdaten/systeme/${systemId}` }),

  zaehlerListe: (): Brotkrume => ({ label: t('nav.stammdaten.zaehlerMesskanaele'), to: '/stammdaten/zaehler' }),
  zaehler: (zaehlerId: string): Brotkrume => ({ label: kurzId(zaehlerId), to: `/stammdaten/zaehler/${zaehlerId}` }),

  anschlussnutzerListe: (): Brotkrume => ({
    label: t('nav.stammdaten.anschlussnutzer'),
    to: '/stammdaten/anschlussnutzer',
  }),

  nutzungsverhaeltnisseListe: (): Brotkrume => ({
    label: t('nav.stammdaten.vertraegeUndNutzung'),
    to: '/stammdaten/nutzungsverhaeltnisse',
  }),

  /** Letztes Glied — die aktuelle Seite, bewusst ohne `to`. */
  aktuell: (label: string): Brotkrume => ({ label }),
} as const;
