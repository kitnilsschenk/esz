-- V0052 — Der Widerspruch bekommt eine Geschichte.
--
-- Auflage AW-27 aus `production/votum-2026-09-07-antworten.md` (Abschnitt 11,
-- Entscheidung V-11d).
--
-- ZWEI LUECKEN, EINE BAUFORM
-- --------------------------
-- Der `compliance-director` hat beim Auswerten der User-Antworten zwei
-- Stellen gefunden, an denen ein Betroffener etwas erklaeren darf, das
-- System es aber nicht festhalten kann:
--
--   1. `nutzerinformation` / Endkunde. Nach TB-06 ist die monatliche
--      Nutzerinformation eine GESCHULDETE Leistung mit Opt-out — sie laeuft,
--      bis jemand widerspricht. `consent.einwilligung` verbietet bei lit. b
--      den Widerruf (V0047, `ck_einwilligung_kein_widerruf_bei_vertrag`),
--      und das ist richtig: Ein Widerspruch ist etwas anderes als ein
--      Widerruf. **Nur fehlte das Gegenstueck.** Ein Endkunde, der der
--      Zusendung widerspricht, konnte bis heute nicht dokumentiert werden.
--
--   2. `wiss_auswertung` / Endkunde. DE-04 ist als Opt-out konstruiert, und
--      die Wirkung haengt am Attribut `energy.endkunde.
--      von_wiss_auswertung_ausgenommen`. Ein Boolean hat aber keine
--      Geschichte: Wer wann auf welchem Weg widersprochen hat, stand
--      nirgends. Fuer eine Auskunft nach Art. 15 und fuer den Nachweis nach
--      Art. 5 Abs. 2 ist genau das die Frage.
--
-- FUEHREND FUER DIE WIRKUNG BLEIBT DAS ATTRIBUT
-- ---------------------------------------------
-- Das Votum ist hier ausdruecklich: Export- und Auswertungsfilter pruefen
-- weiterhin GENAU EINEN Ort — `von_wiss_auswertung_ausgenommen`,
-- fail-closed. Zwei Pruefpfade fuer dieselbe Frage waeren die naechste Falle;
-- dieselbe Begruendung, mit der V0047 die Spalte `verweigerbar` von
-- `consent.zweck` entfernt hat.
--
-- Neu ist nur, WER das Attribut setzen darf: das Erklaerungsobjekt, und
-- sonst niemand. Der bisherige Weg — ein Haekchen im Endkunden-Formular —
-- entfaellt mit diesem Commit. Ein von Hand gesetztes Flag behauptet einen
-- Vorgang, den niemand belegen kann.
--
-- WARUM EIN WIDERSPRUCH GEGEN EINEN OPT-IN-ZWECK NICHT SCHREIBBAR IST
-- -------------------------------------------------------------------
-- Dieselbe Konstruktion wie in V0047: Die Zeile traegt den `erlaubnismodus`
-- und ist ueber einen ZUSAMMENGESETZTEN FREMDSCHLUESSEL an die Matrix
-- gebunden. Zusammen mit dem CHECK `erlaubnismodus <> 'opt_in'` heisst das:
-- Gegen etwas, das nur mit Einwilligung laeuft, kann man nicht
-- widersprechen — man widerruft. Die Datenbank laesst die Verwechslung nicht
-- zu, statt sie in der Anwendung abzufangen.
--
-- OFFENER PUNKT, DER HIERHER GEHOERT
-- ----------------------------------
-- Das Votum bezeichnet das Opt-out der Nutzerinformation als Widerspruch
-- nach Art. 21 DSGVO. **Art. 21 Abs. 1 gilt seinem Wortlaut nach nur fuer
-- Verarbeitungen auf Art. 6 Abs. 1 lit. e oder lit. f — nicht fuer lit. b.**
-- Das Opt-out bleibt richtig (TB-06 sieht es vor, vertraglich ist es ohne
-- Weiteres zulaessig), es ist dann aber ein leistungsbezogenes Abwahlrecht
-- und kein Betroffenenrecht.
--
-- Diese Tabelle nimmt die Einordnung deshalb NICHT vorweg: Sie heisst
-- `widerspruch` und traegt keine Normangabe. Der Unterschied ist fuer die
-- Bauform folgenlos (Erklaerung, Zeitpunkt, Weg, Beleg, Ruecknahme sind in
-- beiden Faellen dieselben Felder) und fuer den TEXT gegenueber dem
-- Betroffenen entscheidend. Einordnung: `compliance-director`, s.
-- `docs/consent/README.md`.
--
-- Review-Bedarf: `compliance-director` (Bauform, Einordnung),
-- `database-lead` (Constraints, Grants), `consent-engineer`.

