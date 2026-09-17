-- V0026__seed_nachweis_events.down.sql
--
-- Rollt den Katalog-Seed aus V0026 zurueck. EXAKT dasselbe Muster wie
-- V0004/V0006/V0009/V0015/V0021-Down-Dateien (dort im Detail begruendet,
-- hier unveraendert uebernommen): `audit.event_typ`/`audit.event_typ_
-- version` stehen NICHT unter `REVOKE UPDATE, DELETE` (governte
-- Konfiguration, V0003-Migrations-Kopf, Abweichung (f)) -- ein hartes
-- DELETE ist technisch moeglich, darf aber NIE Zeilen entfernen, auf die
-- bereits echte `audit.event`-Zeilen per FK verweisen (`audit.event.
-- event_typ REFERENCES audit.event_typ(code) ON DELETE NO ACTION`).
--
-- Vorgehen je Code (SCD2-konform, identisch zu V0004/V0006/V0007/V0009/
-- V0015/V0021):
--   - KEINE `audit.event`-Zeile referenziert den Code (Normalfall: alle
--     zehn Codes sind laut Up-Datei-Kopf RESERVIERT -- kein Emitter im
--     Repo zum Zeitpunkt dieser Migration): vollstaendiger Rueckbau --
--     `event_typ_version`-Zeile(n) UND `event_typ`-Header-Zeile werden
--     geloescht (deterministischer Down/Up-Roundtrip).
--   - MINDESTENS EINE `audit.event`-Zeile referenziert den Code (z. B. nach
--     einem zwischenzeitlichen Emitter-Anschluss, etwa in einem
--     Integrationstest gegen eine laufende Instanz): KEIN Hard-Delete
--     (Append-only-/FK-Schutz bleibt gewahrt) -- stattdessen wird die
--     aktuell gueltige `event_typ_version`-Zeile SCD2-konform geschlossen
--     (`gueltig_bis := now()`, `aktiv := false`). Der `event_typ`-Header
--     bleibt bestehen (FK-Ziel bestehender Events darf nicht verschwinden).
DO $$
DECLARE
    v_code       text;
    v_codes      text[] := ARRAY[
        'einsparlauf.nachweis.angefordert',
        'einsparlauf.nachweis.abgeschlossen',
        'einsparlauf.nachweis.fehlgeschlagen',
        'einsparlauf.nachweis.ersetzt',
        'preflight.nachweis.durchgefuehrt',
        'export.nachweis.erzeugt',
        'export.nachweis.abgerufen',
        'einreichung.nachweis.vermerkt',
        'einreichung.nachweis.korrigiert',
        'foerderjahr.stammdaten.definiert'
    ];
    v_referenced boolean;
BEGIN
    FOREACH v_code IN ARRAY v_codes LOOP
        SELECT EXISTS (SELECT 1 FROM audit.event WHERE event_typ = v_code) INTO v_referenced;

        IF v_referenced THEN
            UPDATE audit.event_typ_version
               SET aktiv = false,
                   gueltig_bis = now()
             WHERE code = v_code
               AND gueltig_bis IS NULL;
            RAISE WARNING 'audit: Code % wird bereits von audit.event referenziert -- KEIN Hard-Delete (Append-only/FK-Schutz gewahrt). Katalog-Version stattdessen deaktiviert/geschlossen (SCD2); Header-Zeile audit.event_typ bleibt bestehen, da Fremdschluessel bestehender Ereigniszeilen darauf verweisen.', v_code;
        ELSE
            DELETE FROM audit.event_typ_version WHERE code = v_code;
            DELETE FROM audit.event_typ WHERE code = v_code;
        END IF;
    END LOOP;
END
$$;
