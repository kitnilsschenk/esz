import { DWD_AENDERUNGSVERMERK, DWD_QUELLENVERMERK } from '../../berechnung/klima/dwd-quellenvermerk.const';
import type { NutzerinfoBericht } from '../nutzerinfo.types';

/**
 * Eine Seite der Mappe: der Bericht plus die beiden Angaben, die der Bericht
 * selbst nicht kennt.
 */
export interface DokumentSeite {
  readonly bericht: NutzerinfoBericht;
  /**
   * `true`, wenn in den Berechnungslauf dieser Information tatsächlich
   * DWD-Klimadaten eingegangen sind. Steuert den Quellenvermerk (Auflage
   * A-2) — bei synthetischem Klima wäre er eine Falschangabe.
   */
  readonly klimaAusDwd: boolean;
}

const MONATSNAMEN = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const;

const ENERGIETRAEGER_NAMEN: Readonly<Record<string, string>> = {
  strom: 'Strom',
  gas: 'Gas',
  waerme: 'Wärme',
  fernwaerme: 'Fernwärme',
  oel: 'Heizöl',
};

/**
 * Rendert die monatliche Nutzerinformation als druckfertiges Dokument
 * (TB-06, [Q3] Kap. 6).
 *
 * **Warum HTML und nicht PDF.** Ein PDF-Erzeuger wäre eine neue
 * Produktivabhängigkeit und damit nach `.claude/rules/dependencies.md` vor
 * der Installation lizenz- und freigabepflichtig — für ein Dokument, das der
 * Browser mit „Drucken → Als PDF sichern" ohnehin erzeugt, und zwar mit
 * einer Schriftdarstellung, die der Betrieb kennt. Das Dokument ist
 * vollständig eigenständig: kein Skript, kein Bild, keine externe Schrift,
 * kein Netzzugriff beim Öffnen. Es lässt sich archivieren, weiterreichen und
 * per Post versenden.
 *
 * **Warum eine Mappe statt einzelner Dateien.** Postversand heißt: einmal
 * drucken, kuvertieren, absenden. 200 Einzeldateien nacheinander zu öffnen
 * ist kein Arbeitsablauf. Jede Information beginnt deshalb auf einer neuen
 * Seite (`page-break-before`), und der Kopf der Mappe sagt, für welchen
 * Monat und über wie viele Kunden sie geht.
 *
 * **Sprache.** Das Dokument geht an einen Endkunden, nicht an den Betrieb.
 * Es steht darin kein „Berechnungslauf", keine „Qualitätsstufe" und kein
 * „mvet". Was der Betrieb zum Wiederfinden braucht (Kennung, Prüfsumme),
 * steht klein in der Fußzeile — dort stört es nicht und belegt trotzdem,
 * welche Fassung der Kunde bekommen hat.
 *
 * **Deterministisch.** Gleiche Eingabe → gleiches Byte-Ergebnis. Kein
 * Zeitstempel des Rendervorgangs, keine Zufallskennungen. Nur so trägt der
 * Hash-Vergleich aus V0054 („kein Byte-Archiv, sondern deterministisches
 * Re-Rendering") auch für das Dokument.
 *
 * **Der Portal-Hinweis und `inhalt_hash`.** Jede Seite trägt seit dieser
 * Änderung einen Verweis auf das Nutzerportal (TB-06: Die monatliche
 * Information muss dem Opt-out einen Weg geben, und ohne diesen Hinweis
 * erfährt der Endkunde nie, dass es das Portal gibt). Das ist bewusst KEINE
 * neue Dokument-Fassung im Sinne von V0054/ADR-0007 B14: `inhalt_hash` wird
 * dort ausschließlich über die eingefrorenen ZAHLEN gebildet
 * (`bildeInhaltHash` in `nutzerinformation.service.ts` — Endkunde, Energie-
 * träger, Monat, Berechnungslauf, Referenz-/Ist-/Delta-kWh, Qualitätsstufe),
 * NICHT über das gerenderte HTML. Anders als beim Nachweis-Export
 * (`nachweis-export.service.ts`, `schema_version` + Re-Render-Hash-Vergleich
 * beim Download) gibt es hier keinen Re-Render-Vergleich gegen einen
 * gespeicherten Dokument-Hash — der Bericht wird bei jedem Abruf aus den
 * eingefrorenen Zahlen frisch gerendert, und die „Prüfsumme" im Fußtext ist
 * ein Fingerabdruck dieser Zahlen, kein Fingerabdruck des Layouts. Der
 * Portal-Hinweis darf sich deshalb ändern, ohne dass bestehende
 * `nutzerinfo.information`-Zeilen eine Hash-Abweichung melden.
 */
