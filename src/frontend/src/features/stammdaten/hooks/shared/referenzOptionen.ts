import type { EntityFormSelectOption } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';

/**
 * Seitengröße der Referenz-Auswahllisten. Das SERVER-Maximum
 * (`.claude/rules/api-contracts.md`: „limit max 100") ist zugleich die
 * Obergrenze dessen, was ein Auswahlfeld hier anbieten kann.
 */
export const REFERENZ_OPTIONEN_LIMIT = 100;

/** Der Ausschnitt eines `useInfiniteQuery`-Ergebnisses, den `referenzOptionen` liest. */
export interface ReferenzQuelle<TItem> {
  readonly data: { readonly pages: readonly { readonly daten: readonly TItem[] }[] } | undefined;
  readonly hasNextPage: boolean;
}

export interface ReferenzOptionen {
  readonly optionen: readonly EntityFormSelectOption[];
  /**
   * `true`, wenn der Server noch weitere Seiten hätte — die Auswahl ist dann
   * UNVOLLSTÄNDIG. Aufrufer reichen `hinweis` als `hint` ans Formularfeld
   * durch, damit die Lücke sichtbar wird.
   */
  readonly istGekuerzt: boolean;
  /** Sichtbarer Hinweistext bei gekürzter Liste, sonst `undefined`. */
  readonly hinweis: string | undefined;
}

/**
 * Baut die Optionsliste eines Fremdschlüssel-Auswahlfelds (Endkunde, System,
 * Anschlussnutzer) aus einer Cursor-paginierten Listen-Query.
 *
 * **Warum es diesen Helfer gibt:** Sechs Auswahlfelder lasen zuvor
 * `query.data?.pages[0]?.daten` — also ausschließlich die ERSTE Seite. Ab dem
 * 101. Datensatz war der gesuchte Eintrag schlicht nicht wählbar, ohne dass
 * die Oberfläche das irgendwo erwähnte: eine stille Sackgasse mitten in einer
 * Anlegen-Maske. Hier wird jetzt (a) über ALLE geladenen Seiten geflacht und
 * (b) eine Kürzung über `istGekuerzt`/`hinweis` sichtbar gemacht.
 *
 * Das ist eine MILDERUNG, keine Lösung: Solange die Listen-Endpunkte keinen
 * Suchparameter anbieten (`?suche=`), bleibt der 101. Eintrag unerreichbar —
 * der Nutzer weiß es jetzt nur. Die eigentliche Behebung braucht eine
 * Backend-Erweiterung + ein Combobox-Feld mit serverseitigem Typeahead.
 */
export function referenzOptionen<TItem>(
  quelle: ReferenzQuelle<TItem>,
  toOption: (item: TItem) => EntityFormSelectOption,
): ReferenzOptionen {
  const optionen = (quelle.data?.pages ?? []).flatMap((seite) => seite.daten).map(toOption);
  const istGekuerzt = quelle.hasNextPage;

  return {
    optionen,
    istGekuerzt,
    hinweis: istGekuerzt ? t('stammdaten.common.form.referenzListeGekuerzt') : undefined,
  };
}