-- =====================================================================
-- Vorbereitung: die Matrix wird zusaetzlich ueber den Erlaubnismodus adressierbar
-- =====================================================================
-- (zweck_code, subjekt_typ) ist bereits Primaerschluessel; dieser Index ist
-- deshalb trivial erfuellt und dient allein als Ziel des zusammengesetzten
-- Fremdschluessels unten.
ALTER TABLE consent.zweck_subjekt
    ADD CONSTRAINT ux_zweck_subjekt_modus UNIQUE (zweck_code, subjekt_typ, erlaubnismodus);

-- =====================================================================
-- consent.widerspruch — die Erklaerung als Ereignis
-- =====================================================================
CREATE TABLE consent.widerspruch (
    id                       uuid        PRIMARY KEY,   -- App: UUIDv7
    subjekt_typ              text        NOT NULL,
    endkunde_id              uuid        REFERENCES energy.endkunde(id),
    anschlussnutzer_id       uuid        REFERENCES energy.anschlussnutzer(id),
    zweck_code               text        NOT NULL REFERENCES consent.zweck(code),
    erlaubnismodus           text        NOT NULL,      -- aus der Matrix, s. FK unten

    -- Zeitpunkt der ERKLAERUNG durch die betroffene Person, nicht der
    -- Erfassung. Dieselbe Unterscheidung wie bei der Einwilligung (A12-27);
    -- bei einem nachgetragenen Brief liegen beide Wochen auseinander.
    erklaert_at              timestamptz NOT NULL,
    erfassungsweg            text        NOT NULL,
    quelle_ref               text,                      -- Fundstelle des Dokuments (A12-28)

    zurueckgenommen_at       timestamptz,               -- NULL = wirksam
    ruecknahme_erfassungsweg text,
    ruecknahme_quelle_ref    text,

    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_widerspruch_subjekt_typ CHECK (subjekt_typ IN ('endkunde', 'anschlussnutzer')),

    CONSTRAINT ck_widerspruch_genau_ein_subjekt CHECK (
        (subjekt_typ = 'endkunde'        AND endkunde_id IS NOT NULL AND anschlussnutzer_id IS NULL)
     OR (subjekt_typ = 'anschlussnutzer' AND anschlussnutzer_id IS NOT NULL AND endkunde_id IS NULL)
    ),

    -- Gegen eine Opt-in-Verarbeitung widerspricht man nicht -- man widerruft
    -- (Art. 7 Abs. 3). Die beiden duerfen nicht in dieselbe Zeile fallen.
    CONSTRAINT ck_widerspruch_kein_opt_in CHECK (erlaubnismodus IN ('opt_out', 'vertraglich')),

    CONSTRAINT ck_widerspruch_erfassungsweg CHECK (
        erfassungsweg IN ('digital_opt_in', 'vertrag_schriftlich', 'uebernahme_altbestand')
    ),
    CONSTRAINT ck_widerspruch_ruecknahme_erfassungsweg CHECK (
        ruecknahme_erfassungsweg IS NULL
     OR ruecknahme_erfassungsweg IN ('digital_opt_in', 'vertrag_schriftlich', 'uebernahme_altbestand')
    ),

    -- Eine Ruecknahme, die vor der Erklaerung liegt, gibt es nicht.
    CONSTRAINT ck_widerspruch_ruecknahme_nach_erklaerung CHECK (
        zurueckgenommen_at IS NULL OR zurueckgenommen_at >= erklaert_at
    ),
    -- Die Begleitangaben der Ruecknahme haengen an ihr, nicht daneben.
    CONSTRAINT ck_widerspruch_ruecknahme_kohaerenz CHECK (
        (zurueckgenommen_at IS NULL AND ruecknahme_erfassungsweg IS NULL AND ruecknahme_quelle_ref IS NULL)
     OR (zurueckgenommen_at IS NOT NULL AND ruecknahme_erfassungsweg IS NOT NULL)
    ),

    -- Die Kombination muss in der Rechtsgrundlagen-Matrix stehen, und ihr
    -- Erlaubnismodus muss stimmen. Zusammen mit dem CHECK oben ist ein
    -- Widerspruch gegen einen Opt-in-Zweck damit nicht schreibbar -- auch
    -- nicht fuer einen kuenftigen Zweck, an den heute niemand denkt.
    CONSTRAINT fk_widerspruch_matrix
        FOREIGN KEY (zweck_code, subjekt_typ, erlaubnismodus)
        REFERENCES consent.zweck_subjekt (zweck_code, subjekt_typ, erlaubnismodus)
);

