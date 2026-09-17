-- V0029__mvet_substitutionsmerkmal_und_anschlussnutzer_statusliste.sql
--
-- ADR-Bezug: docs/adr/ADR-0007-einsparberechnung-bafa-export.md B13.4/B14
-- (O-B3b, Substitutions-Merkmal) + V0023 "OFFENER KLAERUNGSPUNKT" Punkt (3)
-- (energy.anschlussnutzer.verarbeitungs_status-Wertemenge, ADR-0006 P4,
-- ADR-0007 A12). Direkter Arbeitsauftrag (database-lead), zwei kleine,
-- blockierende Schema-Ergaenzungen. NUR ENTWURF -- kein Apply gegen die
-- Dev-DB (Port 5437), kein Commit -- ausschliesslich gegen einen
-- Wegwerf-Testcontainer (timescale/timescaledb:2.15.3-pg16-oss) verifiziert.
--
-- =====================================================================
-- Teil 1 -- Substitutions-Merkmal (O-B3b, ADR-0007 B14)
-- =====================================================================
--
-- Befund: nachweis/berechnung kennen den Ausschlussgrund
-- `energietraeger_substitution_v1_nicht_unterstuetzt` (V0025) und den Status
-- `nicht_nachweisbar_substitution` (B13.4), aber es gibt KEIN Merkmal, an dem
-- das System einen Substitutionsfall erkennt.
-- `src/backend/src/nachweis/substitution-erkennung.ts` (`istSubstitutionsfall`)
-- ist ein dokumentierter Stub, der immer `false` liefert und ausdruecklich
-- als der EINE Andockpunkt fuer ein kuenftiges Merkmal markiert ist -- diese
-- Migration liefert das Merkmal, verdrahtet den Stub aber NICHT (App-Scope,
-- savings-engineer/backend-lead).
--
-- User-Entscheidung (ADR-0007 B14, 2026-08-20): ein EXPLIZITES Feld, vom
-- Betriebs-Team gesetzt -- NICHT aus der mvet-Historie abgeleitet, NICHT aus
-- der (nicht gebauten) TB-03-Schwellwert-Erkennung.
--
-- (D-EBENE) Ebenen-Entscheidung: `energy.messkonzept_version_energietraeger`
--   (mvet), NICHT `energy.messkonzept_version`. B14s Fliesstext spricht zwar
--   von einem "Kennzeichen an der Messkonzept-Version", aber die
--   Design-Folge-Klammer IM SELBEN BESCHLUSS ist praeziser und WIDERSPRICHT
--   der Zusammenfassung: "kleines Schema-/DTO-/UI-Delta an
--   `messkonzept_version_energietraeger`; gehoert in die Migrationsreihenfolge
--   O-B12 vor das nachweis-Schema" (B14, woertlich). Fachlich ist mvet auch
--   die richtige Ebene, unabhaengig von diesem Formulierungs-Widerspruch:
--     1. B13.4 definiert den Ausschluss PAARWEISE je (Endkunde,
--        Energietraeger) -- "Betroffene (Endkunde, Traeger)-Paare erhalten
--        foerderjahr_status = 'nicht_nachweisbar_substitution'". mvet IST
--        exakt diese Paar-Entitaet (1 Zeile je Energietraeger einer
--        Messkonzept-Version, UNIQUE(messkonzept_version_id, energietraeger)
--        seit V0002) -- messkonzept_version ist die Version INSGESAMT, bei
--        Mehr-Energietraeger-Messkonzepten (Strom+Waerme in einer Version)
--        koennte nur EIN Traeger substituiert sein. Ein Flag auf
--        `messkonzept_version` waere entweder zu grob (beide Traeger
--        faelschlich betroffen) oder muesste seinerseits wieder
--        energietraeger-scharf gemacht werden -- das ist bereits mvet.
--     2. Der Ausschlussgrund selbst wirkt auf mvet-Ebene: V0025s
--        `nachweis.einsparlauf_ergebnis` traegt `ausschluss_grund_code`
--        PRO (Endkunde, Energietraeger, Foerderjahr)-Zeile, referenziert also
--        dieselbe Granularitaet wie mvet, nicht wie messkonzept_version.
--     3. Praezedenz V0028 (database-lead-Votum S8, seit V0002): Baseline
--        selbst ist bereits NICHT auf messkonzept_version, sondern auf mvet
--        modelliert ("eindeutige Baseline-Zuordnung bei
--        Mehr-Energietraeger-Messkonzepten") -- dasselbe Argument gilt hier.
--   Kein Widerspruch zu V0028 (`messkonzept_version_energietraeger_system`):
--   jene Migration eroeffnet nur den Pfad fuer eine SPAETERE, OPTIONALE
--   Plausibilitaetspruefung (Traegerwechsel ueber die mvet-Historie sichtbar,
--   Kennzeichen fehlt) -- sie ersetzt das hier gebaute Merkmal nicht (V0028
--   Migrations-Kopf, eigener Absatz dazu).
--
-- (D-DEFAULT) `NOT NULL DEFAULT false`: Substitution ist der Ausnahmefall,
--   Bestandszeilen sind mangels Merkmal bislang nicht erkennbare
--   Nicht-Substitutionsfaelle (kein rueckwirkendes Erkennen, kein
--   Backfill-Risiko). ENTSCHEIDEND (V0028-Lehre, dort NOT NULL OHNE Default
--   brach `insertEnergietraeger()`): ein DEFAULT verhindert genau diesen
--   Fehler. Verifiziert (s. Verifikations-Protokoll am Dateiende): der
--   bestehende Schreibpfad `EnergyMesskonzeptRepository.insertEnergietraeger()`
--   (src/backend/src/stammdaten/persistence/energy/
--   energy-messkonzept.repository.ts) nennt `energietraeger_substitution` in
--   seiner Spaltenliste NICHT -- die Spalte faellt bei jedem INSERT ueber
--   diesen Pfad auf den DEFAULT `false` zurueck, KEIN NOT-NULL-Verstoss
--   (23502), KEIN Codepatch vor Anwendung dieser Migration noetig (Kontrast
--   zu V0028s `endkunde_id`, die dort ZWINGEND einen Rollout-Codepatch
--   brauchte).
--
-- (D-KEIN-INDEX) Kein Index auf `energietraeger_substitution`: die Spalte
--   wird zusammen mit der ohnehin bereits geladenen mvet-Zeile gelesen
--   (Preflight/Einsparlauf laden mvet je Endkunde/Traeger, kein
--   Such-Hot-Path ueber ALLE mvet-Zeilen nach `= true`) -- spekulativer
--   Index waere .claude/rules/database-migrations.md-widrig.
--
-- (D-KEIN-PII) Keine `pii=true`-Markierung: Schema `energy` ist per
--   Design PII-frei (rote Linie 1, V0002); das Merkmal ist ein technisches
--   Attribut des Messkonzepts (Energietraeger-Wechsel), keine Angabe ueber
--   Ausuebung eines Betroffenenrechts -- anders als `einschraenkung_grund_code`
--   (V0024), das deshalb bewusst NICHT als Praezedenzfall fuer eine
--   PII-Markierung hier herangezogen wird.
--
-- NICHT Teil dieser Migration (App-Scope, spaeter): `istSubstitutionsfall()`
-- auf eine echte Abfrage dieser Spalte umstellen; `InsertEnergietraegerInput`
-- um ein optionales `energietraegerSubstitution`-Feld erweitern, damit das
-- Betriebs-Team es beim Erfassen tatsaechlich setzen kann (aktuell gibt es
-- dafuer noch KEINEN Schreibpfad -- diese Migration schafft nur die Spalte,
-- kein UI/API-Feld) -- Empfehlung an backend-lead/savings-engineer.
--
-- =====================================================================
-- Teil 2 -- verarbeitungs_status-Werteliste auf energy.anschlussnutzer
-- =====================================================================
--
-- Befund (WICHTIGE KORREKTUR gegenueber der Auftragsannahme, introspiziert,
-- nicht geraten): `energy.endkunde.verarbeitungs_status` hat KEINEN
-- DB-CHECK -- weder in V0002 (nur Inline-SQL-Kommentar
-- "aktiv|gesperrt(Art.18)|geloescht/anonym(Art.17)") noch in einer
-- Folgemigration (V0019/V0023/V0024 durchsucht, kein Treffer). "Dokumentierte
-- Wertemenge" bedeutet hier: (a) der Inline-Kommentar in V0002, (b) die
-- applikationsseitige Type-Union `VerarbeitungsStatus = 'aktiv' | 'gesperrt'
-- | 'geloescht'` (src/backend/src/stammdaten/persistence/energy/
-- energy-endkunde.repository.ts, identisch dupliziert in
-- src/backend/src/nachweis/domain/paar-einschraenkung.ts) -- KEIN DB-seitiger
-- Constraint. Es gibt also kein CHECK "beim Endkunden", den diese Migration
-- 1:1 spiegeln koennte -- uebernommen wird stattdessen die introspizierte,
-- im Code tatsaechlich verwendete Werteliste (aktiv|gesperrt|geloescht;
-- `toVerarbeitungsStatus()` in beiden obigen Repositories bildet jeden
-- anderen Wert -- STILLSCHWEIGEND, ohne Fehler -- auf 'aktiv' ab, was ohne
-- DB-CHECK ein unbemerktes Maskierungsrisiko fuer Tippfehler/Fremdwerte ist).
--
-- Diese Migration behebt NUR den Anschlussnutzer-Fall (Auftragsumfang,
-- V0023 D-SCOPE-ANSCHLUSSNUTZER Punkt (3)). Der spiegelbildliche
-- CHECK-Nachtrag auf `energy.endkunde.verarbeitungs_status` selbst ist
-- NICHT Teil dieser Migration -- offener Punkt, s. Dateiende.
--
-- (D-KEIN-NOT-VALID) Bestandsdaten-Pruefung: introspiziert (kein Schreibpfad
--   im Repo gefunden -- weder Migration noch Anwendungscode -- der
--   `energy.anschlussnutzer.verarbeitungs_status` je auf einen anderen Wert
--   als den Spalten-DEFAULT `'aktiv'` setzt; `EnergyAnschlussnutzerRepository`
--   kennt bislang KEINE `sperren()`/`loeschen()`-Methode, anders als
--   `EnergyEndkundeRepository`). Jede Bestandszeile ist also zwingend
--   `'aktiv'`, ein `CHECK` OHNE `NOT VALID` validiert sofort und OHNE Risiko
--   eines Fehlschlags. Der `NOT VALID`-Pfad des Arbeitsauftrags (fuer den
--   Fall abweichender Bestandsdaten) wird deshalb NICHT gebraucht -- sollte
--   diese Annahme in einer bereits gefuellten Umgebung NICHT zutreffen,
--   schlaegt die Migration beim Anwenden mit Fehlercode 23514 fehl, BEVOR
--   irgendeine falsche Zeile stillschweigend akzeptiert wird (fail-closed,
--   kein Blast-Radius-Risiko wie bei einem NOT-VALID-CHECK, der spaeter bei
--   fremden UPDATEs ueberrascht -- V0024 D-A11-CHECK-RUECKWAERTS-Argument
--   gilt hier NICHT symmetrisch, weil hier -- anders als dort -- keine
--   bekannte Altlast ohne Grund existiert).
--
-- (D-KOHAERENZ-CHECK) `ck_anschlussnutzer_einschraenkung_kohaerenz` (V0024)
--   bleibt konsistent: sie vergleicht `verarbeitungs_status = 'gesperrt'`
--   als Literal, 'gesperrt' bleibt in der neuen Werteliste ein gueltiger
--   Wert -- keine Aenderung an V0024 noetig, kein Konflikt (verifiziert im
--   Testcontainer, s. Verifikations-Protokoll).
--
-- (D-KOMMENTAR-P4-SEMANTIK) User-Entscheidung 2026-08-26 (P4-Zeitraum-
--   Semantik): die Anschlussnutzer-Sperre greift, wenn sein
--   Nutzungsverhaeltnis den Lauf-Zeitraum IRGENDWO UEBERLAPPT -- nicht nur,
--   wenn er zum Lauf-ERSTELLUNGSZEITPUNKT aktuell zugeordnet ist (seine
--   Daten aus dieser Zeit stecken im Lauf; ein ausgezogener Mieter muss seine
--   Vergangenheitsdaten noch sperren koennen). KEINE Schema-Aenderung (App-
--   Scope-Auswertung ueber `energy.nutzungsverhaeltnis.gueltig_von/
--   gueltig_bis`), aber als Kommentar an dieser Spalte dokumentiert, weil die
--   Semantik dort steht, wo sie ausgewertet wird -- s. COMMENT unten. Loest
--   NICHT die in V0023 weiterhin offenen Punkte (1) mvet/System-Zuordnung
--   [ADR-0007 A12 nutzt seit V0028 `messkonzept_version_energietraeger_
--   system`, aber der Trigger-Zweig selbst ist NICHT Teil dieser Migration]
--   und (2) Zeitzonen-Verankerung von `analytics.berechnungslauf.periode_von/
--   periode_bis` gegen `tstzrange` -- ein DB-Trigger-Backstop analog
--   `trg_berechnungslauf_endkunde_sperre` bleibt deshalb WEITERHIN nicht
--   baubar; diese Migration schliesst NUR Punkt (3).
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- (1) mvet: ADD COLUMN + COMMENT.
-- (2) anschlussnutzer: ADD CONSTRAINT (Werteliste) + COMMENT.

-- =====================================================================
-- (1) Substitutions-Merkmal (D-EBENE, D-DEFAULT)
-- =====================================================================

ALTER TABLE energy.messkonzept_version_energietraeger
    ADD COLUMN energietraeger_substitution boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN energy.messkonzept_version_energietraeger.energietraeger_substitution IS
  'Explizites, vom Betriebs-Team bei der Erfassung gesetztes Kennzeichen (ADR-0007 B13.4/B14, O-B3b): true = fuer dieses (Endkunde, Energietraeger)-Paar liegt ein Energietraeger-Wechsel (Substitution, z. B. Oel -> Waermepumpe) vor. NICHT aus der mvet-Historie abgeleitet, NICHT aus einer (nicht gebauten) TB-03-Schwellwert-Erkennung (User-Entscheidung B14: sofort baubar, fail-closed, Betriebs-Team kennt den Fall bei der Erfassung ohnehin). Foerderrechtlicher Hintergrund (Merkblatt Technik v2.2 Kap. 3, woertlich: die Baseline ist "in jedem Fall" gemaess dem alternativen oder Standardmesskonzept zu bilden): Substitutionsfaelle sind kategorisch vom vereinfachten Messkonzept ausgeschlossen, das ADR-0006 v1 exklusiv implementiert -- ein gesetztes Kennzeichen fuehrt deshalb NICHT zu einer abweichenden Berechnung, sondern zum AUSSCHLUSS MIT AUSWEIS (foerderjahr_status=nicht_nachweisbar_substitution, ausschluss_grund_code=energietraeger_substitution_v1_nicht_unterstuetzt, s. nachweis.einsparlauf_ergebnis V0025, istSubstitutionsfall() src/backend/src/nachweis/substitution-erkennung.ts) -- der Endkunde bleibt in der Export-Liste sichtbar (DE-02). DEFAULT false: Substitution ist der Ausnahmefall, Bestandszeilen sind mangels Merkmal bislang nicht erkennbare Nicht-Substitutionsfaelle (kein rueckwirkendes Erkennen). Ebene mvet statt messkonzept_version, weil der Ausschluss PAARWEISE je (Endkunde, Energietraeger) wirkt (B13.4/C4) und mvet exakt diese Paar-Entitaet ist (s. Migrations-Kopf D-EBENE). Keine PII (Schema energy, rote Linie 1) -- technisches Merkmal, keine Angabe ueber Ausuebung eines Betroffenenrechts.';

-- =====================================================================
-- (2) verarbeitungs_status-Werteliste auf energy.anschlussnutzer
-- =====================================================================

ALTER TABLE energy.anschlussnutzer
    ADD CONSTRAINT ck_anschlussnutzer_verarbeitungs_status CHECK (
        verarbeitungs_status IN ('aktiv', 'gesperrt', 'geloescht')
    );

COMMENT ON COLUMN energy.anschlussnutzer.verarbeitungs_status IS
  'Geschlossene Werteliste aktiv|gesperrt|geloescht, ab V0029 per CHECK ck_anschlussnutzer_verarbeitungs_status DB-seitig erzwungen (schliesst V0023 "OFFENER KLAERUNGSPUNKT" D-SCOPE-ANSCHLUSSNUTZER Punkt (3); introspizierte Werteliste identisch zur applikationsseitigen Domaene VerarbeitungsStatus, src/backend/src/stammdaten/persistence/energy/energy-endkunde.repository.ts -- ACHTUNG: energy.endkunde.verarbeitungs_status selbst traegt HEUTE noch KEINEN analogen DB-CHECK, s. Migrations-Kopf Teil 2, offener Punkt). aktiv=regulaer verarbeitet; gesperrt=Art.-18-Einschraenkung (s. einschraenkung_grund_code/gesperrt_seit, V0024 A11); geloescht=Art. 17 vollzogen. P4-Zeitraum-Semantik (User-Entscheidung 2026-08-26, ADR-0006 P4/ADR-0007 A12, App-Scope -- KEINE Schema-Aenderung): die Anschlussnutzer-Sperre greift fuer die Auswertung eines Berechnungs-/Nachweislaufs, wenn IRGENDEIN energy.nutzungsverhaeltnis dieses Anschlussnutzers den Lauf-Zeitraum UEBERLAPPT -- NICHT nur, wenn er zum Lauf-ERSTELLUNGSZEITPUNKT aktuell zugeordnet ist (Begruendung: seine Daten aus dieser Zeit stecken bereits im Lauf; ein ausgezogener Mieter muss seine Vergangenheitsdaten weiterhin sperren koennen). Ein DB-Trigger-Backstop analog trg_berechnungslauf_endkunde_sperre (V0023) bleibt WEITERHIN nicht baubar -- die dort unter (1)/(2) benannten Luecken (Zeitzonen-Verankerung von analytics.berechnungslauf.periode_von/periode_bis) sind NICHT Teil dieser Migration.';

-- =====================================================================
-- (3) verarbeitungs_status-Werteliste auf energy.endkunde
--     NACHTRAG durch den Review dieser Migration (2026-08-26).
--
-- Der Entwurf zu Teil (2) foerderte zutage, dass energy.endkunde.
-- verarbeitungs_status ebenfalls KEINEN DB-CHECK traegt -- die Wertemenge
-- stand bisher nur in einem Inline-Kommentar (V0002) und in der
-- TypeScript-Union `VerarbeitungsStatus`. Diese Luecke ist die
-- gefaehrlichere der beiden, weil genau diese Spalte die Art.-18-Sperre
-- traegt:
--
--   * A10/P4 pruefen `verarbeitungs_status <> 'aktiv'` (Service +
--     trg_berechnungslauf_endkunde_sperre, V0023).
--   * Der Mapper `toVerarbeitungsStatus()` bildete jeden UNBEKANNTEN Wert
--     still auf 'aktiv' ab -- ein Tippfehler oder Fremdwert haette einen
--     GESPERRTEN Endkunden als AKTIV erscheinen lassen und die Sperre
--     lautlos ausgehebelt (fail-OPEN an einer Betroffenenrechts-Kontrolle).
--
-- Der CHECK schliesst die Ursache in der DB; der Mapper wurde im selben
-- Zug auf fail-closed umgestellt (wirft statt zu maskieren) -- zwei
-- unabhaengige Verteidigungslinien, wie bei A6/A19.
--
-- Bestandsdaten verifiziert: nur 'aktiv' vorhanden -> kein NOT VALID noetig.
-- =====================================================================

ALTER TABLE energy.endkunde
    ADD CONSTRAINT ck_endkunde_verarbeitungs_status CHECK (
        verarbeitungs_status IN ('aktiv', 'gesperrt', 'geloescht')
    );

-- =====================================================================
-- (4) pii_status-Wertelisten im Namensraum identity
--     NACHTRAG durch den Review dieser Migration (2026-08-26).
--
-- Beim Schliessen der Luecken (2)/(3) zeigte ein Repo-weiter Scan, dass
-- DASSELBE fail-open-Muster an drei weiteren Stellen steckt:
-- `identity.endkunde_pii`, `identity.anschlussnutzer_pii` und
-- `identity.standort_pii` fuehren `pii_status` ebenfalls OHNE DB-CHECK, und
-- die zugehoerigen Mapper bildeten jeden unbekannten Wert still auf 'aktiv'
-- ab.
--
-- Diese Spalten sind noch sensibler als verarbeitungs_status: sie steuern,
-- ob PII ueberhaupt ausgeliefert wird bzw. ob ein Subjekt als geschreddert
-- gilt (Art. 17). Ein Fremdwert haette einen geschredderten oder gesperrten
-- Datensatz als 'aktiv' erscheinen lassen.
--
-- Die Haertung wird deshalb konsistent ueber ALLE fuenf Status-Spalten
-- gezogen -- eine halb gehaertete Menge waere genau die Asymmetrie, die den
-- Fund ueberhaupt erst ermoeglicht hat.
--
-- Bestandsdaten verifiziert: nur 'aktiv' bzw. leer -> kein NOT VALID noetig.
-- =====================================================================

ALTER TABLE identity.endkunde_pii
    ADD CONSTRAINT ck_endkunde_pii_status CHECK (
        pii_status IN ('aktiv', 'gesperrt', 'geloescht')
    );

ALTER TABLE identity.anschlussnutzer_pii
    ADD CONSTRAINT ck_anschlussnutzer_pii_status CHECK (
        pii_status IN ('aktiv', 'gesperrt', 'geloescht')
    );

ALTER TABLE identity.standort_pii
    ADD CONSTRAINT ck_standort_pii_status CHECK (
        pii_status IN ('aktiv', 'gesperrt', 'geloescht')
    );
