/**
 * Ein sehr kleiner XML-Scanner — gerade genug für die XML-Teile einer
 * XLSX-Arbeitsmappe (ECMA-376 / OPC).
 *
 * **Warum kein XML-Parser als Abhängigkeit.** Dieselbe Überlegung wie beim
 * ZIP-Leser (`common/zip/zip-eintrag.util.ts`): eine neue Produktivabhängigkeit
 * ist laut `.claude/rules/dependencies.md` lizenz- und freigabepflichtig, und
 * die gelesene Struktur ist eng, maschinenerzeugt und vollständig bekannt.
 *
 * **Und ein Sicherheitsargument, das schwerer wiegt als der Aufwand.** Dieser
 * Scanner löst KEINE Entitäten auf außer den fünf vordefinierten und
 * numerischen Zeichenreferenzen. Er kennt keine DTD, keine Parameter-Entitäten
 * und keine externen Referenzen — er kann sie nicht einmal ausdrücken. Damit
 * sind XXE und die „Billion Laughs"-Entfaltung hier strukturell ausgeschlossen,
 * statt von der Konfiguration einer Bibliothek abzuhängen. Das ist bei Dateien,
 * die von außen ins Haus kommen, der wesentliche Punkt: Eine
 * Tabellenkalkulations-Datei ist eine Eingabe eines Dritten.
 *
 * **Was er NICHT ist:** kein validierender Parser. Er prüft nicht auf
 * Wohlgeformtheit, gleicht keine Tags ab und kennt keine Namensräume (in
 * XLSX-Teilen tragen die interessierenden Elemente keinen Präfix). Er liefert
 * einen Strom von Ereignissen; wer ihn liest, muss selbst wissen, was er
 * erwartet — und tut das in `xlsx-arbeitsmappe.ts` fail-closed.
 */

export class XmlLeseFehler extends Error {}

export interface XmlStartTag {
  readonly art: 'start';
  readonly name: string;
  /** `true` bei `<tag/>` — dann folgt KEIN `ende`-Ereignis. */
  readonly leer: boolean;
  /** Roh-Attributtext; erst `attribut()` dekodiert daraus einen Wert. */
  readonly attribute: string;
}

export interface XmlEndTag {
  readonly art: 'ende';
  readonly name: string;
}

export interface XmlText {
  readonly art: 'text';
  /** Bereits dekodiert (Entitäten aufgelöst). */
  readonly inhalt: string;
}

export type XmlEreignis = XmlStartTag | XmlEndTag | XmlText;

/**
 * Obergrenze für ein einzelnes XML-Dokument.
 *
 * Ein Blatt mit 400 Zeilen liegt bei gut 100 KB; 64 MB sind großzügig und
 * trotzdem eine Grenze. Sie steht hier, weil die Datei aus einem ZIP kommt:
 * Ein kleines Archiv kann sich beim Entpacken vervielfachen, und ohne Grenze
 * entscheidet darüber der Absender der Datei.
 */
const MAX_DOKUMENT_BYTES = 64 * 1024 * 1024;

/**
 * Zerlegt ein XML-Dokument in einen Strom aus Start-Tags, End-Tags und Text.
 *
 * Kommentare, Verarbeitungsanweisungen und die XML-Deklaration werden
 * übersprungen; `<![CDATA[…]]>` wird als Text geliefert. Eine DOCTYPE-
 * Deklaration wird ABGEWIESEN statt übersprungen — sie hat in einem
 * XLSX-Teil nichts zu suchen, und sie ist der Einstieg für Entitäts-Angriffe.
 */
