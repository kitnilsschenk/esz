import type { Einwilligung, Erlaubnismodus, SubjektTyp, Widerspruch } from '@edms/shared';
import { formatiereZeitpunkt } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../../stammdaten/hooks/shared/mutationView';
import {
  useConsentStand,
  useEinwilligungErteilen,
  useEinwilligungWiderrufen,
  useWiderspruchErklaeren,
  useWiderspruchZuruecknehmen,
  useWidersprueche,
} from '../api';

/** Eine Zeile der Consent-Übersicht — ein Zweck mit seinem Stand. */
export interface ZweckStandView {
  readonly zweckCode: string;
  readonly bezeichnung: string;
  /**
   * Ob die Verweigerung dieses Zwecks die Leistung kostet. Die Oberfläche
   * benennt das ausdrücklich: Art. 7 Abs. 4 DSGVO verlangt, dass eine
   * betroffene Person erkennen kann, was von ihrer Antwort abhängt.
   */
  readonly verweigerbar: boolean;
  /**
   * Ob dieser Zweck überhaupt auf einer Einwilligung beruht (Art. 6 Abs. 1
   * lit. a) — und nicht auf dem Vertrag (lit. b).
   *
   * Die Ansicht braucht das getrennt von `verweigerbar`: Ein Zweck, der für
   * die Leistung erforderlich ist, ist nicht "eine Einwilligung, die man
   * nicht verweigern kann" — eine solche wäre nach Art. 7 Abs. 4 gar keine
   * Einwilligung. Er beruht schlicht auf einer anderen Grundlage.
   */
  readonly beruhtAufEinwilligung: boolean;
  /**
   * Aus der Matrix bestimmt (A12-1), nicht gewählt. Die Ansicht ZEIGT sie —
   * eine Grundlage, die der Bediener nicht sieht, kann er auch nicht
   * hinterfragen.
   */
  readonly rechtsgrundlageLabel: string;
  readonly begruendung: string;
  /** Nur bei `opt_in` gibt es überhaupt etwas zu erfassen. */
  readonly erteilbar: boolean;
  readonly erlaubnismodus: Erlaubnismodus;
  readonly statusLabel: string;
  readonly istWirksam: boolean;
  /** `undefined`, solange keine wirksame Einwilligung besteht. */
  readonly wirksameId: string | undefined;
  readonly detailLabel: string | undefined;
  readonly verlauf: readonly VerlaufEintragView[];

  /**
   * Ob gegen DIESEN Zweck ueberhaupt widersprochen werden kann — genau dann,
   * wenn er NICHT auf einer Einwilligung beruht (`opt_out`/`vertraglich`).
   *
   * Das ist die exakte Umkehrung von `erteilbar`, und das ist kein Zufall:
   * Die beiden Rechte schliessen einander aus. Gegen eine Verarbeitung, die
   * nur mit Einwilligung laeuft, widerspricht man nicht — man widerruft
   * (Art. 7 Abs. 3). Die Datenbank haelt dieselbe Grenze ueber einen
   * zusammengesetzten Fremdschluessel auf (V0052).
   */
  readonly widersprechbar: boolean;
  /** `true`, solange ein Widerspruch wirksam ist (nicht zurueckgenommen). */
  readonly widerspruchWirksam: boolean;
  /** `undefined`, solange kein wirksamer Widerspruch besteht. */
  readonly wirksamerWiderspruchId: string | undefined;
  /** Seit wann widersprochen ist — der Zeitpunkt der ERKLAERUNG. */
  readonly widerspruchDetailLabel: string | undefined;
  readonly widerspruchVerlauf: readonly WiderspruchVerlaufView[];
}

export interface WiderspruchVerlaufView {
  readonly id: string;
  readonly erklaertLabel: string;
  readonly zurueckgenommenLabel: string | undefined;
  readonly erfassungswegLabel: string;
  readonly quelleRefLabel: string | undefined;
}

