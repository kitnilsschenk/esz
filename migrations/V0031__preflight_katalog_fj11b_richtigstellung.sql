-- V0031__preflight_katalog_fj11b_richtigstellung.sql
--
-- ADR-Bezug: ADR-0006 P4, ADR-0007 A11/A12/C8. Richtigstellung eines
-- SACHLICH FALSCHEN Eintrags im Preflight-Regelkatalog
-- (`analytics.verfahren_version`, code='foerderjahr_preflight_de02').
--
-- =====================================================================
-- Was ist falsch an Version 2?
-- =====================================================================
-- Der mit V0030 eingefuegte Eintrag `FJ-11b` traegt
--   status:       "... -- HEUTE STRUKTURELL NICHT ERREICHBAR"
--   beschreibung: "... diese Spalte existiert (Stand V0029) NICHT, daher
--                  erreicht jeder gesperrte Anschlussnutzer heute IMMER
--                  FJ-11c (fail-closed, s. dort)."
-- Beides ist FALSCH. Gegen die Datenbank verifiziert (2026-08-26):
--   * V0024 (A11 / ADR-0007 C8) hat `einschraenkung_grund_code` UND
--     `gesperrt_seit` an `energy.anschlussnutzer` GENAUSO ergaenzt wie an
--     `energy.endkunde` -- samt geschlossener Werteliste
--     (`ck_anschlussnutzer_einschraenkung_grund_code`, dieselben vier
--     Art.-18-Codes) und Kohaerenz-CHECK
--     (`ck_anschlussnutzer_einschraenkung_kohaerenz`).
--   * V0029 ergaenzte zusaetzlich `ck_anschlussnutzer_verarbeitungs_status`.
--   * `AnalyticsLaufLookupRepository.findAnschlussnutzerSperrenFuerPaar()`
--     SELECTet `an.einschraenkung_grund_code`, und `PreflightService` reicht
--     ihn an `klassifiziereAnschlussnutzerEinschraenkung()` durch.
-- Der `warnung`-Zweig FJ-11b ist damit STRUKTURELL ERREICHBAR.
--
-- Dass er heute dennoch nie greift, hat eine ANDERE Ursache: es fehlt der
-- SCHREIBPFAD. `EndkundeService.sperren()` nimmt den Grund nicht entgegen
-- (`EnergyEndkundeRepository.markGesperrt()` setzt nur
-- `verarbeitungs_status`), und fuer `energy.anschlussnutzer` existiert
-- ueberhaupt kein Sperr-Endpunkt. Jede Sperre ist folglich grundlos -- und
-- grundlos ist fail-closed (FJ-11c). Das ist eine ERFASSUNGS-, keine
-- Schema-Luecke; sie schliesst der in ADR-0007 C8 benannte Folgeauftrag
-- (Grund als Pflichtangabe an `sperren()` plus API/UI).
--
-- Warum das nicht bloss Kosmetik ist: `parameter_schema` wird zur Laufzeit
-- NICHT geparst (s. V0024-Kopf), der Katalog ist aber der VERSIONIERTE
-- NACHWEIS des Regelwerks (DE-03). Ein Eintrag, der die Semantik seiner
-- eigenen Regel falsch beschreibt, fuehrt jeden spaeteren Leser -- Audit,
-- Bewilligungsbehoerde, Nachfolge-Entwicklung -- in die Irre.
--
-- =====================================================================
-- Warum Version 3 und kein UPDATE auf Version 2?
-- =====================================================================
-- `analytics.verfahren_version` ist SCD2 und append-only (V0019
-- D-A6-VERFAHREN-REVOKE, `edms_app` hat NUR SELECT). Version 2 ist seit
-- 2026-08-26T17:36:55Z angewendet und `aktiv`; ein rueckwirkendes Editieren
-- widerspraeche derselben Konvention, die V0030 fuer Version 1 begruendet
-- hat. Version 2 bleibt daher UNVERAENDERT als historischer Stand stehen
-- (mitsamt ihrem Irrtum -- das ist der ehrliche Nachweis) und wird
-- geschlossen; Version 3 traegt die Richtigstellung.
--
-- =====================================================================
-- Warum abgeleitet statt abgetippt?
-- =====================================================================
-- Version 3 wird per `jsonb_set` AUS Version 2 abgeleitet, nicht neu
-- geschrieben. Der Katalog fuehrt 15 Regeln; ein erneutes Abtippen brauecht
-- genau die Art von Abschreibfehler, die hier gerade repariert wird. Das
-- Delta ist damit auch im Review als "exakt diese Schluessel aendern sich"
-- lesbar. Analog wird der FJ-11c-Text per `replace()` chirurgisch
-- korrigiert, statt die ganze (lange) Beschreibung neu zu setzen.
--
-- Ein abschliessender DO-Block VERIFIZIERT das Ergebnis und wirft, wenn eine
-- der Ersetzungen nicht gegriffen hat -- eine stillschweigend wirkungslose
-- `replace()` waere sonst der schlimmste Ausgang (Katalog scheinbar
-- korrigiert, faktisch unveraendert).
--
-- =====================================================================
-- Inhaltliches Delta gegenueber Version 2
-- =====================================================================
-- (1) `$id` -> ".../foerderjahr_preflight_de02:3" (Konvention: Suffix
--     spiegelt die Katalog-`version`).
-- (2) `FJ-11b` vollstaendig ersetzt (status + beschreibung), s. o.
-- (3) `FJ-11c`: NUR der Teilsatz zur Ursache ("kein Grund-Feld") korrigiert;
--     Regelwirkung, Ueberlappungs-Semantik und Blocker-Ausnahme bleiben
--     WORTGLEICH.
-- (4) `regeln.beschreibung`: Hinweis auf diese Richtigstellung angehaengt.
-- (5) FJ-01..FJ-11a und FJ-10 bleiben UNVERAENDERT.
-- (6) `golden_vectors` unveraendert aus Version 2 uebernommen (weiterhin
--     leer, s. V0024/V0030).

