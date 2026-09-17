-- V0051 — Der Tagesbestand. Stufe B bekommt ein Zuhause.
--
-- Grundlage: `compliance/dsgvo/retention-matrix.md` Rev. 9/10 (O2, Stufe A /
-- Stufe B) und das Votum vom 2026-09-07 (Abschnitt 4): Die
-- Ausfuehrungssperre ist fuer alles Reversible und Datenmenge-Reduzierende
-- aufgehoben — namentlich fuer die **Verdichtung auf Tagesgranularitaet**.
--
-- DER BEFUND, DER DIESE MIGRATION AUSGELOEST HAT
-- ---------------------------------------------
-- Die Retention-Entscheidung O2 teilt die Rohmesswerte in zwei Stufen:
--
--   Stufe A  15-Minuten-Aufloesung  -> Foerderjahresende + 24 Monate,
--                                      danach VERDICHTUNG auf Tage, dann
--                                      `drop_chunks`. Haengt NICHT am
--                                      Zuwendungsbescheid, sofort ausfuehrbar.
--   Stufe B  Tages-/Nachweisgranularitaet -> laeuft auf F2.
--
-- Die Begruendung dafuer ist stark: DE-02/TB-09 verlangen Tagesgranularitaet,
-- nicht 15 Minuten — nur fuer sie ist eine Aufbewahrungspflicht begruendbar.
-- Und genau die hohe Aufloesung ist das Leitrisiko (DSFA-0001 Risiko 3.1,
-- 5x5). Eine Retention, die den inferenzstaerksten Bestand am laengsten
-- haelt, waere die schlechteste denkbare Umsetzung von Art. 5 Abs. 1 lit. c/e.
--
-- **Nur: Stufe B existiert im Schema nicht.** Tageswerte gibt es heute
-- ausschliesslich in `analytics.eingang_messwert_tag` — und die Tabelle ist
-- ueber `snapshot_id` an einen BERECHNUNGSLAUF gebunden. Fuer einen
-- Messkanal oder einen Zeitraum, der nie Eingang eines Laufes war, gibt es
-- keinen Tageswert.
--
-- Waere Stufe A in diesem Zustand ausgefuehrt worden, haette der
-- `drop_chunks` genau die Granularitaet vernichtet, die aufzubewahren ist.
-- Die Verdichtung ist deshalb keine Vorbereitung der Loeschung, sondern ihre
-- **Vorbedingung**: Ohne vollstaendigen Tagesbestand darf Stufe A nicht
-- laufen. Diese Migration baut den Bestand; der Lauf, der ihn fuellt,
-- entsteht im selben Commit.
--
-- WARUM DIE RECHENVORSCHRIFT NICHT NEU ERFUNDEN WIRD
-- --------------------------------------------------
-- Der Tageswert MUSS zeichengleich dem entsprechen, was die Berechnung aus
-- denselben Rohwerten gebildet haette (`berechnung/persistence/
-- analytics-messwert-monat.repository.ts#berechneTagesaggregation`).
-- Andernfalls entstuende nach dem `drop_chunks` ein Bestand, der dem
-- eingereichten Nachweis widerspricht — und niemand koennte den Unterschied
-- noch aufklaeren, weil die Rohwerte weg waeren.
--
-- Uebernommen wird deshalb unveraendert:
--   * lokaler Kalendertag ueber `date_trunc('day', ts AT TIME ZONE <tz>)`,
--     bewusst NICHT `time_bucket(..., timezone => ...)` (ADR-0006 D4 —
--     vermeidet jede Timescale-Lizenzfrage, s. `.claude/rules/dependencies.md`),
--   * `intervall_verbrauch` -> der Wert selbst; `kumulativ_zaehlerstand` ->
--     die Differenz zum Vorwert, NULL bei fehlendem Vorwert oder negativer
--     Differenz (Zaehlerwechsel/-ueberlauf),
--   * Tageswert = `sum(verbrauch)`, `qualitaet_min = min(measurement.rang(...))`,
--   * Tage OHNE gueltige Differenz werden NIE als 0-kWh-Zeile geschrieben.
--
-- WARUM DIE ZEITZONE IN DER ZEILE STEHT
-- Der Tag ist keine Eigenschaft der Messung, sondern der Zeitzone, in der man
-- sie schneidet. Eine spaetere Umstellung wuerde denselben `tag` still
-- umdeuten, und nach dem `drop_chunks` waere das nicht mehr nachrechenbar.
-- Die Spalte macht die Annahme pruefbar, unter der die Zeile entstanden ist —
-- der Lauf verweigert die Arbeit, wenn sie nicht mehr passt.
--
-- KEINE HYPERTABLE, UND WARUM
-- Ein Kanal erzeugt 365 Zeilen im Jahr statt 35.040. Der Bestand ist um drei
-- Groessenordnungen kleiner als `measurement.messwert`; eine
-- Chunk-Partitionierung braeuchte es dafuer nicht, und sie waere hier sogar
-- schaedlich: Der Tagesbestand muss den `drop_chunks` auf der 15-Minuten-
-- Hypertable UEBERLEBEN. Zwei getrennte Tabellen machen genau das
-- offensichtlich.
--
-- Review-Bedarf: `database-lead` (Grants, Aggregat-Semantik),
-- `compliance-director` (Stufe-B-Bestand, Retention-Matrix-Zeile),
-- `timescale-engineer` (Wechselwirkung mit `drop_chunks`).

