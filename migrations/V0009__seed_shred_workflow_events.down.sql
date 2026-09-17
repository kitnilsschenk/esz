-- V0009__seed_shred_workflow_events.down.sql
--
--
-- Zwei-teiliger Rueckbau, in UMGEKEHRTER Reihenfolge zur Up-Datei (zuerst
-- Teil 2/geschreddert-SCD2 zurueckrollen, dann Teil 1/drei neue Codes):
--
--   (A) `endkunde.stammdaten.geschreddert`: die von V0009 NEU eingefuegte
--       `event_typ_version`-Zeile (erlaubte_kontext_keys mit `antrag_id`)
--       entfernen UND die Vorgaenger-Zeile (V0006) wieder auf
--       `gueltig_bis = NULL` oeffnen -- NUR wenn seit dieser Migration
--       tatsaechlich KEINE `audit.event`-Zeile unter der neuen Version
--       entstanden ist (deterministischer Roundtrip). `audit.event` hat
--       KEINEN FK auf `event_typ_version.id` (nur auf `event_typ.code`, V0003
--       Zeile 403-404) -- "referenziert" bedeutet hier NICHT FK-Verletzung,
--       sondern zeitliche Zugehoerigkeit: ein `audit.event`-Zeile mit
--       `event_typ='endkunde.stammdaten.geschreddert' AND ts >=
--       <gueltig_ab der neuen Version>` waere unter der Kontext-Whitelist
--       DIESER Version gesiegelt worden -- ein Hard-Delete der Version wuerde
--       die nachtraegliche Aufloesung "welche Whitelist galt fuer dieses
--       Ereignis" fuer diese (bereits unveraenderlichen, append-only)
--       Ereigniszeilen unmoeglich machen, ohne die Ereigniszeilen selbst
--       anzutasten.
--       - KEINE solche Ereigniszeile vorhanden (Normalfall: frische Dev-/
--         Test-/CI-Instanz direkt nach V0009, weiterhin pre-go-live/
--         synthetic-only UND kein Backend-Emitter fuer geschreddert nutzt
--         `antrag_id` bereits, s. Up-Datei-Kopf): vollstaendiger Rueckbau --
--         neue Version-Zeile geloescht, Vorgaenger-Zeile auf
--         `gueltig_bis = NULL` restauriert (deterministischer Up/Down-
--         Roundtrip, EXCLUDE-Constraint erlaubt das wieder problemlos, weil
--         die neue Version dann nicht mehr existiert -> keine Range-
--         Ueberlappung).
--       - MINDESTENS EINE solche Ereigniszeile vorhanden: KEIN Hard-Delete,
--         KEINE Restauration der Vorgaenger-Zeile (waere ohnehin durch die
--         EXCLUDE-Constraint verhindert, solange die neue Version eine offene
--         `gueltig_bis IS NULL`-Range haelt) -- stattdessen wird NUR die neue
--         Version SCD2-konform geschlossen (`gueltig_bis := now()`), bleibt
--         aber als historische Zeile bestehen (Append-only-/Historien-Schutz
--         gewahrt, analog dem "referenziert"-Zweig in V0004/V0006/V0007).
--         Ergebnis: der Code kann ab sofort nicht mehr unter DIESER
--         (erweiterten) Whitelist versiegelt werden, die naechste
--         `audit.begin_segment()`/`append_event()`-Verwendung braeuchte eine
--         neue Katalog-Version (auesserhalb dieses Rollbacks) -- ein manuelles
--         Nacharbeiten (z. B. Wiederherstellen der Vorgaenger-Zeile) ist in
--         diesem Fall ABSICHTLICH NICHT automatisiert (haette einen
--         Datenintegritaets-/Compliance-Review durch database-lead/
--         compliance-director zur Voraussetzung, kein reiner SQL-Rueckbau).
--
--   (B) die drei neuen Codes (`shred_beantragt`/`shred_freigegeben`/
--       `shred_abgelehnt`): EXAKT dasselbe Muster wie
--       V0004/V0006/V0007-Down (dort begruendet) -- je Code pruefen, ob
--       `audit.event` ihn bereits referenziert (FK: `audit.event.event_typ
--       REFERENCES audit.event_typ(code)`); wenn ja: KEIN Hard-Delete,
--       SCD2-Close (`aktiv=false, gueltig_bis=now()`), Header bleibt (FK-Ziel);
--       wenn nein (Normalfall, da RESERVIERT/kein Emitter, s. Up-Datei):
--       vollstaendiger Rueckbau (`event_typ_version` + `event_typ`-Header
--       geloescht).

