-- V0054 — Die monatliche Nutzerinformation (TB-06).
--
-- WORTLAUT DER AUFLAGE ([Q3] Technisches Merkblatt v2.2, Kap. 6):
--   „Ein Endkunde ist mindestens monatlich über seinen Verbrauch und seine
--    Energieeinsparungen zu informieren, wenn dies nicht vom Kunden explizit
--    anders gewünscht wird (sog. Opt-Out)."
--
-- Sie ist damit keine Komfortfunktion, sondern eine Foerderauflage mit einer
-- Frist. Bis heute existierte sie im System an keiner Stelle: Der Zweck stand
-- im Consent-Katalog, das Opt-out war seit V0052 dokumentierbar — nur gab es
-- keine Information, der man haette widersprechen koennen.
--
-- DIE TRAGENDE ENTSCHEIDUNG: DIESELBE BINDUNG WIE DER NACHWEIS
-- -----------------------------------------------------------
-- Die Zahlen der Nutzerinformation werden NICHT neu gerechnet. Sie kommen aus
-- einem `analytics.berechnungslauf`, der ueber `loeseBindungAuf(...)` gewaehlt
-- wird — GENAU der Aufloesung, die auch `nachweis.einsparlauf_bindung`
-- verwendet: der juengste, selbst nicht ersetzte Lauf, dessen Periode den
-- Monat enthaelt; bei widerspruechlichen Kandidaten KEINE stillschweigende
-- Aufloesung.
--
-- Der Grund ist einfach und schwerwiegend: Saehe der Kunde eine andere
-- Einsparung als die Bewilligungsbehoerde, waere jede Erklaerung dafuer
-- schlechter als der Fehler selbst. Die `berechnungslauf_id` in dieser Tabelle
-- ist der Beleg, WELCHE Rechnung er gesehen hat.
--
-- WAS EINGEFROREN WIRD, UND WARUM
-- Referenz, Ist und Delta stehen als Werte in der Zeile, nicht als Verweis.
-- Eine Nachlauf-Korrektur aendert spaeter den Berechnungslauf; die
-- Information, die der Kunde im Maerz bekommen hat, bleibt die vom Maerz.
-- Dieselbe Konstruktion wie bei `nachweis.einsparlauf_bindung` (dort
-- „eingefroren aus analytics.laufergebnis").
--
-- DAS VORZEICHEN BLEIBT STEHEN
-- `delta_kwh` ist `referenz_kwh - ist_kwh`, POSITIV bei Einsparung und NEGATIV
-- bei Mehrverbrauch — ohne die Vorzeichen-/Lueckenregel (F2/F3), die der
-- BAFA-Nachweis anwendet. Das Merkblatt verlangt ausdruecklich
-- „Einsparungen UND/ODER MEHRVERBRAEUCHE"; einen Mehrverbrauch auf null zu
-- setzen waere gegenueber dem Kunden eine Beschoenigung. Der Nachweis und die
-- Kundeninformation beantworten zwei verschiedene Fragen, und sie duerfen
-- deshalb verschieden runden — solange beide auf DENSELBEN Lauf zeigen, ist
-- der Unterschied erklaerbar.
--
-- WAS DIESE MIGRATION NICHT LEISTET
-- ---------------------------------
-- 1. **Die Zustellung.** `zugestellt_at`/`zustellweg` sind vorhanden und
--    LEER. Es gibt weder ein Nutzerportal noch einen Versandweg — beides sind
--    eigene Vorhaben, und der Versand personenbezogener Daten per E-Mail
--    braucht eine eigene Entscheidung (neuer Empfaenger, neues Risiko).
--    Erzeugen ist nicht informieren: Solange die Spalten leer sind, ist die
--    Auflage NICHT erfuellt, und das soll man an den Daten sehen koennen.
--    Genau dafuer verlangt TB-06 den Versand-/Bereitstellungsnachweis.
-- 2. **Die Geraetegruppen.** Kap. 6 verlangt die Verbraeuche der erkannten
--    Geraete- und Anlagengruppen, getrennt nach Gruppen. Die
--    Geraeteerkennung ist nicht gebaut. Diese Tabelle bildet den
--    Gesamtsystem-Teil ab und BEHAUPTET den Rest nicht — eine leere
--    Gruppen-Spalte waere eine Zusage, die niemand einloest.
-- 3. **Der waehlbare Referenzzeitraum** und der Vergleich zu Referenzkunden
--    (Kap. 6). Das ist eine Darstellungsfunktion des Portals, keine
--    Eigenschaft des monatlichen Datensatzes.
--
-- Review-Bedarf: `product-director` (Umfang gegen Kap. 6), `database-lead`,
-- `compliance-director` (Opt-out-Kopplung, PII-Klassifikation).

CREATE SCHEMA nutzerinfo;
COMMENT ON SCHEMA nutzerinfo IS 'Kundengerichtete Information (TB-06). Getrennt von `nachweis` (behoerdengerichtet) und `analytics` (rechnend): dieselbe Zahl, drei verschiedene Adressaten und drei verschiedene Aufbewahrungsgruende.';

CREATE TABLE nutzerinfo.information (
    id                 uuid          PRIMARY KEY,   -- App: UUIDv7
    endkunde_id        uuid          NOT NULL REFERENCES energy.endkunde(id),
    energietraeger     text          NOT NULL,
    monat              date          NOT NULL,      -- Monatserster, lokal

    -- WELCHE Rechnung der Kunde gesehen hat. Ohne diese Spalte waere die
    -- Information eine Zahl ohne Herkunft.
    berechnungslauf_id uuid          NOT NULL REFERENCES analytics.berechnungslauf(id),

    referenz_kwh       numeric(18,3) NOT NULL,      -- R_m, eingefroren
    ist_kwh            numeric(18,3) NOT NULL,      -- A_m, eingefroren
    delta_kwh          numeric(18,3) NOT NULL,      -- R_m - A_m; POSITIV = Einsparung, NEGATIV = Mehrverbrauch

    qualitaets_stufe   text          NOT NULL,
    abdeckung_pct      numeric(5,2)  NOT NULL,
    tage_fehlend       smallint      NOT NULL,
    kandidaten_anzahl  smallint      NOT NULL,      -- >1 = mehrdeutige, aber wertgleiche Laeufe

    -- SHA-256 ueber den kanonisierten Inhalt. Dieselbe Linie wie ADR-0007
    -- B14: kein Byte-Archiv, sondern deterministisches Re-Rendering plus
    -- Hash-Vergleich. Er beantwortet die Frage, die im Streitfall gestellt
    -- wird: „Stand das damals wirklich so drin?"
    inhalt_hash        bytea         NOT NULL,

    erzeugt_at         timestamptz   NOT NULL DEFAULT now(),

    -- TB-06 verlangt den Versand-/Bereitstellungsnachweis. Beide Spalten sind
    -- heute LEER und bleiben es, bis es einen Zustellweg gibt. Eine
    -- Information, die erzeugt, aber nicht zugestellt wurde, erfuellt die
    -- Auflage nicht — und das soll abfragbar sein, nicht verborgen.
    zugestellt_at      timestamptz,
    zustellweg         text,

    CONSTRAINT ck_information_monat CHECK (monat = date_trunc('month', monat)::date),
    CONSTRAINT ck_information_qualitaet CHECK (
        qualitaets_stufe IN ('belastbar', 'eingeschraenkt', 'nicht_ausweisbar')
    ),
    CONSTRAINT ck_information_werte CHECK (referenz_kwh >= 0 AND ist_kwh >= 0),
    CONSTRAINT ck_information_abdeckung CHECK (abdeckung_pct >= 0 AND abdeckung_pct <= 100),
    CONSTRAINT ck_information_tage CHECK (tage_fehlend >= 0),
    CONSTRAINT ck_information_kandidaten CHECK (kandidaten_anzahl >= 1),
    CONSTRAINT ck_information_hash_laenge CHECK (octet_length(inhalt_hash) = 32),

    -- Zustellweg und Zeitpunkt gehoeren zusammen; ein Weg ohne Zeitpunkt ist
    -- eine Absicht, kein Nachweis.
    CONSTRAINT ck_information_zustellung_kohaerenz CHECK (
        (zugestellt_at IS NULL AND zustellweg IS NULL)
     OR (zugestellt_at IS NOT NULL AND zustellweg IS NOT NULL)
    ),

    -- HOECHSTENS EINE Information je Endkunde, Energietraeger und Monat.
    -- „Mindestens monatlich" ist eine Untergrenze fuer die Haeufigkeit, keine
    -- Einladung, denselben Monat mehrfach zu verschicken.
    CONSTRAINT ux_information_kunde_monat UNIQUE (endkunde_id, energietraeger, monat)
);

-- „Was ist fuer diesen Monat erzeugt, und was davon zugestellt?" — die Frage
-- des Erzeugungslaufs und die des Auflagen-Nachweises.
CREATE INDEX ix_information_monat ON nutzerinfo.information (monat, energietraeger);
CREATE INDEX ix_information_unzugestellt ON nutzerinfo.information (monat)
    WHERE zugestellt_at IS NULL;

COMMENT ON TABLE nutzerinfo.information IS
  'Monatliche Nutzerinformation je Endkunde und Energietraeger (TB-06, [Q3] Kap. 6). pii=indirekt (pseudonym ueber endkunde_id; Re-ID-Schluessel in identity). Zahlen eingefroren aus dem gebundenen analytics.berechnungslauf — dieselbe Aufloesung wie nachweis.einsparlauf_bindung, damit Kunde und Bewilligungsbehoerde nicht verschiedene Einsparungen sehen. retention=Versandnachweis bis F2 (retention-matrix.md).';
COMMENT ON COLUMN nutzerinfo.information.delta_kwh IS
  'referenz_kwh - ist_kwh. POSITIV = Einsparung, NEGATIV = Mehrverbrauch. BEWUSST OHNE die Vorzeichen-/Lueckenregel des BAFA-Nachweises (F2/F3): Kap. 6 verlangt die Angabe von Einsparungen UND Mehrverbraeuchen; einen Mehrverbrauch gegenueber dem Kunden auf null zu setzen waere eine Beschoenigung.';
COMMENT ON COLUMN nutzerinfo.information.zugestellt_at IS
  'Versand-/Bereitstellungsnachweis (TB-06). LEER, solange es keinen Zustellweg gibt — erzeugen ist nicht informieren, und die Auflage ist erst mit der Zustellung erfuellt.';
COMMENT ON COLUMN nutzerinfo.information.inhalt_hash IS
  'SHA-256 ueber den kanonisierten Inhalt. Kein Byte-Archiv, sondern deterministisches Re-Rendering + Hash-Vergleich (Muster ADR-0007 B14) — beantwortet: Stand das damals wirklich so drin?';

GRANT USAGE  ON SCHEMA nutzerinfo          TO edms_app;
GRANT SELECT, INSERT, UPDATE ON nutzerinfo.information TO edms_app;

-- `edms_retention` bekommt SELECT fuer die spaetere Fristpruefung, aber KEIN
-- DELETE: Der Versandnachweis laeuft auf F2 und steht damit unter der
-- Ausfuehrungssperre (Aktenvermerk AW-15). Dieselbe Linie wie bei
-- `nachweis.*` und `measurement.messwert_tag`.
GRANT USAGE  ON SCHEMA nutzerinfo          TO edms_retention;
GRANT SELECT ON nutzerinfo.information     TO edms_retention;