-- =====================================================================
-- (1) Version 2 schliessen (SCD2)
-- =====================================================================

UPDATE analytics.verfahren_version
   SET aktiv = false,
       gueltig_bis = now()
 WHERE code = 'foerderjahr_preflight_de02'
   AND version = 2
   AND aktiv = true
   AND gueltig_bis IS NULL;

-- =====================================================================
-- (2) Version 3 aus Version 2 ableiten
-- =====================================================================

INSERT INTO analytics.verfahren_version
    (id, code, version, parameter_schema, golden_vectors, beschreibung, aktiv, gueltig_ab)
SELECT
    gen_random_uuid(),
    v.code,
    3,
    jsonb_set(
      jsonb_set(
       jsonb_set(
        jsonb_set(
          jsonb_set(
            v.parameter_schema,
            '{$id}',
            to_jsonb('urn:edms:nachweis:verfahren:foerderjahr_preflight_de02:3'::text)
          ),
          '{properties,regeln,properties,FJ-11b}',
          $fj11b$
          {
            "const": "warnung",
            "status": "neu (ADR-0006 P4, Analogon zu FJ-07b); Beschreibung mit V0031 richtiggestellt",
            "beschreibung": "Art.18(1)(a)/(1)(c) am Anschlussnutzer (energy.anschlussnutzer.einschraenkung_grund_code=art18_1a_richtigkeit|art18_1c_rechtsverteidigung_betroffener) -- Ausweis MIT Kennzeichnung, Paar bleibt status=ausgewiesen (Analogon zu FJ-07b). RICHTIGSTELLUNG (V0031, 2026-08-26): Version 2 dieses Katalogs fuehrte FJ-11b als 'HEUTE STRUKTURELL NICHT ERREICHBAR' mit der Begruendung, die Grund-Spalte existiere an energy.anschlussnutzer nicht -- das war FALSCH. V0024 (A11 / ADR-0007 C8) hat einschraenkung_grund_code UND gesperrt_seit an anschlussnutzer genauso ergaenzt wie an endkunde, samt geschlossener Werteliste (ck_anschlussnutzer_einschraenkung_grund_code) und Kohaerenz-CHECK (ck_anschlussnutzer_einschraenkung_kohaerenz); V0029 ergaenzte ck_anschlussnutzer_verarbeitungs_status. Der Zweig ist STRUKTURELL erreichbar und wird real gelesen (AnalyticsLaufLookupRepository.findAnschlussnutzerSperrenFuerPaar -> PreflightService). Dass er heute dennoch nie greift, liegt am fehlenden SCHREIBPFAD: EndkundeService.sperren() nimmt den Grund nicht entgegen (markGesperrt setzt nur verarbeitungs_status), und fuer energy.anschlussnutzer existiert gar kein Sperr-Endpunkt. ERFASSUNGS-, keine Schema-Luecke -- sie schliesst der ADR-0007-C8-Folgeauftrag (Grund als Pflichtangabe an sperren() plus API/UI)."
          }
          $fj11b$::jsonb
        ),
        '{properties,regeln,properties,FJ-11c,beschreibung}',
        to_jsonb(
          replace(
            v.parameter_schema->'properties'->'regeln'->'properties'->'FJ-11c'->>'beschreibung',
            'Heute IMMER erreicht (kein Grund-Feld, s. FJ-11b) -- fail-closed by design, NICHT Bestandsdaten-Sonderfall.',
            'Heute laeuft JEDE Anschlussnutzer-Sperre in diesen Zweig -- NICHT mangels Grund-SPALTE (die existiert seit V0024, s. Richtigstellung bei FJ-11b), sondern mangels Schreibpfad, der sie fuellt: die Sperre ist stets grundlos, und grundlos ist fail-closed. Damit ist dies derzeit ausnahmslos derselbe Bestandsdaten-Fall wie bei FJ-07c.'
          )
        )
      ),
      '{properties,regeln,properties,FJ-11c,status}',
      to_jsonb('neu (ADR-0006 P4, Analogon zu FJ-07c); Ursachensatz mit V0031 richtiggestellt'::text)
      ),
      '{properties,regeln,beschreibung}',
      to_jsonb(
        replace(
          v.parameter_schema->'properties'->'regeln'->>'beschreibung',
          'Version 2 (dieser Katalog-Eintrag) ergaenzt',
          'Version 2 ergaenzte'
        )
        || ' Version 3 (dieser Katalog-Eintrag, V0031, 2026-08-26) stellt FJ-11b RICHTIG:'
        || ' Version 2 fuehrte den Zweig faelschlich als strukturell nicht erreichbar, weil'
        || ' energy.anschlussnutzer angeblich keine einschraenkung_grund_code-Spalte trage --'
        || ' die existiert seit V0024. Zugleich praezisiert V0031 den Ursachensatz in FJ-11c'
        || ' (fail-closed heute mangels Schreibpfad, nicht mangels Spalte). Alle uebrigen'
        || ' Regeln sind aus Version 2 unveraendert per jsonb_set uebernommen.'
      )
    ),
    v.golden_vectors,
    'Preflight-Regelkatalog (ADR-0007 B4) Version 3: inhaltsgleich mit Version 2, ABER mit richtiggestelltem FJ-11b (Version 2 behauptete faelschlich, energy.anschlussnutzer trage keine einschraenkung_grund_code-Spalte; sie existiert seit V0024) und praezisiertem FJ-11c-Ursachensatz. Version 3 ist per jsonb_set AUS Version 2 abgeleitet, nicht abgetippt. Version 2 bleibt unveraendert als historischer Stand erhalten (SCD2, append-only).',
    true,
    now()
  FROM analytics.verfahren_version v
 WHERE v.code = 'foerderjahr_preflight_de02'
   AND v.version = 2;

