import { useNavigate } from 'react-router-dom';
import {
  EINSPARLAUF_ART_WERTE,
  EINSPARLAUF_AUSLOESER_WERTE,
  toEinsparlaufAnlegenPayload,
  useEinsparlaeufeListe,
  useEinsparlaufAnlegen,
  type EinsparlaufAnlegenFormValues,
} from '../api';
import { enumSelectOptions, kurzId, type EntityFormSelectOption } from '../../stammdaten/components/shared';
import { mutationViewBasis, type MutationViewBasis } from '../../stammdaten/hooks/shared/mutationView';
import { REFERENZ_OPTIONEN_LIMIT, referenzOptionen } from '../../stammdaten/hooks/shared/referenzOptionen';
import { einsparlaufArtLabel, einsparlaufAusloeserLabel } from './nachweisFormat';
import { formatiereZeitpunkt } from '../../../shared/format/datum';

export interface EinsparlaufAnlegenView extends MutationViewBasis {
  /** Bei nicht bestandener Prüfung enthält die Liste NUR `zwischenstand` (D4, fail-closed). */
  readonly artOptionen: readonly EntityFormSelectOption[];
  readonly ausloeserOptionen: readonly EntityFormSelectOption[];
  /** Bereits vorhandene Läufe desselben Förderjahres — Auswahl für „löst ab". */
  readonly vorgaengerOptionen: readonly EntityFormSelectOption[];
  readonly vorgaengerOptionenHinweis: string | undefined;
  readonly submit: (values: EinsparlaufAnlegenFormValues) => void;
}

/**
 * Anzeige-/Aktions-Modell des Formulars „Einspar-Lauf starten".
 *
 * **Die Ketten-Bedingung steckt in `artOptionen`.** Ein Förderjahr-Nachweis
 * setzt eine BESTANDENE Vollständigkeitsprüfung voraus; auf einer nicht
 * bestandenen Prüfung ist nur ein Zwischenstand zulässig. Der Server lehnt
 * die falsche Kombination mit einem Konflikt ab — die Oberfläche bietet sie
 * deshalb gar nicht erst an, statt den Nutzer in einen sicheren Fehlschlag
 * laufen zu lassen.
 */
export function useEinsparlaufAnlegenView(
  foerderjahrId: string,
  preflightId: string,
  preflightIstGruen: boolean,
): EinsparlaufAnlegenView {
  const navigate = useNavigate();
  const mutation = useEinsparlaufAnlegen();
  const vorgaengerQuery = useEinsparlaeufeListe(
    { foerderjahr: foerderjahrId },
    { limit: REFERENZ_OPTIONEN_LIMIT },
  );

  const artWerte = preflightIstGruen
    ? EINSPARLAUF_ART_WERTE
    : EINSPARLAUF_ART_WERTE.filter((wert) => wert !== 'foerderjahr_nachweis');

  const vorgaenger = referenzOptionen(vorgaengerQuery, (lauf) => ({
    value: lauf.id,
    label: `${kurzId(lauf.id)} · ${einsparlaufArtLabel(lauf.art)} · ${formatiereZeitpunkt(lauf.erstelltAt)}`,
  }));

  return {
    ...mutationViewBasis(mutation),
    artOptionen: enumSelectOptions(artWerte, einsparlaufArtLabel),
    ausloeserOptionen: enumSelectOptions(EINSPARLAUF_AUSLOESER_WERTE, einsparlaufAusloeserLabel),
    vorgaengerOptionen: vorgaenger.optionen,
    vorgaengerOptionenHinweis: vorgaenger.hinweis,
    submit: (values) => {
      mutation.mutate(toEinsparlaufAnlegenPayload(values, { foerderjahrId, preflightId }), {
        onSuccess: (lauf) => {
          void navigate(`/nachweis/einsparlaeufe/${lauf.id}`);
        },
      });
    },
  };
}
