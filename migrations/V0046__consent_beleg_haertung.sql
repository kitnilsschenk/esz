-- V0046 — Der Einwilligungs-Beleg sagt jetzt, WANN erklaert wurde, nicht wann
-- getippt wurde. Umsetzung der Auflagen A12-27, A12-28 und A12-29 aus dem
-- `compliance-director`-Votum vom 2026-09-05 (Teil-Veto gegen den produktiven
-- Einsatz von ADR-0012 B1/B2).
--
-- DER BEFUND
-- ----------
-- V0044/V0045 und der zugehoerige Service setzten `erteilt_at` auf den
-- Zeitpunkt der ERFASSUNG. Fuer den Regelfall -- eine auf Papier erteilte,
-- Wochen spaeter nachgetragene Einwilligung -- behauptete der Nachweis damit
-- systematisch einen falschen Tag. Die Wirkung ist in beide Richtungen
-- schaedlich, und die zweite ist die schlimmere:
--
--   * ERTEILUNG: Eine am 14. Maerz unterschriebene, am 5. September erfasste
--     Einwilligung liess den Zeitraum dazwischen als OHNE Rechtsgrundlage
--     verarbeitet erscheinen, obwohl er es nicht war. Der Betreiber schadet
--     sich selbst.
--   * WIDERRUF: Ein am 1. brieflich erklaerter, am 20. erfasster Widerruf
--     liess neunzehn Tage rechtswidriger Verarbeitung rechtmaessig aussehen.
--     Hier schadet es der BETROFFENEN PERSON -- und genau dieser Zeitpunkt
--     ist, wie V0045 selbst schreibt, "die Frage, die im Streitfall zaehlt".
--
-- Es ist derselbe Einwand, den ADR-0012 in E9 gegen das digitale Opt-in
-- erhoben hat (ein Beleg darf nichts behaupten, was nicht geschehen ist),
-- nur an einer Stelle, an der niemand hingesehen hat.
--
-- DREI AENDERUNGEN
-- ----------------
-- (A12-27) Der Erklaerungszeitpunkt wird zur EINGABE, und die Datenbank
--          erzwingt, dass er nicht in der Zukunft und nicht nach der
--          Erfassung liegt.
-- (A12-28) `quelle_ref` -- die Fundstelle des zugrundeliegenden Dokuments.
--          Pflicht bei `vertrag_schriftlich` und `uebernahme_altbestand`.
--          Ohne sie bedeutet der Erfassungsweg nicht "es existiert eine
--          unterschriebene Erklaerung", sondern nur "jemand hat einen
--          Listeneintrag gewaehlt".
-- (A12-29) Der WIDERRUF bekommt einen eigenen Beleg. Bisher war die
--          Erteilung dreifach belegt (Fachzeile, Beleg, Audit) und der
--          Widerruf einfach, ohne Kanalangabe. Art. 7 Abs. 3 S. 4 verlangt,
--          dass der Widerruf so einfach sein muss wie die Erteilung -- dann
--          muss er auch so belegt sein. Die Asymmetrie ging zulasten der
--          Person.
--
-- KEIN DATENVERLUST: Es existiert noch keine produktive Zeile (ADR-0012
-- Stufe C ist nicht scharf, v1 ist synthetic-only). Die Spalten werden
-- deshalb direkt als NOT NULL angelegt, wo sie es fachlich sind -- ein
-- nachtraegliches Verschaerfen auf Bestandsdaten waere sonst der
-- schwierigere Weg gewesen.
--
-- Review-Bedarf: `database-lead` (Schema) und `compliance-director`
-- (Umsetzung seiner eigenen Auflagen -- die Abnahme steht aus).

-- =====================================================================
-- A12-27 — Erklaerungszeitpunkt vs. Erfassungszeitpunkt
-- =====================================================================
-- `created_at` ist der Erfassungszeitpunkt der Zeile (DB-Default `now()`).
-- Der CHECK vergleicht intra-tabellarisch gegen ihn und braucht deshalb
-- keinen Blick in den Beleg -- ein tabellenuebergreifender CHECK waere in
-- Postgres ohnehin nicht deklarativ moeglich.
--
-- ZWEI GRENZEN, NICHT EINE:
--   * `erteilt_at <= created_at` -- man kann nichts erfassen, das noch nicht
--     erklaert wurde. Faengt den Tippfehler im Jahr ab (2027 statt 2026).
--   * Keine untere Grenze. Eine 2019 erteilte Alt-Einwilligung ist
--     nachtragbar; das ist genau der Fall `uebernahme_altbestand`.
ALTER TABLE consent.einwilligung
    ADD CONSTRAINT ck_einwilligung_erteilt_nicht_nach_erfassung
        CHECK (erteilt_at <= created_at);