-- =====================================================================
-- (3) Verifikation -- eine wirkungslose Ersetzung waere der schlimmste Ausgang
-- =====================================================================

DO $verify$
DECLARE
    v3      jsonb;
    fj11b   jsonb;
    fj11c   text;
BEGIN
    SELECT parameter_schema INTO v3
      FROM analytics.verfahren_version
     WHERE code = 'foerderjahr_preflight_de02' AND version = 3;

    IF v3 IS NULL THEN
        RAISE EXCEPTION 'V0031: Version 3 wurde nicht angelegt (Version 2 nicht gefunden?).';
    END IF;

    IF jsonb_typeof(v3->'properties'->'regeln'->'properties') <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(v3->'properties'->'regeln'->'properties')) <> 15 THEN
        RAISE EXCEPTION 'V0031: Version 3 fuehrt nicht die erwarteten 15 Regeln.';
    END IF;

    IF v3->>'$id' <> 'urn:edms:nachweis:verfahren:foerderjahr_preflight_de02:3' THEN
        RAISE EXCEPTION 'V0031: $id nicht auf Version 3 gesetzt.';
    END IF;

    fj11b := v3->'properties'->'regeln'->'properties'->'FJ-11b';
    IF fj11b->>'const' <> 'warnung' THEN
        RAISE EXCEPTION 'V0031: FJ-11b hat nicht mehr const=warnung.';
    END IF;
    IF fj11b->>'status' LIKE '%STRUKTURELL NICHT ERREICHBAR%'
       OR fj11b->>'beschreibung' LIKE '%diese Spalte existiert%NICHT%' THEN
        RAISE EXCEPTION 'V0031: FJ-11b traegt weiterhin die falsche Aussage.';
    END IF;

    fj11c := v3->'properties'->'regeln'->'properties'->'FJ-11c'->>'beschreibung';
    IF fj11c LIKE '%kein Grund-Feld%' THEN
        RAISE EXCEPTION 'V0031: FJ-11c-Ursachensatz wurde nicht ersetzt (replace() lief ins Leere).';
    END IF;
    IF fj11c NOT LIKE '%mangels Schreibpfad%' THEN
        RAISE EXCEPTION 'V0031: FJ-11c traegt den korrigierten Ursachensatz nicht.';
    END IF;
    IF fj11c NOT LIKE '%Zaehlt NICHT in preflight.blocker_anzahl.%' THEN
        RAISE EXCEPTION 'V0031: FJ-11c hat unerwartet Text jenseits des Ursachensatzes verloren.';
    END IF;

    IF (SELECT count(*) FROM analytics.verfahren_version
         WHERE code = 'foerderjahr_preflight_de02' AND aktiv = true) <> 1 THEN
        RAISE EXCEPTION 'V0031: es ist nicht genau eine Katalog-Version aktiv.';
    END IF;
END
$verify$;
