import { useIngestQuelleAendern } from '../../api/ingestQuelle';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';
import { t } from '../../../../shared/i18n/t';

export interface QuelleStatusAktionView extends MutationViewBasis {
  readonly umschalten: (quelleId: string, istAktiv: boolean) => void;
}

/**
 * Aktivieren und Deaktivieren einer Datenquelle.
 *
 * **Es gibt bewusst kein Löschen.** Die Kennung einer Quelle steht in
 * Quarantäne-Zeilen und im Herkunfts-Abgleich; ein Entfernen ließe die dort
 * ins Leere zeigen. Deaktivieren ist die Handlung, die tatsächlich gemeint
 * ist: Ein Worker, dessen Quelle inaktiv ist, startet nicht mehr.
 *
 * Weil das die Datenaufnahme stilllegt, gibt es hier eine ausdrückliche
 * Erfolgsmeldung — die Ansicht bleibt nach der Aktion stehen, und ohne
 * Rückmeldung wäre für den Bedienenden nicht erkennbar, ob etwas geschah.
 */
export function useQuelleStatusAktion(): QuelleStatusAktionView {
  const mutation = useIngestQuelleAendern();

  return {
    umschalten: (quelleId, istAktiv) => {
      mutation.mutate({ quelleId, body: { status: istAktiv ? 'inaktiv' : 'aktiv' } });
    },
    ...mutationViewBasis(mutation, t('stammdaten.ingestQuelle.tabelle.statusErfolg')),
  };
}