-- =====================================================================
-- (A) geschreddert: neue Version zurueckrollen, Vorgaenger ggf. restaurieren
-- =====================================================================

DO $$
DECLARE
    v_code            text := 'endkunde.stammdaten.geschreddert';
    v_new_id          uuid;
    v_new_gueltig_ab  timestamptz;
    v_referenced      boolean;
BEGIN
    -- Die von V0009 (Up) eingefuegte Version ist -- solange kein weiterer,
    -- spaeterer Katalog-Umbau fuer diesen Code stattgefunden hat -- die
    -- einzige Zeile mit `gueltig_bis IS NULL` (EXCLUDE-Constraint erlaubt je
    -- Code hoechstens EINE offen-endende Range gleichzeitig, V0003 Zeile
    -- 261-263). ORDER BY + LIMIT 1 als zusaetzliche Absicherung, falls
    -- zwischenzeitlich (ausserhalb dieses Rollbacks) dennoch mehrere Zeilen
    -- mit offenem Ende entstanden sein sollten -- nimmt dann die JUENGSTE.
    SELECT id, gueltig_ab INTO v_new_id, v_new_gueltig_ab
      FROM audit.event_typ_version
     WHERE code = v_code AND gueltig_bis IS NULL
     ORDER BY gueltig_ab DESC
     LIMIT 1;

    IF v_new_id IS NULL THEN
        RAISE WARNING 'audit: keine offene (gueltig_bis IS NULL) Version fuer % gefunden -- V0009-Teil-2-Aenderung vermutlich bereits anderweitig zurueckgerollt oder Katalog seither veraendert; ueberspringe (A).', v_code;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM audit.event
             WHERE event_typ = v_code AND ts >= v_new_gueltig_ab
        ) INTO v_referenced;

        IF v_referenced THEN
            UPDATE audit.event_typ_version
               SET gueltig_bis = now()
             WHERE id = v_new_id;
            RAISE WARNING 'audit: Version % (id=%, gueltig_ab=%) von % wird bereits von audit.event referenziert (Ereignisse seit gueltig_ab vorhanden) -- KEIN Hard-Delete, KEINE Restauration der Vorgaenger-Version (Append-only-/Historien-Schutz gewahrt). Version stattdessen geschlossen (SCD2); Ruecksetzung auf den V0006-Stand erfordert manuellen Compliance-/database-lead-Review, kein automatischer SQL-Rueckbau.', v_code, v_new_id, v_new_gueltig_ab;
        ELSE
            DELETE FROM audit.event_typ_version WHERE id = v_new_id;
            UPDATE audit.event_typ_version
               SET gueltig_bis = NULL
             WHERE code = v_code AND gueltig_bis = v_new_gueltig_ab;
            IF NOT FOUND THEN
                RAISE WARNING 'audit: keine Vorgaenger-Version von % mit gueltig_bis=% gefunden -- Restauration uebersprungen (unerwarteter Zustand, bitte Katalog-Historie manuell pruefen).', v_code, v_new_gueltig_ab;
            END IF;
        END IF;
    END IF;
END
$$;

-- =====================================================================
-- (B) drei neue Codes zurueckrollen (Muster V0004/V0006/V0007)
-- =====================================================================

DO $$
DECLARE
    v_code       text;
    v_codes      text[] := ARRAY[
        'endkunde.stammdaten.shred_beantragt',
        'endkunde.stammdaten.shred_freigegeben',
        'endkunde.stammdaten.shred_abgelehnt'
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