export function* scanneXml(dokument: Buffer): Generator<XmlEreignis> {
  if (dokument.length > MAX_DOKUMENT_BYTES) {
    throw new XmlLeseFehler(`XML-Teil ist ${dokument.length} Byte gross (Grenze ${MAX_DOKUMENT_BYTES}) — abgewiesen.`);
  }

  const text = dokument.toString('utf8');
  let i = 0;

  while (i < text.length) {
    const spitz = text.indexOf('<', i);

    if (spitz === -1) {
      const rest = text.slice(i);
      if (rest.trim().length > 0) {
        yield { art: 'text', inhalt: dekodiere(rest) };
      }
      return;
    }

    if (spitz > i) {
      const roh = text.slice(i, spitz);
      // Reiner Zwischenraum zwischen Tags ist Formatierung, kein Inhalt.
      // `<t xml:space="preserve"> </t>` bleibt davon unberuehrt: dort steht
      // der Zwischenraum zwischen einem Start- und einem End-Tag und wird
      // vom Aufrufer als Inhalt dieses Elements gelesen.
      if (roh.trim().length > 0) {
        yield { art: 'text', inhalt: dekodiere(roh) };
      }
    }

    if (text.startsWith('<!--', spitz)) {
      i = ueberspringe(text, spitz, '-->', 'Kommentar');
      continue;
    }
    if (text.startsWith('<![CDATA[', spitz)) {
      const ende = text.indexOf(']]>', spitz);
      if (ende === -1) {
        throw new XmlLeseFehler('Unabgeschlossener CDATA-Abschnitt.');
      }
      yield { art: 'text', inhalt: text.slice(spitz + 9, ende) };
      i = ende + 3;
      continue;
    }
    if (text.startsWith('<!DOCTYPE', spitz)) {
      // Fail-closed statt ueberspringen: In einem XLSX-Teil kommt keine DTD
      // vor. Kommt doch eine, ist die Datei entweder kaputt oder sie will
      // etwas, das dieser Scanner bewusst nicht kann.
      throw new XmlLeseFehler('DOCTYPE-Deklaration im XML-Teil — abgewiesen (keine DTD-Verarbeitung).');
    }
    if (text.startsWith('<?', spitz)) {
      i = ueberspringe(text, spitz, '?>', 'Verarbeitungsanweisung');
      continue;
    }

    const zu = text.indexOf('>', spitz);
    if (zu === -1) {
      throw new XmlLeseFehler('Unabgeschlossener Tag am Dokumentende.');
    }

    const roh = text.slice(spitz + 1, zu);
    if (roh.startsWith('/')) {
      yield { art: 'ende', name: roh.slice(1).trim() };
    } else {
      const leer = roh.endsWith('/');
      const koerper = leer ? roh.slice(0, -1) : roh;
      const trenn = ersterZwischenraum(koerper);
      yield {
        art: 'start',
        name: (trenn === -1 ? koerper : koerper.slice(0, trenn)).trim(),
        leer,
        attribute: trenn === -1 ? '' : koerper.slice(trenn + 1),
      };
    }
    i = zu + 1;
  }
}

/** Liest EIN Attribut aus dem Rohtext eines Start-Tags. `undefined`, wenn es fehlt. */
export function attribut(rohAttribute: string, name: string): string | undefined {
  // Der Name muss an einer Wortgrenze beginnen, sonst faende `id` auch `r:id`.
  const muster = new RegExp(`(?:^|\\s)${name.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')}\\s*=\\s*("[^"]*"|'[^']*')`);
  const treffer = muster.exec(rohAttribute);
  const wert = treffer?.[1];
  return wert === undefined ? undefined : dekodiere(wert.slice(1, -1));
}

function ersterZwischenraum(text: string): number {
  for (let i = 0; i < text.length; i += 1) {
    const z = text[i];
    if (z === ' ' || z === '\t' || z === '\n' || z === '\r') {
      return i;
    }
  }
  return -1;
}

function ueberspringe(text: string, ab: number, bis: string, was: string): number {
  const ende = text.indexOf(bis, ab);
  if (ende === -1) {
    throw new XmlLeseFehler(`Unabgeschlossene ${was}.`);
  }
  return ende + bis.length;
}

const ENTITAETEN: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * Löst die fünf vordefinierten Entitäten und numerische Zeichenreferenzen auf
 * — sonst NICHTS.
 *
 * Eine unbekannte Entität wird abgewiesen und nicht etwa durchgereicht: Sie
 * stünde für einen Text, den dieser Scanner nicht kennt, und ein stillschweigend
 * falsch gelesener Zellinhalt ist schlimmer als ein abgebrochener Import.
 */
function dekodiere(roh: string): string {
  if (!roh.includes('&')) {
    return roh;
  }
  return roh.replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z]+);/g, (_treffer, koerper: string) => {
    if (koerper.startsWith('#')) {
      const hex = koerper.startsWith('#x') || koerper.startsWith('#X');
      const punkt = Number.parseInt(hex ? koerper.slice(2) : koerper.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(punkt) || punkt < 0 || punkt > 0x10ffff) {
        throw new XmlLeseFehler(`Ungueltige Zeichenreferenz '&${koerper};'.`);
      }
      return String.fromCodePoint(punkt);
    }
    const ersatz = ENTITAETEN[koerper];
    if (ersatz === undefined) {
      throw new XmlLeseFehler(`Unbekannte Entitaet '&${koerper};' — nicht aufgeloest (keine DTD-Verarbeitung).`);
    }
    return ersatz;
  });
}
