import type { ReactNode } from 'react';
import { useNutzerinfoBerichtView } from '../hooks/useNutzerinfoBerichtView';
import { BerichtAnsicht } from './BerichtAnsicht';
import { NutzerinfoDokumentAktion } from './NutzerinfoDokumentAktion';

export interface NutzerinfoBerichtProps {
  readonly informationId: string;
}

/**
 * Der Bericht in der BETRIEBSSICHT: dieselbe Darstellung, die der Endkunde
 * im Portal sieht (`BerichtAnsicht`), plus den Weg zum Kundendokument.
 *
 * Die Trennung ist Absicht. Die Darstellung selbst hat keinen Datenzugriff —
 * so ist ausgeschlossen, dass die Vorschau des Betriebs und die Auskunft an
 * die betroffene Person auseinanderlaufen, obwohl sie über verschiedene Wege
 * geladen werden (Bearer bzw. Portal-Sitzung).
 */
export function NutzerinfoBericht({ informationId }: NutzerinfoBerichtProps): ReactNode {
  const view = useNutzerinfoBerichtView(informationId);

  return <BerichtAnsicht view={view} aktion={<NutzerinfoDokumentAktion informationId={informationId} />} />;
}