export interface VerlaufEintragView {
  readonly id: string;
  readonly fassung: string;
  readonly erteiltLabel: string;
  readonly widerrufenLabel: string | undefined;
  readonly rechtsgrundlageLabel: string;
  readonly erfassungswegLabel: string;
  /** Fundstelle des Dokuments — macht den Verlauf nachprüfbar statt nur lesbar. */
  readonly quelleRefLabel: string | undefined;
}

/**
 * Die Angaben, die eine NACHGETRAGENE Erklärung belegbar machen (A12-27/28).
 * Ohne sie behauptete der Nachweis den Erfassungstag statt des
 * Erklärungstags — und das systematisch, weil das Nachtragen der Regelfall
 * dieser Oberfläche ist.
 */
export interface ErklaerungAngaben {
  /** Tag der Erklärung, `YYYY-MM-DD` aus einem Datumsfeld. */
  readonly erklaertAm: string;
  readonly quelleRef: string;
}

export interface ConsentStandView extends MutationViewBasis {
  readonly zwecke: readonly ZweckStandView[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly erteile: (zweckCode: string, angaben: ErklaerungAngaben) => void;
  readonly widerrufe: (einwilligungId: string, angaben: ErklaerungAngaben) => void;
  readonly widersprich: (zweckCode: string, angaben: ErklaerungAngaben) => void;
  readonly nimmWiderspruchZurueck: (widerspruchId: string, angaben: ErklaerungAngaben) => void;
  /** Damit nur die betroffene Zeile sperrt und nicht die ganze Tabelle. */
  readonly laufenderZweck: string | undefined;
}

/**
 * Ein Datumsfeld liefert `YYYY-MM-DD` ohne Uhrzeit. Der Server erwartet einen
 * Zeitpunkt.
 *
 * Genommen wird **Tagesbeginn UTC**, nicht die aktuelle Uhrzeit: Belegt ist
 * der TAG der Unterschrift, nicht die Minute. Eine mitgeschriebene Uhrzeit
 * wäre erfunden — und läge bei einem heute unterschriebenen, heute erfassten
 * Vorgang womöglich sogar in der Zukunft, was der Server zu Recht abweist.
 */
function alsZeitpunkt(tag: string): string {
  return new Date(`${tag}T00:00:00.000Z`).toISOString();
}

function verlaufEintrag(eintrag: Einwilligung): VerlaufEintragView {
  return {
    id: eintrag.id,
    fassung: eintrag.fassung,
    erteiltLabel: formatiereZeitpunkt(eintrag.erteiltAt),
    widerrufenLabel: eintrag.widerrufenAt === null ? undefined : formatiereZeitpunkt(eintrag.widerrufenAt),
    quelleRefLabel: eintrag.quelleRef ?? undefined,
    rechtsgrundlageLabel: t(`consent.rechtsgrundlage.${eintrag.rechtsgrundlage}`),
    erfassungswegLabel: t(`consent.erfassungsweg.${eintrag.erfassungsweg}`),
  };
}

function widerspruchEintrag(eintrag: Widerspruch): WiderspruchVerlaufView {
  return {
    id: eintrag.id,
    erklaertLabel: formatiereZeitpunkt(eintrag.erklaertAt),
    zurueckgenommenLabel:
      eintrag.zurueckgenommenAt === null ? undefined : formatiereZeitpunkt(eintrag.zurueckgenommenAt),
    erfassungswegLabel: t(`consent.erfassungsweg.${eintrag.erfassungsweg}`),
    quelleRefLabel: eintrag.quelleRef ?? undefined,
  };
}

/**
 * Der Consent-Stand eines Subjekts, anzeigefertig.
 *
 * Führt bewusst AUCH die Zwecke ohne Einwilligung — das kommt so vom Server
 * (ADR-0012 E11) und wird hier nicht weggefiltert: „Hierzu wurde nie
 * eingewilligt" ist eine Aussage, die eine Auskunft nach Art. 15 DSGVO
 * treffen muss, keine Leerstelle, die man aus dem Fehlen einer Zeile erraten
 * soll.
 */
export function useConsentStandView(subjektTyp: SubjektTyp, subjektId: string): ConsentStandView {
  const query = useConsentStand(subjektTyp, subjektId);
  const widerspruchQuery = useWidersprueche(subjektTyp, subjektId);
  const erteilenMutation = useEinwilligungErteilen();
  const widerrufenMutation = useEinwilligungWiderrufen();
  const widersprechenMutation = useWiderspruchErklaeren();
  const ruecknahmeMutation = useWiderspruchZuruecknehmen();

  const zwecke: readonly ZweckStandView[] = (query.data?.zwecke ?? []).map((zweck) => {
    const wirksam = zweck.wirksameEinwilligung;
    // Der Server liefert die Widersprueche als eine Liste ueber alle Zwecke —
    // getrennt vom Consent-Stand, weil ein Widerspruch kein Zustand einer
    // Einwilligung ist. Zusammengefuehrt wird erst hier, je Zweck.
    const widersprueche = (widerspruchQuery.data ?? []).filter((w) => w.zweckCode === zweck.zweckCode);
    const wirksamerWiderspruch = widersprueche.find((w) => w.wirksam);
    const widersprechbar = zweck.erlaubnismodus !== 'opt_in';
    return {
      zweckCode: zweck.zweckCode,
      bezeichnung: zweck.bezeichnung,
      verweigerbar: zweck.verweigerbar,
      beruhtAufEinwilligung: zweck.rechtsgrundlage === 'einwilligung_art6_1a',
      rechtsgrundlageLabel: t(`consent.rechtsgrundlage.${zweck.rechtsgrundlage}`),
      begruendung: zweck.begruendung,
      erlaubnismodus: zweck.erlaubnismodus,
      erteilbar: zweck.erlaubnismodus === 'opt_in',
      istWirksam: wirksam !== null,
      // „Keine Einwilligung" an einem Zweck, der auf dem Vertrag beruht, ist
      // dieselbe Verwechslung wie der frühere Hinweistext: Dort FEHLT nichts.
      // Ein wirksamer Widerspruch steht VOR allem anderen. Stuende hier
      // weiter „Gilt vertraglich", behauptete die Ansicht eine laufende
      // Verarbeitung, der die betroffene Person widersprochen hat — und
      // genau danach richtet sich, wer als Naechstes auf diese Zeile schaut.
      statusLabel:
        wirksamerWiderspruch !== undefined
          ? t('consent.status.widersprochen')
          : wirksam !== null
            ? t('consent.status.erteilt')
            : zweck.rechtsgrundlage === 'einwilligung_art6_1a'
              ? t('consent.status.keine')
              : t('consent.status.giltVertraglich'),
      wirksameId: wirksam?.id,
      detailLabel:
        wirksam === null
          ? undefined
          : t('consent.stand.seitFassung')
              .replace('{seit}', formatiereZeitpunkt(wirksam.erteiltAt))
              .replace('{fassung}', wirksam.fassung),
      verlauf: zweck.verlauf.map(verlaufEintrag),
      widersprechbar,
      widerspruchWirksam: wirksamerWiderspruch !== undefined,
      wirksamerWiderspruchId: wirksamerWiderspruch?.id,
      widerspruchDetailLabel:
        wirksamerWiderspruch === undefined
          ? undefined
          : t('consent.stand.widersprochenSeit').replace(
              '{seit}',
              formatiereZeitpunkt(wirksamerWiderspruch.erklaertAt),
            ),
      widerspruchVerlauf: widersprueche.map(widerspruchEintrag),
    };
  });

  // ALLE vier Mutationen teilen sich EINE Statuszeile: Es kann immer nur eine
  // laufen (die Knöpfe sperren währenddessen), und vier Meldungen
  // nebeneinander wären für den Bediener nur Rauschen. Die Reihenfolge
  // entscheidet, WELCHE angezeigt wird — genommen wird die einzige, die
  // gerade etwas zu sagen hat.
  const kandidaten = [
    { mutation: erteilenMutation, meldung: t('consent.stand.erteiltErfolg') },
    { mutation: widerrufenMutation, meldung: t('consent.stand.widerrufenErfolg') },
    { mutation: widersprechenMutation, meldung: t('consent.stand.widersprochenErfolg') },
    { mutation: ruecknahmeMutation, meldung: t('consent.stand.widerspruchZurueckgenommenErfolg') },
  ];
  const aktiv =
    kandidaten.find((k) => k.mutation.isPending || k.mutation.isError || k.mutation.isSuccess) ?? kandidaten[0]!;

  return {
    ...mutationViewBasis(aktiv.mutation, aktiv.meldung),
    zwecke,
    isPending: query.isPending || widerspruchQuery.isPending,
    // Der Widerspruchs-Verlauf gehört zur Aussage dieser Ansicht. Fiele er
    // still aus, stünde an einem Zweck weiter „Gilt vertraglich", obwohl
    // widersprochen wurde — lieber die ganze Ansicht als Fehler ausweisen.
    isError: query.isError || widerspruchQuery.isError,
    erteile: (zweckCode, angaben) => {
      erteilenMutation.mutate({
        subjektTyp,
        subjektId,
        zweckCode,
        erteiltAt: alsZeitpunkt(angaben.erklaertAm),
        quelleRef: angaben.quelleRef,
        // Die Betriebssicht traegt IMMER nach — ein digitales Opt-in kann
        // sie nicht erfassen, weil die dabei zu protokollierende IP die des
        // Bearbeiters waere (ADR-0012 E9). Der Server weist es ohnehin ab;
        // die Oberflaeche bietet es gar nicht erst an.
        erfassungsweg: 'vertrag_schriftlich',
      });
    },
    widerrufe: (einwilligungId, angaben) => {
      widerrufenMutation.mutate({
        einwilligungId,
        subjektTyp,
        subjektId,
        eingabe: {
          widerrufenAt: alsZeitpunkt(angaben.erklaertAm),
          // Die Oberfläche bietet den digitalen Weg nicht an (E9); der
          // schriftliche ist der einzige, den ein Nachtrag belegen kann.
          erfassungsweg: 'vertrag_schriftlich',
          quelleRef: angaben.quelleRef,
        },
      });
    },
    widersprich: (zweckCode, angaben) => {
      widersprechenMutation.mutate({
        subjektTyp,
        subjektId,
        zweckCode,
        erklaertAt: alsZeitpunkt(angaben.erklaertAm),
        // Wie bei Einwilligung und Widerruf: Die Betriebssicht trägt IMMER
        // nach. Ein `digital_opt_in` würde die IP des BEARBEITERS als die
        // der betroffenen Person protokollieren — ein erfundener Nachweis
        // ist schlimmer als ein fehlender (`erklaerung.policy.ts`).
        erfassungsweg: 'vertrag_schriftlich',
        quelleRef: angaben.quelleRef,
      });
    },
    nimmWiderspruchZurueck: (widerspruchId, angaben) => {
      ruecknahmeMutation.mutate({
        widerspruchId,
        subjektTyp,
        subjektId,
        eingabe: {
          zurueckgenommenAt: alsZeitpunkt(angaben.erklaertAm),
          erfassungsweg: 'vertrag_schriftlich',
          quelleRef: angaben.quelleRef,
        },
      });
    },
    laufenderZweck:
      erteilenMutation.isPending && erteilenMutation.variables !== undefined
        ? erteilenMutation.variables.zweckCode
        : widersprechenMutation.isPending && widersprechenMutation.variables !== undefined
          ? widersprechenMutation.variables.zweckCode
          : undefined,
  };
}
