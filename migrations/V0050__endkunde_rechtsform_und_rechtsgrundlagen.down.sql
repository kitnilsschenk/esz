-- Down zu V0050 (Votum 2026-09-07, AW-3/AW-5/AW-6).
--
-- Der Rueckbau stellt den Stand vor der Auswertung der User-Antworten her.
-- Das ist technisch verlustfrei — die Spalte ist dokumentarisch, nicht
-- berechtigend, und die Kommentare sind Text.
--
-- FACHLICH IST ER TROTZDEM EIN RUECKSCHRITT, und das gehoert hierher:
-- Die alten Kommentare behaupten fuer `identity.endkunde_pii.kontakt_enc`
-- eine Einwilligung, die es nach V0047 nicht gibt, und fuer `name_enc` einen
-- Vertrag, dessen Partei die Ansprechperson einer GmbH nicht ist. Wer dieses
-- Skript faehrt, stellt bekannte Unrichtigkeiten wieder her. Er sollte
-- wissen, warum.
--
-- Die Werte in `rechtsform_kategorie` gehen mit der Spalte verloren. Wurden
-- bereits Endkunden klassifiziert, ist der Bestand vorher zu sichern:
--
--   SELECT id, rechtsform_kategorie FROM energy.endkunde
--    WHERE rechtsform_kategorie <> 'unbestimmt';

-- Spaltenkommentare zurueck auf den Stand V0002.
COMMENT ON COLUMN identity.endkunde_pii.pseudonym_id IS
  'pii=true; grundlage=Re-Identifikations-Mapping (Verkettbarkeit) [Platzhalter -> final DSFA]; retention=an Subjekt gebunden; Löschung=Krypto-Shredding + Nullen des Mappings; ADR-0004 Anhang B, P4';
COMMENT ON COLUMN identity.endkunde_pii.name_enc IS
  'pii=true; grundlage=Art.6(1)(b) Vertrag / Art.6(1)(a) Einwilligung [Platzhalter -> final DSFA/RVT]; retention=Projektlaufzeit + gesetzl. Aufbewahrung; Sperrung statt Löschung (DS-08); ADR-0004 Anhang B, P1';
COMMENT ON COLUMN identity.endkunde_pii.anschrift_enc IS
  'pii=true; grundlage=Art.6(1)(b) Vertrag [Platzhalter -> final DSFA/RVT]; retention=Projektlaufzeit + gesetzl. Aufbewahrung; ADR-0004 Anhang B, P2';
COMMENT ON COLUMN identity.endkunde_pii.kontakt_enc IS
  'pii=true; grundlage=Art.6(1)(a) Einwilligung (TB-06 Nutzerinformation) [Platzhalter -> final DSFA/RVT]; retention=bis Widerruf/Projektende; ADR-0004 Anhang B, P3';
COMMENT ON COLUMN identity.anschlussnutzer_pii.pseudonym_id IS
  'pii=true; grundlage=Re-Identifikations-Mapping Datensubjekt (Verkettbarkeit, DS-07) [Platzhalter -> final DSFA]; retention=an Subjekt gebunden; Löschung=Krypto-Shredding + Nullen des Mappings; ADR-0004 Anhang B, analog P4';
COMMENT ON COLUMN identity.anschlussnutzer_pii.name_enc IS
  'pii=true; grundlage=Art.6(1)(f)/(a) -- Datensubjekt der Verbrauchsdaten (DS-07) [Platzhalter -> final DSFA/RVT]; retention=Nutzungsdauer + gesetzl. Aufbewahrung; Sperrung statt Löschung (DS-08); ADR-0004 Anhang B, P5';
COMMENT ON COLUMN identity.anschlussnutzer_pii.kontakt_enc IS
  'pii=true; grundlage=Art.6(1)(a) Einwilligung (DS-07 Datensubjekt) [Platzhalter -> final DSFA/RVT]; retention=bis Widerruf/Nutzungsende; ADR-0004 Anhang B, P6';

-- Begruendung der Endkunden-Zeile zurueck auf den Wortlaut aus V0047.
UPDATE consent.zweck_subjekt
   SET begruendung = 'Der Endkunde ist Vertragspartei; die Messung ist der Vertragsgegenstand (Art. 6 Abs. 1 lit. b). Ein Haekchen waere hier eine Zusage von Widerrufbarkeit, die nicht eingeloest werden kann — die Messung liefe nach einem Widerruf weiter, weil der Vertrag sie schuldet. Beendet wird sie durch Kuendigung, nicht durch Widerruf. VORBEHALT F-1/F-2.'
 WHERE zweck_code = 'messdaten_verarbeitung'
   AND subjekt_typ = 'endkunde';

-- CHECK und Spalte.
ALTER TABLE energy.endkunde DROP CONSTRAINT ck_endkunde_rechtsform_kategorie;
ALTER TABLE energy.endkunde DROP COLUMN rechtsform_kategorie;
