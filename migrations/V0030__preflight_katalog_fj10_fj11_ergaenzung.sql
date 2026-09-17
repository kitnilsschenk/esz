-- V0030__preflight_katalog_fj10_fj11_ergaenzung.sql
--
-- ADR-Bezug: ADR-0006 P4, ADR-0007 Teil C Auflage A12. Arbeitsauftrag
-- (backend-lead, "Verdrahte die letzten drei offenen Auflagen von ADR-0007"):
-- Auftrag 2 (Anschlussnutzer-Sperre, FJ-11a/b/c) und Auftrag 3 (Rohdaten-
-- Kette nicht aufloesbar, FJ-10) fuehren ZWEI neue Preflight-Regel-Codes,
-- die im dokumentierten Regelkatalog (`analytics.verfahren_version`,
-- code='foerderjahr_preflight_de02') bislang FEHLEN.
--
-- `analytics.verfahren_version` ist SCD2 UND "gepflegt AUSSCHLIESSLICH ueber
-- Migrationen" (V0019 D-A6-VERFAHREN-REVOKE, `edms_app` hat NUR SELECT) --
-- ein neuer Regel-Code darf NICHT durch stilles Ueberschreiben der
-- bestehenden `parameter_schema`-Zeile eingefuehrt werden (das waere ein
-- rueckwirkendes Editieren einer versionierten, als "version=1" bereits
-- referenzierten Katalogzeile). Diese Migration schliesst daher Version 1
-- (`gueltig_bis=now()`, `aktiv=false`) und fuegt Version 2 als NEUE,
-- vollstaendige Kopie MIT den zwei zusaetzlichen Regel-Eintraegen an
-- (append-only, identisches Muster zu `energy.messkonzept_version`).
--
-- WICHTIG (Arbeitsauftrag woertlich: "entwirf die Migration als V0030,
-- wende sie NICHT an"): diese Datei ist ein ENTWURF. Sie wurde NUR gegen
-- einen Wegwerf-Testcontainer verifiziert (`timescale/timescaledb:2.15.3-pg16-oss`),
-- NICHT gegen die Dev-DB (Port 5437) angewendet, und NICHT committed.
--
-- =====================================================================
-- Warum eine NEUE Version, nicht ein Nachtrag "nur die zwei neuen Keys"?
-- =====================================================================
-- `parameter_schema` ist EIN JSONB-Dokument je Katalogzeile (kein
-- Zeilen-je-Regel-Modell) -- ein "Nachtrag" waere technisch ein UPDATE
-- derselben Zeile, was der SCD2-Konvention dieser Tabelle widerspricht
-- (`PreflightService`-Kommentar: "der KATALOG-Eintrag selbst wird nur ALS
-- REFERENZ GELESEN (profil_code/profil_version am Preflight-Kopf)" --
-- historische Preflight-Zeilen referenzieren `profil_version=1` und muessen
-- WEITERHIN denselben, unveraenderten Inhalt unter dieser Versionsnummer
-- vorfinden koennen, DE-03-Nachvollziehbarkeit).
--
-- Der `PreflightService` selbst validiert `dto.profilCode` GEGEN die
-- LITERAL-Konstante `PREFLIGHT_PROFIL_CODE` (`verfahren.const.ts`) und liest
-- `analytics.verfahren_version` nur per `findAktiveVersion(code)` (IMMER die
-- neueste `aktiv=true`-Zeile) -- eine neue Version hier erfordert KEINE
-- Anwendungscode-Aenderung (das Delta liegt ausschliesslich im Katalog-Text
-- selbst, der Preflight-Ausfuehrungsmotor liest `parameter_schema` ohnehin
-- NICHT dynamisch, s. V0024-Migrationskopf "Katalog-Eintrag ... NICHT
-- interpretiert").
--
-- =====================================================================
-- Inhaltliches Delta gegenueber Version 1
-- =====================================================================
-- (1) NEUER Eintrag "FJ-10" (Auftrag 3, ADR-0007 A12): Rohdaten-Sperrstatus
--     strukturell nicht aufloesbar (fehlende `energy.messkonzept_version_
--     energietraeger_system`-Zuordnung fuer mindestens einen relevanten
--     Lauf im Scope-Paar). `const: "blocker"` auf Befund-Ebene, ABER laut
--     `AUSGENOMMENE_FOERDERJAHR_BLOCKER_REGEL_CODES` (`verfahren.const.ts`)
--     NICHT Teil von `preflight.blocker_anzahl` -- die einzige Wirkung ist
--     die Export-Gate-Pruefung der Kategorie `rohdaten`
--     (`nachweis-export-renderer.ts`).
-- (2) NEUE Eintraege "FJ-11a"/"FJ-11b"/"FJ-11c" (Auftrag 2, ADR-0006 P4):
--     Anschlussnutzer-Sperre, Analogon zu FJ-07a/b/c (dieselbe Dreiteilung,
--     angewendet auf `energy.anschlussnutzer.verarbeitungs_status` statt
--     `energy.endkunde.verarbeitungs_status`). FJ-11c ist -- wie FJ-07c --
--     NICHT Teil von `preflight.blocker_anzahl` (paarbezogen, s. o.).
-- (3) `$id` auf ".../foerderjahr_preflight_de02:2" aktualisiert (Konvention:
--     der `$id`-Suffix spiegelt die Katalog-`version`).
-- (4) `golden_vectors` bleibt UNVERAENDERT `'[]'::jsonb` -- es existiert
--     weiterhin kein Golden-Fixture-Startsatz fuer den Preflight-
--     Ausfuehrungsmotor (unveraendert seit V0024, kein Teil dieses
--     Arbeitsauftrags).
-- (5) ALLE Eintraege aus Version 1 (FJ-01..FJ-09) bleiben WORTGLEICH
--     erhalten -- dieser Entwurf aendert an ihnen NICHTS.
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- (1) UPDATE: Version 1 schliessen (gueltig_bis=now(), aktiv=false).
-- (2) INSERT: Version 2 (vollstaendige Kopie + Delta oben).

-- =====================================================================
-- (1) Version 1 schliessen (SCD2)
-- =====================================================================

UPDATE analytics.verfahren_version
   SET aktiv = false,
       gueltig_bis = now()
 WHERE code = 'foerderjahr_preflight_de02'
   AND version = 1
   AND aktiv = true
   AND gueltig_bis IS NULL;

-- =====================================================================
-- (2) Version 2 (vollstaendige Kopie + FJ-10/FJ-11a/b/c)
-- =====================================================================

INSERT INTO analytics.verfahren_version
    (id, code, version, parameter_schema, golden_vectors, beschreibung, aktiv, gueltig_ab)
VALUES
    (gen_random_uuid(), 'foerderjahr_preflight_de02', 2,
    $params$
    {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "urn:edms:nachweis:verfahren:foerderjahr_preflight_de02:2",
      "type": "object",
      "additionalProperties": false,
      "required": ["regeln"],
      "properties": {
        "regeln": {
          "type": "object",
          "additionalProperties": false,
          "beschreibung": "Preflight-Regel-Startsatz (ADR-0007 B4-Tabelle). FJ-07 gemaess Auflage A11 (C2/C3/C4) durch FJ-07a/b/c ERSETZT -- die urspruengliche, undifferenzierte FJ-07 (Foerderjahr-Blocker bei JEDER Art.-18-Sperre) ist eine Fehlkonstruktion (C2, 'eine Kontrolle, die zu ihrer eigenen Umgehung draengt, ist keine') und wird hier NICHT mehr gefuehrt. FJ-08 gemaess Auflage A20 auf den DWD-Aenderungsvermerk erweitert. Version 2 (dieser Katalog-Eintrag) ergaenzt FJ-10 (ADR-0007 A12, Rohdaten-Sperrstatus nicht aufloesbar) und FJ-11a/b/c (ADR-0006 P4, Anschlussnutzer-Sperre, Analogon zu FJ-07a/b/c) -- backend-lead-Design-Entscheidung 2026-08-26, s. src/backend/src/nachweis/verfahren.const.ts und domain/paar-einschraenkung.ts.",
          "properties": {
            "FJ-01": {"const": "blocker", "beschreibung": "Foerderjahr-Definition vorhanden, Monatsmenge nicht leer"},
            "FJ-02": {"const": "blocker", "beschreibung": "je erwartetem Paar x Monat genau eine Bindung aufloesbar (D2)"},
            "FJ-03": {"const": "blocker", "beschreibung": "gebundener Monat nicht_ausweisbar ohne dokumentierte Behandlung (F3)"},
            "FJ-04": {"const": "warnung", "beschreibung": "gebundener Monat eingeschraenkt bzw. tage_fehlend > 0 -- Pflichtausweis im Metablatt (TB-04/TB-09)"},
            "FJ-05": {"const": "blocker", "beschreibung": "mehrdeutige Lauf-Kandidatenlage mit ABWEICHENDEN Werten (D2) -- Widerspruch in der Rechenhistorie"},
            "FJ-06": {"const": "warnung", "status": "bestaetigt (ADR-0007 B14, Weg b)",
              "beschreibung": "Substitutionsfall im Umfang -- Weg (b): Warnung + Teilmengen-Ausweis (status=ausgeschlossen, ausschluss_grund_code=energietraeger_substitution_v1_nicht_unterstuetzt). Weg (a) (Blocker) wurde durch B14 verworfen -- Substitution wird in v1 NICHT gerechnet. Seit V0029/O-B3b real verdrahtet gegen energy.messkonzept_version_energietraeger.energietraeger_substitution (kein Stub mehr)."},
            "FJ-07a": {"const": "kein_befund", "status": "bestaetigt (Auflage A11)",
              "beschreibung": "energy.endkunde.verarbeitungs_status=geloescht (Art. 17 vollzogen) -- KEIN Befund, regulaerer Ausweis. 'kein_befund' ist absichtlich KEIN Wert der preflight_befund.schwere-Domaene (blocker|warnung|hinweis) -- diese Zeile erzeugt strukturell GAR KEINE Befund-Zeile."},
            "FJ-07b": {"const": "warnung", "status": "bestaetigt (Auflage A11)",
              "beschreibung": "Art.18(1)(a)/(1)(c) (einschraenkung_grund_code=art18_1a_richtigkeit|art18_1c_rechtsverteidigung_betroffener) -- Ausweis MIT Kennzeichnung, Paar bleibt status=ausgewiesen. OFFENER PUNKT: die konkrete Kennzeichnungs-Spalte am Ergebnis-Artefakt ist NICHT Teil von V0025 -- s. Migrations-Kommentar dort."},
            "FJ-07c": {"const": "blocker", "status": "bestaetigt (Auflage A11)",
              "beschreibung": "Art.18(1)(b)/(1)(d) (einschraenkung_grund_code=art18_1b_unrechtmaessig|art18_1d_widerspruch) -- PAAR-Ausschluss (status=ausgeschlossen, ausschluss_grund_code=datenschutzrechtliche_einschraenkung). Blocker-Schwere bezieht sich auf das PAAR, NICHT mehr auf das gesamte Foerderjahr (C2: Kernkorrektur von A11). Zaehlt NICHT in preflight.blocker_anzahl."},
            "FJ-08": {"const": "blocker", "status": "erweitert (Auflage A20)",
              "beschreibung": "Attributions-Vorbedingung: DWD_QUELLENVERMERK UND DWD_AENDERUNGSVERMERK (zentrale Konstante src/backend/src/berechnung/klima/dwd-quellenvermerk.const.ts) duerfen KEINEN Platzhalter-Marker tragen -- NUR wenn tatsaechlich DWD-Klimadaten (nicht Grundlast-/Synthetik-Laeufe) in mindestens einen gebundenen Lauf eingegangen sind (bedingte Attribution, sonst Falschangabe, A20)."},
            "FJ-09": {"const": "blocker", "beschreibung": "Lauf/Umfang enthaelt synthetische Daten (synthetic=true) -- Blocker NUR fuer art=foerderjahr_nachweis"},
            "FJ-10": {"const": "blocker", "status": "neu (ADR-0007 A12, backend-lead-Design-Entscheidung 2026-08-26)",
              "beschreibung": "Rohdaten-Sperrstatus strukturell nicht aufloesbar: mindestens ein relevanter analytics.berechnungslauf im Scope-Paar hat ein mvet_id OHNE jede Zuordnung in energy.messkonzept_version_energietraeger_system (V0028-Uebergangszustand, seit V0028 strukturell moeglich, vorher UNBEDINGT wahr fuer ALLE Laeufe). Zaehlt NICHT in preflight.blocker_anzahl (kein Foerderjahr-Blocker) -- einzige Wirkung: Export-Kategorie rohdaten (analytics.eingang_messwert_tag) wird fuer diesen Export NICHT gerendert (nachweis-export-renderer.ts rohdatenErlaubt())."},
            "FJ-11a": {"const": "kein_befund", "status": "neu (ADR-0006 P4, Analogon zu FJ-07a)",
              "beschreibung": "energy.anschlussnutzer.verarbeitungs_status=geloescht (Art. 17 vollzogen) -- KEIN Befund, regulaerer Ausweis. Aufgeloest ueber die seit V0028 verfuegbare Kette mvet_id -> messkonzept_version_energietraeger_system -> system_id -> nutzungsverhaeltnis -> anschlussnutzer_id."},
            "FJ-11b": {"const": "warnung", "status": "neu (ADR-0006 P4, Analogon zu FJ-07b) -- HEUTE STRUKTURELL NICHT ERREICHBAR",
              "beschreibung": "Vorbereitet fuer einen kuenftigen dokumentierten Einschraenkungsgrund an energy.anschlussnutzer (analog einschraenkung_grund_code am Endkunden, V0024) -- diese Spalte existiert (Stand V0029) NICHT, daher erreicht jeder gesperrte Anschlussnutzer heute IMMER FJ-11c (fail-closed, s. dort)."},
            "FJ-11c": {"const": "blocker", "status": "neu (ADR-0006 P4, Analogon zu FJ-07c)",
              "beschreibung": "energy.anschlussnutzer.verarbeitungs_status=gesperrt -- PAAR-Ausschluss (status=ausgeschlossen, ausschluss_grund_code=datenschutzrechtliche_einschraenkung, identischer Sammelcode wie FJ-07c). Ueberlappungs-Semantik (User-Entscheidung 2026-08-26): greift, wenn IRGENDEIN energy.nutzungsverhaeltnis des Anschlussnutzers den Lauf-Zeitraum (analytics.berechnungslauf.periode_von/periode_bis, verankert ueber parameter->>'tages_zeitzone', Default Europe/Berlin) UEBERLAPPT -- nicht nur ein zum Lauf-Erstellungszeitpunkt aktuelles. Heute IMMER erreicht (kein Grund-Feld, s. FJ-11b) -- fail-closed by design, NICHT Bestandsdaten-Sonderfall. Zaehlt NICHT in preflight.blocker_anzahl."}
          }
        }
      }
    }
    $params$::jsonb,
    '[]'::jsonb,
    'Preflight-Regelkatalog (ADR-0007 B4) Version 2: FJ-01..FJ-09 UNVERAENDERT aus Version 1 uebernommen, ERGAENZT um FJ-10 (Auftrag 3, ADR-0007 A12, Rohdaten-Kette nicht aufloesbar) und FJ-11a/b/c (Auftrag 2, ADR-0006 P4, Anschlussnutzer-Sperre). golden_vectors weiterhin bewusst leer (unveraendert seit V0024, kein Preflight-Golden-Fixture-Startsatz Teil dieses Arbeitsauftrags). ENTWURF -- NICHT auf die Dev-DB angewendet, Freigabe durch technical-director/compliance-director aussteht.',
    true, now());