export function rendereNutzerinfoDokument(
  seiten: readonly DokumentSeite[],
  monat: string | null,
  portalUrl: string,
): string {
  const kopf = monat === null ? '' : mappenKopf(monat, seiten.length);
  return [
    '<!DOCTYPE html>',
    '<html lang="de">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escape(dokumentTitel(seiten, monat))}</title>`,
    `<style>${STIL}</style>`,
    '</head>',
    '<body>',
    kopf,
    ...seiten.map((seite, index) => rendereSeite(seite, index === 0 && monat === null, portalUrl)),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function dokumentTitel(seiten: readonly DokumentSeite[], monat: string | null): string {
  if (monat !== null) {
    return `Energieinformationen ${monatLabel(monat)}`;
  }
  const erste = seiten[0];
  return erste === undefined ? 'Energieinformation' : `Energieinformation ${monatLabel(erste.bericht.information.monat)}`;
}

function mappenKopf(monat: string, anzahl: number): string {
  return [
    '<section class="mappe">',
    `<h1>Monatliche Energieinformationen ${escape(monatLabel(monat))}</h1>`,
    `<p>Diese Mappe enthält ${anzahl} ${anzahl === 1 ? 'Information' : 'Informationen'}. `,
    'Jede beginnt auf einer eigenen Seite.</p>',
    '</section>',
  ].join('\n');
}

function rendereSeite(seite: DokumentSeite, ersteOhneUmbruch: boolean, portalUrl: string): string {
  const { bericht } = seite;
  const { information } = bericht;
  const klasse = ersteOhneUmbruch ? 'blatt blatt--erstes' : 'blatt';

  return [
    `<section class="${klasse}">`,
    '<header>',
    '<h2>Ihre Energieinformation</h2>',
    `<p class="zeitraum">${escape(monatLabel(information.monat))} · ${escape(energietraegerLabel(information.energietraeger))}</p>`,
    '</header>',
    rendereKernaussage(bericht),
    rendereVormonat(bericht),
    rendereGruppen(bericht),
    rendereGuete(bericht),
    renderePortalHinweis(portalUrl),
    rendereFuss(seite),
    '</section>',
  ]
    .filter((teil) => teil.length > 0)
    .join('\n');
}

/**
 * Der Hinweis auf das Nutzerportal — TB-06 verlangt die monatliche
 * Information MIT Opt-out, und das Opt-out ist digital nur über das Portal
 * erreichbar (`PortalModule`, `PortalAuthController`). Ohne diesen Absatz
 * stünde der Weg dorthin in keinem Dokument, das der Endkunde bekommt.
 *
 * **Bewusst OHNE Zugangscode und OHNE Kennung.** Der Zugangscode existiert
 * nach seiner Ausgabe nur noch als Suchindex (`PortalCodeIndexService`,
 * HMAC mit Pepper) — im Klartext ist er nirgends abrufbar und kann deshalb
 * hier gar nicht stehen. Er geht stattdessen über den eigenen
 * `rendereZugangsbrief`, der GENAU DANN entsteht, wenn der Betrieb ihn
 * ausgibt (`PortalZugangService.gibCodeAus`). Ein monatlich wiederholter
 * Klartext-Zugangscode wäre ein Dauer-Generalschlüssel zu fremden
 * Verbrauchsdaten — dieser Absatz beschreibt deshalb nur den WEG (Adresse,
 * formlose Anfrage), nie das Mittel selbst.
 *
 * **Bewusst ohne Fallunterscheidung „hat schon einen Zugang".** Ob der
 * Endkunde bereits einen Portal-Zugang hat, wüsste nur eine zusätzliche
 * Abfrage je Seite — bei der Monatsmappe eines ganzen Bestands unnötige
 * Last für eine Unterscheidung, die der Satz „falls Sie noch keinen Zugang
 * haben" bereits abdeckt, ohne dass der Kunde etwas falsch verstehen kann.
 */
function renderePortalHinweis(portalUrl: string): string {
  return [
    '<h3>Online einsehen und widersprechen</h3>',
    '<p>Im Energieportal können Sie Ihre Energieinformationen jederzeit online einsehen und einer weiteren ',
    `monatlichen Information widersprechen: <a href="${escape(portalUrl)}">${escape(portalUrl)}</a>.</p>`,
    '<p class="hinweis">Haben Sie noch keinen Zugang zum Portal, teilen Sie uns das formlos mit — wir senden ',
    'Ihnen dann einen Zugangscode per Post zu.</p>',
  ].join('\n');
}

function rendereKernaussage(bericht: NutzerinfoBericht): string {
  const { information } = bericht;
  const differenz = Math.abs(information.deltaKwh);
  const istMehrverbrauch = information.deltaKwh < 0;

  // Ein Mehrverbrauch wird BENANNT, nicht geglättet: Kap. 6 verlangt die
  // Angabe von Einsparungen UND Mehrverbräuchen (s. Spaltenkommentar zu
  // `delta_kwh` in V0054).
  const satz = istMehrverbrauch
    ? `Das sind <strong>${escape(kwh(differenz))} mehr</strong> als erwartet.`
    : `Sie haben damit <strong>${escape(kwh(differenz))} eingespart</strong>.`;

  return [
    '<div class="kern">',
    `<p class="verbrauch">Sie haben <strong>${escape(kwh(information.istKwh))}</strong> verbraucht.</p>`,
    `<p>Erwartet waren nach Ihrem Ausgangsverbrauch ${escape(kwh(information.referenzKwh))}. ${satz}</p>`,
    '</div>',
  ].join('\n');
}

function rendereVormonat(bericht: NutzerinfoBericht): string {
  if (bericht.vormonatIstKwh === null) {
    return '';
  }
  const richtung =
    bericht.vormonatDeltaKwh === null
      ? ''
      : bericht.vormonatDeltaKwh < 0
        ? ' (damals ein Mehrverbrauch)'
        : ` (damals ${escape(kwh(bericht.vormonatDeltaKwh))} eingespart)`;
  return `<p class="vormonat">Im Vormonat waren es ${escape(kwh(bericht.vormonatIstKwh))}${richtung}.</p>`;
}

function rendereGruppen(bericht: NutzerinfoBericht): string {
  if (bericht.ohneTageswerte) {
    // Nicht „0 %", sondern unbekannt — eine leere Torte wäre eine Aussage,
    // die die Daten nicht hergeben.
    return '<p class="hinweis">Für diesen Monat liegen uns keine Tageswerte vor. Eine Aufteilung nach Geräten ist deshalb nicht möglich.</p>';
  }
  if (bericht.gruppen.length === 0) {
    return '<p class="hinweis">Für Ihre Anlage sind bisher keine Gerätegruppen erfasst. Der Verbrauch ist deshalb nicht aufgeteilt.</p>';
  }

  const zeilen = bericht.gruppen.map(
    (gruppe) =>
      `<tr><td>${escape(gruppe.bezeichnung)}</td><td class="zahl">${escape(kwh(gruppe.verbrauchKwh))}</td><td class="zahl">${escape(prozent(gruppe.anteilPct))}</td></tr>`,
  );

  if (bericht.nichtZugeordnetKwh > 0) {
    zeilen.push(
      `<tr class="rest"><td>Nicht einzeln erfasst</td><td class="zahl">${escape(kwh(bericht.nichtZugeordnetKwh))}</td><td class="zahl">—</td></tr>`,
    );
  }

  return [
    '<h3>Wofür Sie verbraucht haben</h3>',
    '<table>',
    '<thead><tr><th>Gerätegruppe</th><th class="zahl">Verbrauch</th><th class="zahl">Anteil</th></tr></thead>',
    `<tbody>${zeilen.join('')}</tbody>`,
    '</table>',
  ].join('\n');
}

function rendereGuete(bericht: NutzerinfoBericht): string {
  const { information } = bericht;
  if (information.qualitaetsStufe === 'belastbar' && information.tageFehlend === 0) {
    return '';
  }

  const tage =
    information.tageFehlend === 0
      ? ''
      : ` An ${information.tageFehlend} ${information.tageFehlend === 1 ? 'Tag' : 'Tagen'} lagen uns keine Messwerte vor; für diese Zeit haben wir gerechnete Werte verwendet.`;
  const stufe =
    information.qualitaetsStufe === 'nicht_ausweisbar'
      ? 'Die Datenlage dieses Monats reicht nicht aus, um die Einsparung sicher auszuweisen.'
      : 'Die Datenlage dieses Monats ist eingeschränkt.';

  return `<p class="hinweis">${escape(stufe)}${escape(tage)}</p>`;
}

function rendereFuss(seite: DokumentSeite): string {
  const { information } = seite.bericht;
  const zeilen = [
    `Berichtszeitraum ${escape(datum(seite.bericht.vonTag))} bis ${escape(datum(seite.bericht.bisTag))}.`,
    `Beleg-Kennung ${escape(information.id)}, Prüfsumme ${escape(information.inhaltHashHex.slice(0, 16))}.`,
  ];

  // Auflage A-2, Punkt 3: kundengerichtete Ausgaben, die bereinigte Werte
  // zeigen, tragen Quellen- UND Änderungsvermerk. Bei synthetischem Klima
  // BEWUSST nicht — dort wäre der Vermerk eine Falschangabe (A20).
  if (seite.klimaAusDwd) {
    zeilen.push(escape(DWD_QUELLENVERMERK), escape(DWD_AENDERUNGSVERMERK));
  }

  return `<footer>${zeilen.map((zeile) => `<p>${zeile}</p>`).join('')}</footer>`;
}

function monatLabel(monatIso: string): string {
  const [jahr, monat] = monatIso.split('-');
  const name = MONATSNAMEN[Number(monat) - 1] ?? monat;
  return `${name} ${jahr ?? ''}`.trim();
}

function energietraegerLabel(code: string): string {
  return ENERGIETRAEGER_NAMEN[code] ?? code;
}

function datum(isoTag: string): string {
  const [jahr, monat, tag] = isoTag.split('-');
  return `${tag}.${monat}.${jahr}`;
}

function kwh(wert: number): string {
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(wert))} kWh`;
}

function prozent(wert: number): string {
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(wert)} %`;
}

