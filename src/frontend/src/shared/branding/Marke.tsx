import type { ReactElement } from 'react';
import signetUrl from './kit-consulting-signet.svg';
import { t } from '../i18n/t';

/**
 * Die Marke der KIT Consulting GmbH in der Oberfläche.
 *
 * WARUM HIER NICHT DAS VOLLE LOGO STEHT
 * -------------------------------------
 * Die gelieferte Logodatei (`kit-consulting-wortmarke.svg`) trägt den Claim
 * „Kompetenzzentrum für Energie- und Gebäudeeffizienz" unter dem Schriftzug.
 * Bei 419,75 × 70,74 Einheiten ist dieser Claim rund 7,6 Einheiten hoch — er
 * braucht mindestens **440 px Logobreite**, um die Lesbarkeitsgrenze von etwa
 * 8 px Versalhöhe zu erreichen.
 *
 * Die Seitenleiste ist 256 px breit, die Login-Karte 384 px. Bei jeder Größe,
 * die dort hineinpasst, wird der Claim zu einem grauen Streifen. Ein
 * unleserlicher Schriftzug ist schlechter als gar keiner: Er sieht nach einem
 * Darstellungsfehler aus, nicht nach einer Marke.
 *
 * Die Datei zu beschneiden — den Claim wegzuschneiden — wäre der naheliegende
 * Ausweg und genau der falsche: Ein Logo ist eine gestaltete Einheit, und
 * seine Bestandteile im Code zu entfernen ist das, was Markenrichtlinien
 * untersagen. **Die Datei bleibt daher unverändert im Repo** und ist für
 * Ausgaben mit genug Platz gedacht (erzeugte Dokumente, Druck, ≥ 440 px).
 *
 * Für die Oberfläche steht hier stattdessen das **Signet** (unverändert, es
 * trägt bei jeder Größe) neben dem Firmennamen als **Text**. Das ist keine
 * Nachbildung des Logos, sondern eine Nennung — und die ist zudem
 * skalierbar, kontraststark und in jedem Farbschema lesbar.
 *
 * Sobald eine claimfreie Logofassung vorliegt, kann sie das hier ersetzen.
 *
 * BARRIEREFREIHEIT
 * ----------------
 * Das Signet ist `alt=""` und `aria-hidden`: Der Firmenname steht als Text
 * daneben (WCAG 1.1.1 — ein Bild, dessen Aussage der Text schon trägt, ist
 * dekorativ; ein zweiter Accessible Name verdoppelte nur die Ansage).
 * Logotypen sind ausserdem von der Kontrastanforderung ausgenommen
 * (WCAG 1.4.11); der Text daneben ist es nicht und nutzt deshalb die
 * regulären Farbtoken.
 */

export interface SignetProps {
  /** Kantenlänge in Pixeln — das Signet ist quadratisch (viewBox 50 × 50). */
  readonly hoehe: number;
  readonly className?: string;
}

/** Nur das Signet. Grünverlauf, trägt auf hellem wie dunklem Grund. */
export function KitConsultingSignet({ hoehe, className }: SignetProps): ReactElement {
  return (
    <img
      src={signetUrl}
      alt=""
      aria-hidden="true"
      width={hoehe}
      height={hoehe}
      className={className}
      // Bewusst NICHT `loading="lazy"`: Das Zeichen steht ab dem ersten Paint
      // im sichtbaren Bereich; verzögertes Laden erzeugte nur ein Springen.
    />
  );
}

export interface MarkeProps {
  readonly className?: string;
  /** `kompakt` für die Seitenleiste, `gross` für die Anmeldeschranke. */
  readonly groesse?: 'kompakt' | 'gross';
}

/**
 * Signet + Firmenname als Urhebernennung.
 *
 * Der Name steht ausgeschrieben als „KIT Consulting GmbH" — nicht als „KIT".
 * Das Kürzel allein ist vom Karlsruher Institut für Technologie nicht zu
 * unterscheiden, und diese Software wird öffentlich sichtbar sein.
 */
export function KitConsultingMarke({ className, groesse = 'kompakt' }: MarkeProps): ReactElement {
  const kompakt = groesse === 'kompakt';
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <KitConsultingSignet hoehe={kompakt ? 20 : 28} />
      <span className={`font-semibold tracking-tight text-foreground ${kompakt ? 'text-sm' : 'text-base'}`}>
        {t('app.marke.firmenname')}
      </span>
    </span>
  );
}
