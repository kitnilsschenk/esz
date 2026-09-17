-- V0037__art19_mitteilung.sql
--
-- ADR-Bezug: ADR-0007 Auflage A18 (C3) und A11.12 (Teil D). Nachweis der
-- Mitteilung nach **Art. 19 DSGVO** an den Empfaenger, dem die Daten bereits
-- offengelegt wurden.
--
-- =====================================================================
-- Die Pflicht
-- =====================================================================
-- Art. 19: der Verantwortliche teilt ALLEN Empfaengern, denen die Daten
-- offengelegt wurden, jede Berichtigung, Loeschung oder Einschraenkung der
-- Verarbeitung mit -- "es sei denn, dies erweist sich als unmoeglich oder ist
-- mit einem unverhaeltnismaessigen Aufwand verbunden".
--
-- Diese Ausnahme greift hier NICHT, und das ist der Kern von A18: es gibt
-- genau EINEN Empfaenger, er ist aktenkundig (`nachweis.einreichung.
-- empfaenger`), und die Zuordnung "welche Person steckt in welcher
-- Einreichung" ist eine Abfrage, kein Rechercheaufwand
-- (`einreichung.einsparlauf_id` -> `einsparlauf_bindung.endkunde_id`).
-- Sich auf Unverhaeltnismaessigkeit zu berufen, waere hier nicht vertretbar.
--
-- ZWEI Anlaesse, nicht einer (User-Entscheidung 2026-08-28): A11.12 nennt
-- nur die Einschraenkung nach Art. 18. Art. 19 erfasst dem Wortlaut nach aber
-- ebenso die LOESCHUNG -- und der Krypto-Shred (Art. 17, ADR-0009) ist eine
-- vollzogene Loeschung von Daten, die beim BAFA bereits liegen. Ihn
-- auszulassen waere dieselbe Luecke, die dieser Auftrag gerade dreimal
-- geschlossen hat. `anlass` unterscheidet beide.
--
-- =====================================================================
-- Was diese Tabelle NICHT ist
-- =====================================================================
-- Sie ist der NACHWEIS der Mitteilung, nicht ihre Ausfuehrung. A18 nennt als
-- Ausfuehrungsform die "Korrektur-Einreichung mit Differenz-Report" -- die
-- haengt am BSCW-Uebermittlungsweg, und **O-B9 ist unbeantwortet** (der Weg
-- ist nicht bestaetigt). Eine Korrektur-Einreichung zu bauen, deren
-- Zustellweg offen ist, hiesse den zweiten Schritt vor dem ersten. Bis dahin
-- gilt: die Pflicht wird ERKANNT (Arbeitsliste), ERFUELLT (auf dem heute
-- verfuegbaren Weg) und BELEGT (diese Tabelle).
--
-- =====================================================================
-- Kein Grund-Code
-- =====================================================================
-- Die Tabelle traegt BEWUSST keinen `einschraenkung_grund_code`. Eine
-- Art.-19-Mitteilung sagt dem Empfaenger unvermeidlich, dass zu einem
-- Pseudonym ein Betroffenenrechts-Vorgang laeuft -- das will die Norm so.
-- Sie soll ihm aber NICHT sagen, WELCHER: nach aussen gilt unveraendert der
-- neutrale Sammelcode (ADR-0007 C4 Punkt 6, "die Behoerde braucht die Luecke,
-- nicht die Art des Betroffenenrechts-Vorgangs"). `anlass` unterscheidet nur
-- Art. 18 von Art. 17 -- beides ist aus der Mitteilung ohnehin ersichtlich,
-- weil sie unterschiedliche Rechtsfolgen ankuendigt.
--
-- =====================================================================
-- Exklusiver Bogen (wie V0035)
-- =====================================================================
-- Zwei nullbare Fremdschluessel plus CHECK "genau einer gesetzt". Dass
-- `nachweis` nach `energy` referenzieren DARF, ist in V0025 unter
-- D-BEFUND-ENDKUNDE-FK ausdruecklich entschieden ("referenzielle Integritaet
-- ist hier ohne Zusatzkosten erreichbar (kein Cross-Schema-/Zyklus-Problem)
-- und schliesst eine sonst willkuerlich wirkende Ausnahme"). Der
-- Anschlussnutzer hat in diesem Schema noch keine Praezedenz -- er bekommt
-- dieselbe Behandlung, aus demselben Grund.

CREATE TABLE nachweis.art19_mitteilung (
    id                  uuid        PRIMARY KEY,        -- App: UUIDv7, KEIN DB-DEFAULT
    einreichung_id      uuid        NOT NULL REFERENCES nachweis.einreichung(id),
    endkunde_id         uuid        REFERENCES energy.endkunde(id),
    anschlussnutzer_id  uuid        REFERENCES energy.anschlussnutzer(id),
    anlass              text        NOT NULL,           -- einschraenkung_art18 | loeschung_art17
    mitgeteilt_am       timestamptz NOT NULL DEFAULT now(),
    kanal               text        NOT NULL,           -- geschlossene Liste, s. CHECK
    mitgeteilt_von_sub  text        NOT NULL,           -- opaker Principal, KEIN FK
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_art19_mitteilung_genau_ein_subjekt
        CHECK (num_nonnulls(endkunde_id, anschlussnutzer_id) = 1),
    CONSTRAINT ck_art19_mitteilung_anlass
        CHECK (anlass IN ('einschraenkung_art18', 'loeschung_art17')),
    -- Dieselbe geschlossene Liste wie `energy.einschraenkung_unterrichtung`
    -- (V0035) und aus demselben Grund: ein Freitextfeld truege binnen Wochen
    -- Kontaktdaten.
    CONSTRAINT ck_art19_mitteilung_kanal
        CHECK (kanal IN ('postalisch', 'elektronisch', 'telefonisch', 'persoenlich'))
);

COMMENT ON TABLE nachweis.art19_mitteilung IS
  'Art. 19 DSGVO -- Nachweis der Mitteilung an den Empfaenger (BAFA), dem die Daten der betroffenen Person bereits offengelegt wurden (ADR-0007 A18/A11.12). Zwei Anlaesse: Einschraenkung nach Art. 18 und Loeschung nach Art. 17 (Krypto-Shred). Traegt BEWUSST keinen differenzierten Einschraenkungsgrund -- nach aussen gilt der neutrale Sammelcode (C4 Punkt 6). Die Ausfuehrung als Korrektur-Einreichung (A18) ist NICHT Teil dieser Tabelle und wartet auf O-B9 (BSCW-Weg unbestaetigt).';
COMMENT ON COLUMN nachweis.art19_mitteilung.anlass IS
  'einschraenkung_art18 = Verarbeitungseinschraenkung gesetzt; loeschung_art17 = Krypto-Shred vollzogen. Beide loesen die Mitteilungspflicht aus (Art. 19 nennt Berichtigung, Loeschung UND Einschraenkung).';
COMMENT ON COLUMN nachweis.art19_mitteilung.kanal IS
  'personenbeziehbar=false; geschlossene Liste, bewusst KEIN Freitext -- sonst traegt die Spalte Kontaktdaten und damit PII.';
COMMENT ON COLUMN nachweis.art19_mitteilung.mitgeteilt_von_sub IS
  'personenbeziehbar=true; pii=false; art=opake-principal (kein FK); analog energy.einschraenkung_unterrichtung.unterrichtet_von_sub.';

-- Hoechstens EINE Mitteilung je (Einreichung, Subjekt, Anlass): eine
-- Einschraenkung und eine spaetere Loeschung desselben Subjekts sind ZWEI
-- Vorgaenge und beide mitteilungspflichtig -- eine doppelte Meldung DESSELBEN
-- Vorgangs ist es nicht.
CREATE UNIQUE INDEX ux_art19_mitteilung_endkunde
    ON nachweis.art19_mitteilung (einreichung_id, endkunde_id, anlass)
    WHERE endkunde_id IS NOT NULL;
CREATE UNIQUE INDEX ux_art19_mitteilung_anschlussnutzer
    ON nachweis.art19_mitteilung (einreichung_id, anschlussnutzer_id, anlass)
    WHERE anschlussnutzer_id IS NOT NULL;

-- Grants nach dem Muster dieses Schemas (anders als `energy.*`, s. V0035):
-- `edms_app` fuehrt den Vorgang aus, `edms_nachweis_owner` besitzt,
-- `edms_nachweis_reader` liest mit. KEIN UPDATE/DELETE fuer `edms_app` -- der
-- Beleg ist unveraenderlich; eine Korrektur waere eine neue Mitteilung.
ALTER TABLE nachweis.art19_mitteilung OWNER TO edms_nachweis_owner;
GRANT SELECT, INSERT ON nachweis.art19_mitteilung TO edms_app;
GRANT SELECT ON nachweis.art19_mitteilung TO edms_nachweis_reader;
