import type { ErwarteterMesskanal } from '@edms/shared';
import { useGeraetetypKatalog } from '../../api/zaehler';
import { useMesskanaeleListe, useMesskanalAnlegen } from '../../api/messkanal';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';
import { t } from '../../../../shared/i18n/t';

export interface ErwarteterKanalView {
  readonly key: string;
  readonly messgroesse: string;
  readonly einheit: string;
  readonly art: ErwarteterMesskanal['art'];
  readonly beschreibung: string;
  readonly artLabel: string;
  /** `true`, wenn am Zähler bereits ein passender Kanal existiert. */
  readonly istAngelegt: boolean;
}

export interface ErwarteteKanaeleView extends MutationViewBasis {
  readonly isPending: boolean;
  /** `true`, wenn der Gerätetyp dem System unbekannt ist — dann kommen von ihm keine Messwerte an. */
  readonly geraetetypUnbekannt: boolean;
  /** `true`, wenn der Typ bekannt ist, aber keine feste Kanal-Vorlage führt. */
  readonly ohneVorlage: boolean;
  readonly kanaele: readonly ErwarteterKanalView[];
  readonly alleAngelegt: boolean;
  readonly anlegen: (kanal: ErwarteterKanalView) => void;
}

/**
 * Vergleicht, welche Messkanäle der Gerätetyp eines Zählers liefern WIRD, mit
 * denen, die tatsächlich angelegt sind.
 *
 * **Warum es diesen Abgleich braucht:** `messgroesse` und `einheit` sind
 * Freitextfelder. Wer „Wirkarbeit" groß schreibt oder „kwh" tippt, legt einen
 * Kanal an, der nie befüllt wird — die Uplinks landen in der Quarantäne
 * (`kanal_unbekannt`/`einheit_inkonsistent`), und zwar erst, nachdem das
 * Gerät montiert ist. Der Abgleich hier dreht das um: Er sagt VORHER, was
 * gebraucht wird, und legt es auf Wunsch zeichengenau an.
 *
 * **Der Vergleich ist absichtlich streng** (Gleichheit über Messgröße,
 * Einheit und Art). Ein toleranter Vergleich würde „kwh" als vorhanden
 * melden — und genau dieser Kanal bekäme nie einen Wert.
 */
export function useErwarteteKanaeleView(zaehlerId: string, geraetetyp: string | undefined): ErwarteteKanaeleView {
  const katalog = useGeraetetypKatalog();
  const vorhandene = useMesskanaeleListe({ zaehlerId });
  const mutation = useMesskanalAnlegen();

  const eintrag =
    geraetetyp === undefined
      ? undefined
      : katalog.data?.daten.find((k) => k.geraetetyp.trim().toLowerCase() === geraetetyp.trim().toLowerCase());

  const angelegte = (vorhandene.data?.pages ?? []).flatMap((seite) => seite.daten);

  const kanaele: readonly ErwarteterKanalView[] = (eintrag?.erwarteteKanaele ?? []).map((erwartet) => ({
    key: `${erwartet.messgroesse}:${erwartet.einheit}:${erwartet.art}`,
    messgroesse: erwartet.messgroesse,
    einheit: erwartet.einheit,
    art: erwartet.art,
    beschreibung: erwartet.beschreibung,
    artLabel: t(`stammdaten.common.enums.messgroesseArt.${erwartet.art}`),
    istAngelegt: angelegte.some(
      (kanal) =>
        kanal.messgroesse === erwartet.messgroesse && kanal.einheit === erwartet.einheit && kanal.art === erwartet.art,
    ),
  }));

  return {
    ...mutationViewBasis(mutation, t('stammdaten.zaehler.erwarteteKanaele.anlegenErfolg')),
    isPending: katalog.isPending || vorhandene.isPending,
    geraetetypUnbekannt: !katalog.isPending && geraetetyp !== undefined && eintrag === undefined,
    ohneVorlage: eintrag !== undefined && eintrag.erwarteteKanaele.length === 0,
    kanaele,
    alleAngelegt: kanaele.length > 0 && kanaele.every((kanal) => kanal.istAngelegt),
    anlegen: (kanal) => {
      mutation.mutate({
        zaehlerId,
        messgroesse: kanal.messgroesse,
        einheit: kanal.einheit,
        art: kanal.art,
        // Die Geraetetyp-Vorlage kennt die Messstellen-Topologie nicht — sie
        // beschreibt das GERAET, nicht seinen Einbau. Ein aus ihr angelegter
        // Kanal gilt daher als Hauptmessung; wer ihn als Untermessung fuehrt,
        // setzt das anschliessend am Kanal (V0058).
        istUntermessung: false,
        // Aus demselben Grund `bezug`: Die Vorlage beschreibt das Geraet, nicht
        // seine Einbaurichtung. Ein Einspeisezaehler wird anschliessend am
        // Kanal umgestellt (V0074).
        richtung: 'bezug',
      });
    },
  };
}
