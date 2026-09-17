import type { GeraetAnbindung } from '@edms/shared';
import {
  toGeraetZuordnungDevEui,
  useGeraetZuordnungAnlegen,
  useGeraetZuordnungDeaktivieren,
  type GeraetAnbindenFormValues,
} from '../../api/geraetZuordnung';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';
import { t } from '../../../../shared/i18n/t';

export interface GeraetAnbindungAnlegenView extends MutationViewBasis {
  readonly anbinden: (values: GeraetAnbindenFormValues) => void;
}

/**
 * Anzeige-/Aktions-Modell für „Gerät anbinden".
 *
 * Ohne `erfolgsMeldung`: Die Ansicht bleibt stehen, aber die Rückmeldung ist
 * sichtbarer als jeder Text — der Abschnitt wechselt von der Eingabemaske auf
 * „angebunden seit …", sobald die invalidierte Zähler-Abfrage zurück ist.
 */
export function useGeraetAnbindungAnlegenView(zaehlerId: string): GeraetAnbindungAnlegenView {
  const mutation = useGeraetZuordnungAnlegen();

  return {
    ...mutationViewBasis(mutation),
    anbinden: (values) => {
      mutation.mutate({ zaehlerId, devEui: toGeraetZuordnungDevEui(values) });
    },
  };
}

export interface GeraetAnbindungBeendenView extends MutationViewBasis {
  readonly beenden: () => void;
}

/** Anzeige-/Aktions-Modell für „Anbindung beenden" (idempotent). */
export function useGeraetAnbindungBeendenView(zaehlerId: string, geraetZuordnungId: string): GeraetAnbindungBeendenView {
  const mutation = useGeraetZuordnungDeaktivieren();

  return {
    ...mutationViewBasis(mutation, t('stammdaten.geraetAnbindung.detail.beendenErfolg')),
    beenden: () => {
      mutation.mutate({ zaehlerId, geraetZuordnungId });
    },
  };
}

export interface GeraetAnbindungAnzeige {
  readonly istAngebunden: boolean;
  readonly geraetZuordnungId: string | undefined;
  readonly statusLabel: string;
  readonly angebundenSeitLabel: string;
}

/**
 * Bereitet das `geraetAnbindung`-Feld des Zählers für die Anzeige auf.
 *
 * `null` heißt „derzeit keine aktive Zuordnung" — nicht „nie eine gehabt".
 * Historie gibt die Schnittstelle bewusst nicht heraus, und die Oberfläche
 * erfindet sie nicht.
 */
export function geraetAnbindungAnzeige(anbindung: GeraetAnbindung | null): GeraetAnbindungAnzeige {
  if (anbindung === null) {
    return {
      istAngebunden: false,
      geraetZuordnungId: undefined,
      statusLabel: t('stammdaten.geraetAnbindung.detail.nichtAngebunden'),
      angebundenSeitLabel: '',
    };
  }

  return {
    istAngebunden: anbindung.status === 'aktiv',
    geraetZuordnungId: anbindung.id,
    statusLabel: t(`stammdaten.geraetAnbindung.enums.status.${anbindung.status}`),
    angebundenSeitLabel: formatiereZeitpunkt(anbindung.gueltigVon),
  };
}
