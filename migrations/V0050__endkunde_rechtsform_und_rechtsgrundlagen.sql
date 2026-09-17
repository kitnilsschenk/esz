-- V0050 — Was aus den User-Antworten vom 2026-09-07 im Schema ankommt.
--
-- Grundlage: `production/votum-2026-09-07-antworten.md` (compliance-director,
-- 2026-09-07), Auflagen AW-3, AW-5 und AW-6.
--
-- DREI DINGE, EIN GEDANKE
-- -----------------------
-- Der Fragenkatalog hatte zwei Vorbehalte offen, unter denen die
-- Rechtsgrundlagen-Matrix aus V0047 stand:
--
--   F-1  Schuldet der ESZ-Vertrag die Messung als Hauptleistung?
--   F-2  Sind Endkunden natuerliche oder juristische Personen?
--
-- F-1 ist mit "Ja" beantwortet und faellt. F-2 ist beantwortet — "richtet sich
-- an juristische Personen, in deren Gebaeuden koennen natuerliche eingemietet
-- sein" — und faellt NICHT, sondern wird zur Datensatzfrage: Aus "welche Art
-- von Kunden?" wird "welcher konkrete Kunde ist was?". Genau dafuer gibt es
-- ab hier eine Spalte.
--
-- WARUM DAS MERKMAL KEIN SCHALTER IST
-- -----------------------------------
-- Die naheliegende Verwendung waere eine ABAC-Bedingung: juristische Person =
-- kein Personenbezug = weniger Schutz. Das Votum verbietet sie ausdruecklich,
-- und die Begruendung ist die richtige:
--
--   * Die PII-Tabelle enthaelt ohnehin Ansprechpartner-Daten. Deren
--     Schutzbedarf haengt nicht an der Rechtsform des Kunden.
--   * Eine Fehlklassifikation wuerde sofort und unbemerkt wirken.
--   * Feldverschluesselung, Krypto-Shredding, DS-07 und DS-09 gelten
--     unabhaengig von der Rechtsform.
--
-- Wer aus diesem Merkmal eine Berechtigungsbedingung macht, baut den ersten
-- Schalter, mit dem sich der Schutz versehentlich abstellen laesst. Es ist
-- dokumentarisch und nachweisrelevant — nicht berechtigend.
--
-- DER DEFAULT IST DER STRENGSTE FALL
-- `unbestimmt` wird behandelt wie `natuerliche_person` (Art. 25 Abs. 2:
-- datenschutzfreundliche Voreinstellung). Ein Default, der Schutz wegnimmt,
-- waere das Gegenteil dessen, was die Norm verlangt.
--
-- WARUM `personengesellschaft` EIGENSTAENDIG IST
-- GbR, OHG und KG sind weder natuerliche noch juristische Personen, und
-- hinter ihnen stehen identifizierbare Menschen. In ein Zwei-Werte-Merkmal
-- gepresst waeren sie an der falschen Stelle — und zwar dauerhaft, weil
-- niemand eine getroffene Klassifikation spaeter noch einmal hinterfragt.
--
-- WARUM V0047 NICHT EDITIERT WIRD
-- Ein angewandter Migrationstext ist Historie. Die Korrektur der
-- `begruendung` laeuft deshalb als UPDATE hier, nicht als Aenderung dort
-- (AW-6). Wer wissen will, was am 2026-09-05 galt, findet es unveraendert in
-- V0047.
--
-- Review-Bedarf: `database-lead` + `compliance-director` (PII-Spalten,
-- `.claude/rules/database-migrations.md`).

-- =====================================================================
-- AW-3 — Rechtsform-Merkmal am Endkunden
-- =====================================================================
ALTER TABLE energy.endkunde
    ADD COLUMN rechtsform_kategorie text NOT NULL DEFAULT 'unbestimmt';

ALTER TABLE energy.endkunde
    ADD CONSTRAINT ck_endkunde_rechtsform_kategorie CHECK (
        rechtsform_kategorie IN (
            'natuerliche_person',    -- Einzelperson, Freiberufler
            'personengesellschaft',  -- GbR, OHG, KG, e.K. — dahinter stehen Menschen
            'juristische_person',    -- GmbH, AG, eG, Koerperschaft
            'unbestimmt'             -- nicht erhoben; wird behandelt wie natuerliche_person
        )
    );

COMMENT ON COLUMN energy.endkunde.rechtsform_kategorie IS
  'pii=false; Rechtsformkategorie des Endkunden (Votum 2026-09-07, AW-3). DOKUMENTARISCH, NICHT BERECHTIGEND: nicht in ABAC-/RBAC-Bedingungen verwenden. `unbestimmt` ist der Default und wird behandelt wie `natuerliche_person` (Art. 25 Abs. 2). Wirkt auf Art.-30-Dokumentation, Pruefung von Betroffenenanfragen, Priorisierung im Loeschkonzept.';

