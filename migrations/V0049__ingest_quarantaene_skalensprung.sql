-- V0049 — Quarantaenegrund `skalensprung_verdacht` (ADR-0011 O3 Punkt 3).
--
-- DER FALL, DEN BISHER NIEMAND FAENGT
-- ----------------------------------
-- Die Werte kommen aus dem `object`, das ChirpStack am Geraeteprofil bereits
-- dekodiert hat (ADR-0011 D2). Die Rechenvorschrift dafuer — der Codec —
-- liegt damit AUSSERHALB unserer Versionskontrolle. Wird dort ein
-- Wandlerverhaeltnis geaendert (1:100 -> 1:200), aendert sich weder ein
-- Feldname noch ein Typ noch eine Einheit; nur die Zahl ist ab sofort eine
-- andere. Der Strukturhash aus O3 Punkt 2 sieht das nicht, und die
-- Monotonie-Pruefung sieht es auch nicht: Ein Zaehlerstand, der springt,
-- STEIGT ja.
--
-- Ein Foerderjahr, das auf einer still geaenderten Rechenvorschrift
-- gerechnet wird, ist falsch nachgewiesen. Deshalb fail-closed: Der
-- verdaechtige Wert wird NICHT geschrieben, sondern landet im Arbeitsvorrat.
--
-- WORAN DER VERDACHT FESTGEMACHT WIRD
-- Ein Zuwachs, der NICHT ALS VERBRAUCH erklaerbar ist, wohl aber ALS FAKTOR
-- AUF DEN ZAEHLERSTAND. Die Schwellen und ihre messtechnische Begruendung
-- stehen in `ingest-flow/skalensprung.util.ts` — bewusst in der Anwendung
-- und nicht im Schema, wie schon die Herzschlag-Schwelle aus V0039: Es sind
-- Erfahrungswerte, die sich mit dem Geraetepark aendern, keine Invarianten
-- des Datenmodells.
--
-- WAS DIESE MIGRATION NICHT TUT
-- Sie baut den Dekodierungs-Profil-Katalog aus O3 Punkt 1/2/4 NICHT. Der ist
-- eine eigene Migration mit eigener Wirkung auf `measurement.messwert`
-- (Profil-Schluessel je Messwert) und bleibt offen. Punkt 3 steht unabhaengig
-- davon: Er braucht keinen Katalog, sondern nur die Zahlenreihe.
--
-- Review-Bedarf: `database-lead` (CHECK-Erweiterung, kein Datenbestand
-- betroffen), `iot-ingestion-engineer` (Schwellen).

-- =====================================================================
-- Quarantaenegrund `skalensprung_verdacht`
-- =====================================================================
-- Erweiterung der geschlossenen Liste aus V0011 (zuletzt V0042). Wortgleich
-- mit `INGEST_REASON_CODES` in `reason-code.ts` zu halten.
ALTER TABLE ingest.eingang_quarantaene
    DROP CONSTRAINT ck_quarantaene_grund;

ALTER TABLE ingest.eingang_quarantaene
    ADD CONSTRAINT ck_quarantaene_grund CHECK (grund IN (
        'envelope_parse_fehler', 'devEUI_unbekannt', 'unbekannter_geraetetyp',
        'decode_fehler', 'kanal_unbekannt', 'unplausibel_monotonie_verletzt',
        'einheit_inkonsistent', 'zeitstempel_fehlt',
        'herkunft_widerspruechlich', 'skalensprung_verdacht'
    ));
