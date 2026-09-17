-- V0047 — Die Rechtsgrundlage wird nicht mehr gewaehlt, sondern festgestellt.
-- Umsetzung der Auflagen A12-1 bis A12-4 und A12-6 aus dem
-- `compliance-director`-Votum vom 2026-09-05 (Entscheidung zu ADR-0012 O1).
--
-- DIE ENTSCHEIDUNG, DIE HIER SCHEMA WIRD
-- --------------------------------------
-- O1 ist beantwortet, und die Antwort faellt JE SUBJEKTART UNTERSCHIEDLICH
-- aus. Das ist keine Ausweichbewegung, sondern folgt unmittelbar aus dem
-- Wortlaut von Art. 6 Abs. 1 lit. b DSGVO („Vertrag, dessen Vertragspartei
-- die betroffene Person ist"):
--
--   ENDKUNDE ist Vertragspartei          -> lit. b (Vertragserfuellung)
--   ANSCHLUSSNUTZER ist es NICHT (Mieter) -> lit. a (Einwilligung)
--
-- Die Folge ist unsymmetrisch, und das ist richtig so: Der Endkunde kann die
-- Messung NICHT widerrufen (er kann kuendigen). Der Anschlussnutzer kann sie
-- beenden — sofort, ohne Begruendung, ohne Nachteil. Wer diese Asymmetrie in
-- einer Oberflaeche einebnet, taeuscht eine der beiden Seiten.
--
-- WARUM DEM ENDKUNDEN KEIN HAEKCHEN VORGELEGT WIRD
-- Wo ein Vertrag die Verarbeitung traegt, ist die Einwilligung nicht die
-- „sicherere" Grundlage, sondern die falsche. Eine Einwilligung, die faktisch
-- nicht folgenlos verweigert werden kann, weil die verweigerte Verarbeitung
-- der Vertragsgegenstand ist, ist nicht freiwillig (ErwG 43). Und ein
-- nachtraeglicher Wechsel der Grundlage, wenn die Einwilligung wegbricht,
-- ist unzulaessig. Wer dem Endkunden ein Haekchen fuer die Verbrauchsmessung
-- vorlegt, verspricht ihm eine Widerrufbarkeit, die er nicht einloesen kann.
--
-- WARUM DER ANSCHLUSSNUTZER NICHT UEBER lit. f LAEUFT
-- DSFA-0001 bewertet die Art.-9-nahe Inferenz aus 15-Minuten-Lastgaengen mit
-- 25 und das DS-07-Machtgefaelle mit 20. Eine Abwaegung, die bei diesem
-- Interessengewicht zugunsten des Verantwortlichen ausgeht, ist nicht
-- schreibbar. Zugleich ist es der seltene Fall, in dem lit. a sauber traegt:
-- Der Anschlussnutzer bekommt von uns keine Leistung, seine Verweigerung
-- kostet ihn also nichts.
--
-- WAS DIESE MIGRATION BAUT
-- ------------------------
-- `consent.zweck_subjekt` — die Matrix als TABELLE, nicht als Code-Konstante.
-- Sie ist zugleich die Antwort auf drei Auflagen:
--
--   A12-1  Die Rechtsgrundlage wird serverseitig bestimmt, an EINER Stelle.
--   A12-4  `verweigerbar` ist subjektartabhaengig. Als eine Spalte am Zweck
--          war die Angabe fuer die Haelfte der Betroffenen unrichtig:
--          `messdaten_verarbeitung` ist fuer den Endkunden nicht
--          verweigerbar (Vertragsgegenstand) und fuer den Anschlussnutzer
--          sehr wohl (er verliert nichts).
--   A12-6  Der Erlaubnismodus. `nutzerinformation` ist nach TB-06 eine
--          OPT-OUT-Leistung: geschuldet, bis jemand widerspricht. Als
--          Opt-in-Einwilligung modelliert kehrt sich der Default um, und ein
--          Endkunde ohne Einwilligung bekaeme keine monatliche Information —
--          womit die Foerderauflage verfehlt waere. Ein Widerspruch
--          (Art. 21) ist etwas anderes als ein Widerruf (Art. 7 Abs. 3), und
--          beide duerfen nicht in dieselbe Zeile fallen.
--
-- A12-2 wird DEKLARATIV geloest, und zwar staerker als verlangt: Statt eines
-- CHECK nur fuer `messdaten_verarbeitung` erzwingt ein ZUSAMMENGESETZTER
-- FREMDSCHLUESSEL die Matrix fuer JEDEN Zweck. Eine Zeile, deren Trio
-- (Zweck, Subjektart, Rechtsgrundlage) nicht in der Matrix steht, ist nicht
-- schreibbar — auch nicht fuer einen kuenftigen Zweck, an den heute niemand
-- denkt.
--
-- A12-3 als CHECK: Eine lit.-b-Zeile kann nicht widerrufen werden. Bisher
-- haette ein Widerruf darauf ein `einwilligung.consent.widerrufen`-
-- PFLICHTEREIGNIS im append-only Audit-Log erzeugt — ueber einen Vorgang,
-- den es rechtlich nicht gibt.
--
-- Review-Bedarf: `compliance-director` (Abnahme seiner eigenen Auflagen) und
-- `database-lead`. Die Matrix-Inhalte unten sind SEIN Votum, nicht meine
-- Auslegung; der Endkunden-Zweig steht unter dem Vorbehalt F-1/F-2 (s. u.).

-- =====================================================================
-- consent.zweck_subjekt — die Matrix
-- =====================================================================
CREATE TABLE consent.zweck_subjekt (
    zweck_code      text NOT NULL REFERENCES consent.zweck(code),
    subjekt_typ     text NOT NULL,
    rechtsgrundlage text NOT NULL,
    erlaubnismodus  text NOT NULL,
    verweigerbar    boolean NOT NULL,
    begruendung     text NOT NULL,   -- warum GENAU diese Grundlage; wird in der Oberflaeche gezeigt
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (zweck_code, subjekt_typ),

    CONSTRAINT ck_zweck_subjekt_typ CHECK (subjekt_typ IN ('endkunde', 'anschlussnutzer')),
    CONSTRAINT ck_zweck_subjekt_rechtsgrundlage CHECK (
        rechtsgrundlage IN ('einwilligung_art6_1a', 'vertrag_art6_1b')
    ),

    -- `opt_in`      — es braucht eine ausdrueckliche Erklaerung (lit. a).
    -- `opt_out`     — die Leistung laeuft, bis widersprochen wird (TB-06).
    -- `vertraglich` — geschuldet; es gibt nichts zu erklaeren und nichts zu
    --                 widerrufen (lit. b).
    CONSTRAINT ck_zweck_subjekt_modus CHECK (erlaubnismodus IN ('opt_in', 'opt_out', 'vertraglich')),

    -- Zwei Konsistenzregeln zwischen den Spalten, damit die Matrix nicht in
    -- sich widerspruechlich befuellt werden kann:
    --   * lit. b heisst „geschuldet" — dann ist es nicht verweigerbar und
    --     nicht per Opt-in zu erklaeren.
    --   * lit. a heisst „freiwillig" — dann MUSS es verweigerbar sein,
    --     sonst waere die Einwilligung nach ErwG 43 nicht freiwillig.
    CONSTRAINT ck_zweck_subjekt_vertrag_kohaerenz CHECK (
        rechtsgrundlage <> 'vertrag_art6_1b' OR (erlaubnismodus <> 'opt_in' AND verweigerbar = false)
    ),
    CONSTRAINT ck_zweck_subjekt_einwilligung_kohaerenz CHECK (
        rechtsgrundlage <> 'einwilligung_art6_1a' OR (erlaubnismodus = 'opt_in' AND verweigerbar = true)
    ),

    -- Ziel des zusammengesetzten Fremdschluessels aus consent.einwilligung.
    CONSTRAINT ux_zweck_subjekt_trio UNIQUE (zweck_code, subjekt_typ, rechtsgrundlage)
);

CREATE TRIGGER trg_zweck_subjekt_updated_at BEFORE UPDATE ON consent.zweck_subjekt
    FOR EACH ROW EXECUTE FUNCTION consent.set_updated_at();

COMMENT ON TABLE  consent.zweck_subjekt                 IS 'Rechtsgrundlage, Erlaubnismodus und Verweigerbarkeit JE (Zweck, Subjektart) — compliance-director-Votum zu ADR-0012 O1 (2026-09-05). Die Rechtsgrundlage wird hieraus BESTIMMT, nicht vom Aufrufer gewaehlt (A12-1). pii=false.';
COMMENT ON COLUMN consent.zweck_subjekt.erlaubnismodus  IS 'opt_in|opt_out|vertraglich (A12-6). Ein Widerspruch nach Art. 21 ist etwas anderes als ein Widerruf nach Art. 7 Abs. 3 — beide duerfen nicht in dieselbe Zeile fallen.';
COMMENT ON COLUMN consent.zweck_subjekt.begruendung     IS 'Warum GENAU diese Grundlage gilt. Steht hier und nicht in einem Kommentar, weil die Oberflaeche sie dem Bediener zeigt — wer eine Rechtsgrundlage erfasst, soll wissen, warum sie gilt.';

-- =====================================================================
-- Die Matrix befuellen (Votum vom 2026-09-05, Abschnitt 1)
-- =====================================================================
-- VORBEHALT, ausdruecklich festgehalten: Der ENDKUNDEN-Zweig steht unter den
-- offenen Punkten F-1 (schuldet der ESZ-Vertrag die Messung als
-- Hauptleistungspflicht? — Vertragswortlaut noetig) und F-2 (sind Endkunden
-- natuerliche oder juristische Personen? — `energy.endkunde` fuehrt dazu kein
-- Merkmal). Faellt F-1 anders aus, ist die Rueckfallposition lit. f mit
-- dokumentierter LIA — NIEMALS lit. a, denn die Einwilligung bliebe
-- unfreiwillig. Der ANSCHLUSSNUTZER-Zweig steht unabhaengig davon fest.
INSERT INTO consent.zweck_subjekt
    (zweck_code, subjekt_typ, rechtsgrundlage, erlaubnismodus, verweigerbar, begruendung)
VALUES
    ('messdaten_verarbeitung', 'endkunde', 'vertrag_art6_1b', 'vertraglich', false,
     'Der Endkunde ist Vertragspartei; die Messung ist der Vertragsgegenstand (Art. 6 Abs. 1 lit. b). Ein Haekchen waere hier eine Zusage von Widerrufbarkeit, die nicht eingeloest werden kann — die Messung liefe nach einem Widerruf weiter, weil der Vertrag sie schuldet. Beendet wird sie durch Kuendigung, nicht durch Widerruf. VORBEHALT F-1/F-2.'),
    ('messdaten_verarbeitung', 'anschlussnutzer', 'einwilligung_art6_1a', 'opt_in', true,
     'Der Anschlussnutzer ist NICHT Vertragspartei (Art. 6 Abs. 1 lit. b scheidet aus) und bekommt von uns keine Leistung — genau deshalb ist seine Einwilligung wirklich freiwillig: Ihre Verweigerung kostet ihn nichts. Art. 6 Abs. 1 lit. f traegt nicht, weil eine Abwaegung bei 15-Minuten-Lastgaengen im Wohnkontext nicht zugunsten des Verantwortlichen ausgeht (DSFA-0001 Risiko 3.1/3.2).'),

    ('nutzerinformation', 'endkunde', 'vertrag_art6_1b', 'opt_out', false,
     'Nach TB-06 ist die mindestens monatliche Nutzerinformation eine GESCHULDETE Leistung mit Opt-out — sie laeuft, bis jemand widerspricht. Als Opt-in modelliert kehrte sich der Default um, und ein Endkunde ohne Einwilligung bekaeme keine Information; damit waere die Foerderauflage verfehlt. Der Widerspruch laeuft ueber Art. 21, nicht ueber Art. 7 Abs. 3.'),
    ('nutzerinformation', 'anschlussnutzer', 'einwilligung_art6_1a', 'opt_in', true,
     'Kein Vertrag, also lit. a. Anders als beim Endkunden ist die Information hier nicht geschuldet, sondern angeboten.'),

    ('geraeteerkennung', 'endkunde', 'einwilligung_art6_1a', 'opt_in', true,
     'Die Einsparermittlung kommt ohne Geraetegruppen-Erkennung aus; sie ist damit nicht Vertragsgegenstand, sondern zusaetzlich — und ihre Verweigerung kostet die Leistung nicht.'),
    ('geraeteerkennung', 'anschlussnutzer', 'einwilligung_art6_1a', 'opt_in', true,
     'Wie beim Endkunden: zusaetzlich, freiwillig, folgenlos verweigerbar.'),

    ('mehrwertdienste', 'endkunde', 'einwilligung_art6_1a', 'opt_in', true,
     'Per Definition zusaetzlich. Eine Kopplung an die Kernleistung waere ein Verstoss gegen Art. 7 Abs. 4.'),
    ('mehrwertdienste', 'anschlussnutzer', 'einwilligung_art6_1a', 'opt_in', true,
     'Wie beim Endkunden.'),

    ('wiss_auswertung', 'endkunde', 'einwilligung_art6_1a', 'opt_in', true,
     'Eigener Zweck mit eigenem Empfaengerkreis. ACHTUNG: bis zur Klaerung von Auflage A23 (Empfaenger, Rolle nach Art. 26/28, Rechtsgrundlage — offener RVT-Eintrag VT-0004) ist dieser Zweck fail-closed gesperrt und darf NICHT erteilt werden.'),
    ('wiss_auswertung', 'anschlussnutzer', 'einwilligung_art6_1a', 'opt_in', true,
     'Wie beim Endkunden, einschliesslich der A23-Sperre.');

-- =====================================================================
-- A12-2 — die Matrix wird erzwungen, nicht angeboten
-- =====================================================================
-- Zusammengesetzter Fremdschluessel statt eines CHECK auf einen einzelnen
-- Zweck: Er deckt JEDEN Zweck ab, auch kuenftige, und er kann nicht
-- auseinanderlaufen, weil er auf dieselbe Zeile zeigt, aus der die Anwendung
-- die Grundlage bestimmt.
ALTER TABLE consent.einwilligung
    ADD CONSTRAINT fk_einwilligung_rechtsgrundlage_matrix
        FOREIGN KEY (zweck_code, subjekt_typ, rechtsgrundlage)
        REFERENCES consent.zweck_subjekt (zweck_code, subjekt_typ, rechtsgrundlage);

-- =====================================================================
-- A12-3 — eine vertragliche Grundlage kann nicht widerrufen werden
-- =====================================================================
-- Ein Widerruf auf einer lit.-b-Zeile haette ein PFLICHTEREIGNIS im
-- append-only Audit-Log erzeugt ueber einen Vorgang, den es rechtlich nicht
-- gibt. Das Ende einer vertraglichen Grundlage ist die Vertragsbeendigung
-- und gehoert als eigener Vorgang modelliert — nicht als Widerruf.
ALTER TABLE consent.einwilligung
    ADD CONSTRAINT ck_einwilligung_kein_widerruf_bei_vertrag
        CHECK (rechtsgrundlage <> 'vertrag_art6_1b' OR widerrufen_at IS NULL);

-- =====================================================================
-- A12-4 — `verweigerbar` wandert an die Matrix
-- =====================================================================
-- Die Spalte an `consent.zweck` traf eine Aussage, die fuer die Haelfte der
-- Betroffenen unrichtig war (s. Datei-Kopf). Sie wird entfernt, statt
-- danebenzustehen: Zwei Quellen fuer dieselbe Frage waeren die naechste
-- Falle.
ALTER TABLE consent.zweck DROP COLUMN verweigerbar;

GRANT SELECT ON consent.zweck_subjekt TO edms_app;