-- HOECHSTENS EIN WIRKSAMER WIDERSPRUCH JE SUBJEKT UND ZWECK — Teilindizes
-- wie bei `consent.einwilligung`: Zurueckgenommene Zeilen duerfen sich
-- wiederholen (wer erneut widerspricht, erzeugt eine weitere Erklaerung),
-- wirksame nicht.
CREATE UNIQUE INDEX ux_widerspruch_wirksam_endkunde
    ON consent.widerspruch (endkunde_id, zweck_code)
    WHERE zurueckgenommen_at IS NULL AND endkunde_id IS NOT NULL;

CREATE UNIQUE INDEX ux_widerspruch_wirksam_anschlussnutzer
    ON consent.widerspruch (anschlussnutzer_id, zweck_code)
    WHERE zurueckgenommen_at IS NULL AND anschlussnutzer_id IS NOT NULL;

-- „Was hat diese Person erklaert?" — die Frage einer Auskunft nach Art. 15.
CREATE INDEX ix_widerspruch_endkunde ON consent.widerspruch (endkunde_id, zweck_code, erklaert_at DESC)
    WHERE endkunde_id IS NOT NULL;
CREATE INDEX ix_widerspruch_anschlussnutzer
    ON consent.widerspruch (anschlussnutzer_id, zweck_code, erklaert_at DESC)
    WHERE anschlussnutzer_id IS NOT NULL;

CREATE TRIGGER trg_widerspruch_updated_at BEFORE UPDATE ON consent.widerspruch
    FOR EACH ROW EXECUTE FUNCTION consent.set_updated_at();

COMMENT ON TABLE consent.widerspruch IS
  'Widerspruch bzw. Abwahl gegen eine Verarbeitung, die OHNE Einwilligung laeuft (AW-27, Votum 2026-09-07 V-11d). Ereignis mit abgeleitetem Zustand: wirksam = zurueckgenommen_at IS NULL. Fuer `wiss_auswertung` setzt der Vorgang das Attribut energy.<subjekt>.von_wiss_auswertung_ausgenommen -- NIE umgekehrt von Hand. pii=false (Kennungen, Codes, Zeitpunkte).';
COMMENT ON COLUMN consent.widerspruch.erklaert_at IS
  'Zeitpunkt der ERKLAERUNG durch die betroffene Person, nicht der Erfassung (A12-27 sinngemaess). Bei einem nachgetragenen Brief liegen beide Wochen auseinander, und fuer die Frage, ab wann nicht mehr verarbeitet werden durfte, zaehlt der erste.';
COMMENT ON COLUMN consent.widerspruch.erlaubnismodus IS
  'Aus consent.zweck_subjekt uebernommen und per zusammengesetztem Fremdschluessel daran gebunden. Zusammen mit ck_widerspruch_kein_opt_in macht das einen Widerspruch gegen einen Opt-in-Zweck unschreibbar -- dagegen widerruft man (Art. 7 Abs. 3).';

-- =====================================================================
-- AW-27 — der Anschlussnutzer bekommt das Ausnahme-Attribut
-- =====================================================================
-- DE-04 spricht von Endkunden-Datensaetzen. Im Mietfall ist die betroffene
-- Person aber der Anschlussnutzer, und ihm fehlte das Merkmal vollstaendig.
-- Solange der Anschlussnutzer-Zweig der wissenschaftlichen Auswertung
-- fail-closed gesperrt ist (Votum V-11c), hat die Spalte keine Wirkung --
-- sie soll vor der Aufhebung der Sperre da sein, nicht danach.
ALTER TABLE energy.anschlussnutzer
    ADD COLUMN von_wiss_auswertung_ausgenommen boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN energy.anschlussnutzer.von_wiss_auswertung_ausgenommen IS
  'pii=false; DE-04-Ausnahme fuer das Datensubjekt der Verbrauchsdaten (AW-27). Gesetzt AUSSCHLIESSLICH ueber consent.widerspruch -- kein Schreibpfad ueber die Stammdaten-API. Ohne Wirkung, solange der Anschlussnutzer-Zweig wiss_auswertung fail-closed gesperrt ist (Votum V-11c).';

GRANT SELECT, INSERT, UPDATE ON consent.widerspruch TO edms_app;