-- =====================================================================
-- AW-6 — der Vorbehalt F-1 faellt, F-2 wird operationalisiert
-- =====================================================================
-- Die Spalte wird dem Bediener in der Oberflaeche angezeigt. Sie muss
-- deshalb sagen, was HEUTE gilt — nicht, was am Tag der Entscheidung offen
-- war.
UPDATE consent.zweck_subjekt
   SET begruendung = 'Der Endkunde ist Vertragspartei; die Messung ist der Vertragsgegenstand (Art. 6 Abs. 1 lit. b). Ein Haekchen waere hier eine Zusage von Widerrufbarkeit, die nicht eingeloest werden kann — die Messung liefe nach einem Widerruf weiter, weil der Vertrag sie schuldet. Beendet wird sie durch Kuendigung, nicht durch Widerruf. F-1 (schuldet der Vertrag die Messung?) ist am 2026-09-07 mit Ja beantwortet; Beleg = Aktenvermerk AW-2. F-2 ist operationalisiert: Diese Grundlage traegt, SOWEIT der Endkunde natuerliche Person ist (s. energy.endkunde.rechtsform_kategorie). Ist er juristische Person, laeuft sie leer — die Rechtsgrundlage fuer die ANSPRECHPERSON ist dann Art. 6 Abs. 1 lit. f mit dokumentierter Abwaegung, und sie folgt NIEMALS aus dieser Zeile.'
 WHERE zweck_code = 'messdaten_verarbeitung'
   AND subjekt_typ = 'endkunde';

-- =====================================================================
-- AW-5 — die Spaltenkommentare sagen, was entschieden ist
-- =====================================================================
-- Seit V0002 trugen sie "[Platzhalter -> final DSFA/RVT]". Der Platzhalter
-- war ehrlich, solange nichts entschieden war. Jetzt IST entschieden, und ein
-- stehengebliebener Platzhalter waere die schlechtere Art von Unrichtigkeit:
-- eine, die Sorgfalt vortaeuscht.
--
-- DER MATERIELLE BEFUND, DER DABEI GEFUNDEN WURDE (Votum Abschnitt 1):
-- Ist der Endkunde eine juristische Person, ist die ANSPRECHPERSON nicht
-- Vertragspartei. Art. 6 Abs. 1 lit. b verlangt aber einen Vertrag, "dessen
-- Vertragspartei die betroffene Person ist" — er scheidet fuer ihre Daten
-- also aus. Richtig ist lit. f mit Abwaegung. Die alten Kommentare sagten
-- etwas anderes, und `kontakt_enc` sagte mit "Art.6(1)(a) Einwilligung
-- (TB-06)" sogar das Gegenteil dessen, was V0047 entschieden hat: Die
-- monatliche Nutzerinformation ist fuer den Endkunden eine GESCHULDETE
-- Leistung mit Widerspruchsrecht, keine Einwilligung.

COMMENT ON COLUMN identity.endkunde_pii.pseudonym_id IS
  'pii=true; grundlage=folgt der des Subjekts (s. name_enc); die Spalte selbst ist das Re-Identifikations-Mapping (Verkettbarkeit); retention=an Subjekt gebunden; Löschung=Krypto-Shredding + Nullen des Mappings; ADR-0004 Anhang B, P4';

COMMENT ON COLUMN identity.endkunde_pii.name_enc IS
  'pii=true; grundlage=Art.6(1)(b) Vertrag, soweit der Endkunde natürliche Person ist (V0047-Matrix, ADR-0012 O1) — bei juristischer Person ist der Firmenname kein personenbezogenes Datum, und für die Daten der ANSPRECHPERSON gilt Art.6(1)(f) mit dokumentierter Abwägung (Votum 2026-09-07 V-1, AW-4); retention=F2 (Nachweisfrist, retention-matrix.md); Sperrung statt Löschung (DS-08); ADR-0004 Anhang B, P1';

COMMENT ON COLUMN identity.endkunde_pii.anschrift_enc IS
  'pii=true; grundlage=Art.6(1)(b) Vertrag, soweit der Endkunde natürliche Person ist; bei juristischer Person ist die Geschäftsanschrift kein personenbezogenes Datum (Votum 2026-09-07 V-1); retention=F2 (Nachweisfrist, retention-matrix.md); ADR-0004 Anhang B, P2';

COMMENT ON COLUMN identity.endkunde_pii.kontakt_enc IS
  'pii=true; grundlage=Art.6(1)(b) Vertrag für die geschuldete Nutzerinformation (TB-06, Opt-out über Art. 21 — KEINE Einwilligung, V0047-Matrix), bei juristischer Person Art.6(1)(f) für die Ansprechperson (AW-4); retention=bis Widerspruch bzw. Vertragsende, Versandnachweis bis F2; ADR-0004 Anhang B, P3';

COMMENT ON COLUMN identity.anschlussnutzer_pii.pseudonym_id IS
  'pii=true; grundlage=folgt der des Subjekts (s. name_enc); die Spalte selbst ist das Re-Identifikations-Mapping (Verkettbarkeit, DS-07); retention=an Subjekt gebunden; Löschung=Krypto-Shredding + Nullen des Mappings; ADR-0004 Anhang B, analog P4';

COMMENT ON COLUMN identity.anschlussnutzer_pii.name_enc IS
  'pii=true; grundlage=Art.6(1)(a) Einwilligung (V0047-Matrix, ADR-0012 O1) — Art.6(1)(f) trägt hier NICHT: Eine Abwägung bei 15-Minuten-Lastgängen im Wohnkontext geht nicht zugunsten des Verantwortlichen aus (DSFA-0001 Risiko 3.1/3.2); retention=Nutzungsdauer, danach F2 soweit nachweisgebunden; Sperrung statt Löschung (DS-08); ADR-0004 Anhang B, P5';

COMMENT ON COLUMN identity.anschlussnutzer_pii.kontakt_enc IS
  'pii=true; grundlage=Art.6(1)(a) Einwilligung (DS-07 Datensubjekt, V0047-Matrix); retention=bis Widerruf/Nutzungsende; ADR-0004 Anhang B, P6';