-- Dieselbe Grenze fuer den Widerruf. `updated_at` wird vom BEFORE-Trigger
-- (V0044) auf `now()` gesetzt, BEVOR der CHECK laeuft -- die Reihenfolge
-- traegt, sie ist Postgres-Kernverhalten.
--
-- Zusammen mit `ck_einwilligung_widerruf_nach_erteilung` (V0044) ist der
-- Widerruf damit beidseitig eingefasst: nicht vor der Erteilung, nicht nach
-- seiner eigenen Erfassung.
ALTER TABLE consent.einwilligung
    ADD CONSTRAINT ck_einwilligung_widerruf_nicht_nach_erfassung
        CHECK (widerrufen_at IS NULL OR widerrufen_at <= updated_at);

COMMENT ON COLUMN consent.einwilligung.erteilt_at IS
  'Zeitpunkt der ERKLAERUNG durch die betroffene Person -- NICHT der Zeitpunkt der Erfassung im System (A12-27). Bei nachgetragenen Vorgaengen liegen beide Wochen auseinander; `created_at` traegt den Erfassungszeitpunkt. UTC.';

-- =====================================================================
-- A12-29 — Der Widerruf bekommt einen eigenen Beleg
-- =====================================================================
-- Bisher trug `identity.einwilligung_beleg` GENAU EINE Zeile je Einwilligung
-- (`ux_einwilligung_beleg_einwilligung`) und meinte damit implizit die
-- Erteilung. Der Widerruf hatte keinen Beleg -- weder Kanal noch Fundstelle
-- noch die Unterscheidung, ob er schriftlich, telefonisch oder digital
-- erklaert wurde.
--
-- `art` macht die bisherige implizite Bedeutung explizit und schafft Platz
-- fuer die zweite Zeile. Die Unique-Bedingung wandert von "eine Zeile je
-- Einwilligung" auf "eine Zeile je Einwilligung UND Art".
ALTER TABLE identity.einwilligung_beleg
    ADD COLUMN art text NOT NULL DEFAULT 'erteilung';

-- Der Default hat seinen Zweck erfuellt (bestehende Zeilen sind Erteilungen)
-- und wird entfernt: Kuenftig soll die Anwendung sich festlegen muessen,
-- welchen Vorgang sie belegt. Ein Default waere hier dieselbe stille
-- Vorbelegung, die DS-02 an anderer Stelle untersagt.
ALTER TABLE identity.einwilligung_beleg
    ALTER COLUMN art DROP DEFAULT;

ALTER TABLE identity.einwilligung_beleg
    ADD CONSTRAINT ck_einwilligung_beleg_art CHECK (art IN ('erteilung', 'widerruf'));

ALTER TABLE identity.einwilligung_beleg
    DROP CONSTRAINT ux_einwilligung_beleg_einwilligung;

ALTER TABLE identity.einwilligung_beleg
    ADD CONSTRAINT ux_einwilligung_beleg_vorgang UNIQUE (einwilligung_id, art);

-- =====================================================================
-- A12-28 — Fundstelle des zugrundeliegenden Dokuments
-- =====================================================================
-- WARUM DIE SPALTE NICHT VERSCHLUESSELT IST: Ein Aktenzeichen ist eine
-- Ordnungsnummer, kein Personendatum. Wer hier einen Namen eintraegt,
-- missbraucht das Feld -- dagegen hilft eine Verschluesselung nicht, sondern
-- der Formhinweis in der Oberflaeche. Der CHECK unten schliesst wenigstens
-- das Offensichtlichste aus (Leerzeichenketten) und begrenzt die Laenge,
-- damit niemand einen Freitext hineinschreibt.
--
-- Ausdruecklich KEINE Formatvorgabe darueber hinaus: Aktenzeichen,
-- Vertragsnummern und Ablagekennungen sehen bei jedem Betreiber anders aus,
-- und ein erfundenes Muster wuerde nur dazu fuehren, dass Leute es umgehen.
ALTER TABLE identity.einwilligung_beleg
    ADD COLUMN quelle_ref text;

ALTER TABLE identity.einwilligung_beleg
    ADD CONSTRAINT ck_einwilligung_beleg_quelle_ref_form
        CHECK (quelle_ref IS NULL OR (length(btrim(quelle_ref)) BETWEEN 1 AND 200));

-- Die eigentliche Auflage: Wo ein Dokument die Grundlage ist, MUSS es
-- auffindbar sein.
ALTER TABLE identity.einwilligung_beleg
    ADD CONSTRAINT ck_einwilligung_beleg_quelle_ref_pflicht
        CHECK (
            erfassungsweg = 'digital_opt_in' OR quelle_ref IS NOT NULL
        );

COMMENT ON COLUMN identity.einwilligung_beleg.art IS
  'erteilung|widerruf (A12-29). Der Widerruf ist ein eigener belegpflichtiger Vorgang -- Art. 7 Abs. 3 S. 4 verlangt, dass er so einfach sein muss wie die Erteilung; dann muss er auch so belegt sein. pii=false.';
COMMENT ON COLUMN identity.einwilligung_beleg.quelle_ref IS
  'Fundstelle des zugrundeliegenden Dokuments (Vertrags-/Akten-/Ablagekennung) -- Pflicht auf allen nicht-digitalen Wegen (A12-28). Ordnungsnummer, KEIN Personendatum; deshalb unverschluesselt. pii=false; retention=folgt der Beleg-Zeile.';
