/** Was auf dem Zugangsbrief steht. */
export interface ZugangsbriefEingang {
  readonly kennung: string;
  /** Klartext — er existiert genau hier und sonst nirgends. */
  readonly code: string;
  readonly gueltigBis: string;
  readonly portalUrl: string;
  /** `true` bei einem Ersatzbrief — dann steht drin, dass der alte Code nicht mehr gilt. */
  readonly erneut: boolean;
}

/**
 * Der Zugangsbrief zum Nutzerportal — ein eigenes, einseitiges Dokument.
 *
 * **Warum nicht in die monatliche Nutzerinformation.** Der naheliegende
 * Gedanke wäre, den Zugangscode in den nächsten Monatsbrief zu setzen. Das
 * ginge nur, wenn der Code bis dahin gespeichert bliebe — und genau das ist
 * ausgeschlossen: Er existiert im Klartext nur in dem Augenblick, in dem er
 * erzeugt wird (`PortalZugangService`). Ein nachschlagbarer Code wäre ein
 * Generalschlüssel zu fremden Verbrauchsdaten.
 *
 * Der Brief entsteht deshalb GENAU DANN, wenn der Betrieb den Code ausgibt,
 * und trägt ihn direkt aus derselben Antwort. Er hat auch sonst nichts mit
 * dem Monatsbrief zu tun: Der eine teilt Verbrauchszahlen mit, der andere
 * eröffnet einen Zugang.
 *
 * Wie beim Monatsbrief: druckfertiges, eigenständiges HTML — kein Skript,
 * kein Bild, keine externe Schrift, kein Netzzugriff beim Öffnen. Und
 * deterministisch bis auf den Code selbst.
 */
export function rendereZugangsbrief(eingang: ZugangsbriefEingang): string {
  const ersatzHinweis = eingang.erneut
    ? '<p class="hinweis">Dies ist ein Ersatzbrief. Ein früher zugesandter Zugangscode gilt ab sofort nicht mehr.</p>'
    : '';

  return [
    '<!DOCTYPE html>',
    '<html lang="de">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>Ihr Zugang zum Energieportal</title>',
    `<style>${STIL}</style>`,
    '</head>',
    '<body>',
    '<section class="blatt">',
    '<header>',
    '<h1>Ihr Zugang zum Energieportal</h1>',
    '</header>',
    ersatzHinweis,
    '<p>Sie können Ihre monatlichen Energieinformationen ab sofort online einsehen — jederzeit, ',
    'rückwirkend und ohne Wartezeit auf die Post.</p>',
    '<table class="zugang">',
    `<tr><td>Adresse</td><td><strong>${escape(eingang.portalUrl)}</strong></td></tr>`,
    `<tr><td>Kennung</td><td><strong>${escape(eingang.kennung)}</strong></td></tr>`,
    `<tr><td>Zugangscode</td><td><strong>${escape(eingang.code)}</strong></td></tr>`,
    '</table>',
    '<h2>So melden Sie sich zum ersten Mal an</h2>',
    '<ol>',
    '<li>Rufen Sie die Adresse oben auf.</li>',
    '<li>Geben Sie den Zugangscode ein.</li>',
    '<li>Vergeben Sie Ihr eigenes Passwort — mindestens zwölf Zeichen.</li>',
    '</ol>',
    `<p>Danach melden Sie sich immer mit Ihrer <strong>Kennung</strong> und Ihrem Passwort an. Der Zugangscode `,
    `wird beim ersten Anmelden verbraucht und gilt nur bis zum ${escape(datum(eingang.gueltigBis))}.</p>`,
    // Der wichtigste Satz des Briefes: Wir KOENNEN den Code nicht erneut
    // mitteilen. Wer das nicht weiss, hebt den Brief nicht auf und ruft an.
    '<p class="hinweis">Bewahren Sie diesen Brief bis zur ersten Anmeldung auf. Der Zugangscode ist bei uns ',
    'nicht gespeichert und kann Ihnen nicht erneut mitgeteilt werden — wir stellen Ihnen dann einen neuen aus.</p>',
    '<h2>Sie möchten keine monatliche Information mehr?</h2>',
    '<p>Im Portal können Sie der monatlichen Information jederzeit widersprechen und den Widerspruch ',
    'ebenso jederzeit wieder zurücknehmen.</p>',
    '</section>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function datum(isoZeitpunkt: string): string {
  const [jahr, monat, tag] = isoZeitpunkt.slice(0, 10).split('-');
  return `${tag}.${monat}.${jahr}`;
}

/** Der Brief enthält keinen frei erfassten Text — die Maskierung steht trotzdem, weil sich das ändern kann. */
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
.blatt { max-width: 170mm; }
header { border-bottom: 1px solid #111; padding-bottom: 8pt; margin-bottom: 16pt; }
h1 { font-size: 16pt; margin: 0; }
h2 { font-size: 12pt; margin: 18pt 0 6pt; }
p { margin: 0 0 8pt; }
ol { margin: 0 0 8pt; padding-left: 18pt; }
li { margin-bottom: 4pt; }
.hinweis { padding: 8pt 10pt; background: #f2f2f2; }
table.zugang { border-collapse: collapse; margin: 12pt 0; }
table.zugang td { padding: 4pt 20pt 4pt 0; font-size: 13pt; }
table.zugang td:first-child { font-size: 10pt; letter-spacing: 0.04em; text-transform: uppercase; color: #555; }
`.trim();