-- =====================================================================
-- measurement.messwert_tag — der Nachweisbestand in Tagesgranularitaet
-- =====================================================================
CREATE TABLE measurement.messwert_tag (
    messkanal_key    integer       NOT NULL,   -- = energy.messkanal.kanal_key (FK-los, Konvention V0002)
    tag              date          NOT NULL,   -- LOKALER Kalendertag, geschnitten in `zeitzone`
    zeitzone         text          NOT NULL,   -- IANA-Kennung, unter der `tag` gebildet wurde
    verbrauch_kwh    numeric(18,3) NOT NULL,   -- Skala wie measurement.messwert.wert
    qualitaet_min    smallint      NOT NULL,   -- min(measurement.rang(qualitaet, herkunft)) des Tages
    anzahl_messwerte integer       NOT NULL,   -- Rohwerte, die in diesen Tag eingegangen sind
    verdichtet_at    timestamptz   NOT NULL DEFAULT now(),

    PRIMARY KEY (messkanal_key, tag),

    -- Ein Tag ohne Rohwert entsteht nicht (s. `HAVING sum(...) IS NOT NULL`
    -- in der Rechenvorschrift). Die Grenze faengt eine leere Zeile ab, die
    -- nur durch einen Fehler entstehen koennte.
    CONSTRAINT ck_messwert_tag_anzahl CHECK (anzahl_messwerte >= 1),
    -- Verbrauch ist nicht negativ -- die Rechenvorschrift verwirft negative
    -- Differenzen als NULL, bevor summiert wird.
    CONSTRAINT ck_messwert_tag_verbrauch CHECK (verbrauch_kwh >= 0),
    CONSTRAINT ck_messwert_tag_zeitzone CHECK (length(btrim(zeitzone)) > 0)
);

COMMENT ON TABLE measurement.messwert_tag IS
  'Stufe-B-Bestand der Rohmesswert-Retention (O2, retention-matrix.md): Verbrauch je Messkanal und LOKALEM Kalendertag. pii=indirekt (pseudonym ueber messkanal_key -> zaehler -> system -> endkunde; Re-ID-Schluessel in identity). grundlage=DE-02/TB-09 (Vollstaendigkeitsnachweis in Tagesgranularitaet) + Art. 17 Abs. 3 lit. b; retention=F2 (retention-matrix.md). VORBEDINGUNG fuer Stufe A: Ohne vollstaendigen Tagesbestand darf drop_chunks auf measurement.messwert NICHT laufen.';
COMMENT ON COLUMN measurement.messwert_tag.tag IS
  'Lokaler Kalendertag, gebildet ueber date_trunc(''day'', ts AT TIME ZONE zeitzone) -- bewusst NICHT time_bucket(timezone => ...), ADR-0006 D4 (Timescale-Lizenzgrenze).';
COMMENT ON COLUMN measurement.messwert_tag.zeitzone IS
  'IANA-Kennung, unter der `tag` geschnitten wurde. Steht IN der Zeile, weil der Tag keine Eigenschaft der Messung ist, sondern der Zeitzone: Eine spaetere Umstellung wuerde denselben Tag still umdeuten, und nach dem drop_chunks waere das nicht mehr nachrechenbar.';
COMMENT ON COLUMN measurement.messwert_tag.qualitaet_min IS
  'Niedrigster Rang des Tages (measurement.rang(qualitaet, herkunft)) -- WORST-Case, damit ein einzelner Ersatzwert den Tag nicht besser aussehen laesst, als er ist. Semantik identisch zu analytics.eingang_messwert_tag.qualitaet_min (ADR-0006 B12.4).';
COMMENT ON COLUMN measurement.messwert_tag.anzahl_messwerte IS
  'Rohwerte, die in diesen Tag eingegangen sind. Traegt die Sicherung gegen Ueberschreiben mit unvollstaendiger Basis: Eine Neuverdichtung darf eine bestehende Zeile nur ersetzen, wenn sie auf MINDESTENS so vielen Rohwerten beruht.';

-- Zeitfenster-Abfragen ueber alle Kanaele (Vollstaendigkeitspruefung vor dem
-- Stufe-A-Drop: "gibt es fuer JEDEN Kanal Tageswerte in diesem Fenster?").
-- Der Primaerschluessel fuehrt mit `messkanal_key` und traegt diese Richtung
-- nicht.
CREATE INDEX ix_messwert_tag_tag ON measurement.messwert_tag (tag);

-- =====================================================================
-- Grants
-- =====================================================================
-- DIE VERDICHTUNG IST KEINE LOESCHUNG. Sie leitet ab und schreibt hinzu --
-- fachlich ein Rollup, kein Retentionlauf. Sie laeuft deshalb im
-- App-Kontext und nicht unter `edms_retention`.
GRANT SELECT, INSERT, UPDATE ON measurement.messwert_tag TO edms_app;

-- `edms_retention` bekommt NUR Lesezugriff: Die Rolle muss vor einem
-- Stufe-A-Drop pruefen koennen, ob der Tagesbestand fuer das Fenster
-- vollstaendig ist. Sie bekommt bewusst KEIN `DELETE` -- Stufe B laeuft auf
-- F2 und steht damit weiter unter der Ausfuehrungssperre (Aktenvermerk
-- AW-15). Dieselbe Linie wie bei `nachweis.*`: Ein Grant, den vor Aufhebung
-- der Sperre niemand braucht, ist nur ein Risiko.
GRANT SELECT ON measurement.messwert_tag TO edms_retention;
GRANT USAGE  ON SCHEMA measurement       TO edms_retention;