/**
 * Bezeichnungen von Gerätegruppen sind frei erfasster Text und landen in
 * einem Dokument, das weitergereicht und im Browser geöffnet wird. Ohne
 * Maskierung wäre das eine gespeicherte Cross-Site-Scripting-Lücke mit dem
 * Umweg über die Stammdatenpflege.
 */
function escape(wert: string): string {
  return wert
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const STIL = `
@page { size: A4; margin: 20mm; }
* { box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.5; color: #111; margin: 0; }
.mappe { border-bottom: 2px solid #111; padding-bottom: 12pt; margin-bottom: 18pt; }
.mappe h1 { font-size: 15pt; margin: 0 0 6pt; }
.mappe p { margin: 0; font-size: 10pt; }
.blatt { page-break-before: always; max-width: 170mm; }
.blatt--erstes { page-break-before: auto; }
header { border-bottom: 1px solid #111; padding-bottom: 8pt; margin-bottom: 16pt; }
h2 { font-size: 16pt; margin: 0; }
h3 { font-size: 12pt; margin: 18pt 0 6pt; }
.zeitraum { margin: 4pt 0 0; font-size: 10pt; letter-spacing: 0.04em; text-transform: uppercase; }
.kern { margin: 0 0 12pt; }
.verbrauch { font-size: 14pt; margin: 0 0 6pt; }
.kern p, .vormonat { margin: 0 0 6pt; }
.hinweis { margin: 12pt 0 0; padding: 8pt 10pt; background: #f2f2f2; font-size: 10pt; }
table { width: 100%; border-collapse: collapse; margin-top: 4pt; }
th, td { text-align: left; padding: 5pt 0; border-bottom: 1px solid #ccc; }
th { font-size: 9pt; letter-spacing: 0.04em; text-transform: uppercase; }
.zahl { text-align: right; }
tr.rest td { color: #555; font-style: italic; }
footer { margin-top: 24pt; padding-top: 8pt; border-top: 1px solid #ccc; font-size: 8pt; color: #555; }
footer p { margin: 0 0 2pt; }
`.trim();
