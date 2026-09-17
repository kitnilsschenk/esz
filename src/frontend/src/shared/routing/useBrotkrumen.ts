import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { loescheBrotkrumen, setzeBrotkrumen, type Brotkrume } from './brotkrumenStore';

/**
 * Meldet den Brotkrumenpfad DIESER Seite an (`app/Brotkrumen.tsx` rendert
 * ihn im Seitenrahmen).
 *
 * Bewusst „jede Seite meldet ihren Pfad selbst" statt „aus der Route
 * ableiten": Eine Ableitung bräuchte eine zweite Segment→Label-Tabelle neben
 * der Navigation, die bei jeder neuen Route mitgepflegt werden müsste — und
 * sie käme an dynamische Bestandteile (Versionsnummer, Kurz-ID) ohnehin nicht
 * heran, ohne die Daten der Seite zu kennen. Die Seite weiß beides bereits.
 *
 * **Kein Klartext-PII in den Krumen.** Für personenbezogene Entitäten
 * (Endkunde, Anschlussnutzer) steht die Kurz-ID im Pfad, nie der Name: Der
 * Brotkrumenpfad ist dauerhaft sichtbarer Seitenrahmen und stünde sonst auf
 * jeder Unterseite mit, ohne dass er dort gebraucht würde (Art. 5 DSGVO,
 * Datenminimierung — dieselbe Linie wie `PiiMaskedField`).
 *
 * Der Aufrufer übergibt eine STABILE Referenz oder akzeptiert, dass der
 * Effekt bei jedem Render neu läuft — `krumen` wird dafür serialisiert
 * verglichen, ein neu erzeugtes Array je Render löst also keine Endlosschleife
 * aus.
 */
export function useBrotkrumen(krumen: readonly Brotkrume[]): void {
  const { pathname } = useLocation();
  // Serialisiert statt per Referenz: Aufrufer bauen ihr Krumen-Array
  // üblicherweise inline (`[{ label: … }, …]`), also bei jedem Render neu.
  const signatur = JSON.stringify(krumen);

  useEffect(() => {
    setzeBrotkrumen(pathname, JSON.parse(signatur) as readonly Brotkrume[]);
    return () => {
      loescheBrotkrumen(pathname);
    };
  }, [pathname, signatur]);
}
