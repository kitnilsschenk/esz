-- V0016__korrektur_geraet_zuordnung_katalog_beschreibung.down.sql
--
--
-- Rollt die vier SCD2-Korrekturen aus V0016 (Up) zurueck. Muster identisch zu
-- `migrations/V0009__seed_shred_workflow_events.down.sql` Teil (A) (dort im
-- Detail begruendet, hier fuer VIER Codes statt einem angewendet, da V0016 --
-- wie V0009 Teil 2 -- eine SCD2-Aenderung an bereits BESTEHENDEN
-- `event_typ_version`-Zeilen vornimmt, KEINE neuen Codes anlegt; anders als
-- der V0004/V0006/V0007/V0009-Teil-1/V0015-Rueckbau, der komplette Codes
-- entfernt).
--
-- Vorgehen je Code (SCD2-konform, identisch zu V0009-Teil-A):
--   1. Die von V0016 (Up) neu eingefuegte `event_typ_version`-Zeile wird
--      identifiziert -- solange kein weiterer, spaeterer Katalog-Umbau fuer
--      diesen Code stattgefunden hat, ist sie die EINZIGE Zeile mit
--      `gueltig_bis IS NULL` (EXCLUDE-Constraint `ex_event_typ_version_no_
--      overlap` erlaubt je Code hoechstens EINE offen-endende Range
--      gleichzeitig, V0003 Zeile 261-263). `ORDER BY gueltig_ab DESC LIMIT 1`
--      als zusaetzliche Absicherung, falls zwischenzeitlich (ausserhalb
--      dieses Rollbacks) dennoch mehrere Zeilen mit offenem Ende entstanden
--      sein sollten -- nimmt dann die JUENGSTE.
--   2. `audit.event` hat KEINEN FK auf `event_typ_version.id` (nur auf
--      `event_typ.code`, V0003 Zeile 403-404) -- "referenziert" bedeutet
--      hier NICHT FK-Verletzung, sondern zeitliche Zugehoerigkeit: eine
--      `audit.event`-Zeile mit `event_typ = <code> AND ts >= <gueltig_ab der
--      V0016-Version>` waere unter der (unveraenderten) Kontext-Whitelist
--      DIESER Version gesiegelt worden. Da V0016 NUR die `beschreibung`
--      aendert (Whitelist/Kategorie/Rollen-Erfassung bleiben identisch zur
--      V0015-Vorgaenger-Version), ist ein Hard-Delete dieser Zeile fachlich
--      unkritischer als bei V0009-Teil-A (dort aenderte sich die Whitelist
--      selbst) -- dennoch wird, ANALOG und aus Konsistenzgruenden mit dem
--      etablierten Muster, KEIN Hard-Delete vorgenommen, wenn bereits echte
--      Ereigniszeilen unter der V0016-Version entstanden sind (Nachvollzieh-
--      barkeit "welche Katalog-Version/Beschreibung galt fuer dieses
--      Ereignis" bleibt sonst nicht rekonstruierbar).
--      - KEINE solche Ereigniszeile vorhanden (Normalfall: frische Dev-/
--        Test-/CI-Instanz direkt nach V0016, ADR-0005 v1 bleibt
--        synthetic-only): vollstaendiger Rueckbau -- die V0016-Version wird
--        geloescht, die V0015-Vorgaenger-Version (mit der urspruenglichen,
--        von DS-1 bemaengelten RESERVIERT-Beschreibung) wird auf
--        `gueltig_bis = NULL` restauriert (deterministischer Up/Down-
--        Roundtrip; EXCLUDE-Constraint erlaubt das wieder problemlos, weil
--        die V0016-Version dann nicht mehr existiert -> keine
--        Range-Ueberlappung). WICHTIG: dies stellt bewusst wieder die ALTE,
--        fachlich ueberholte Beschreibung her -- ein DOWN rollt IMMER exakt
--        auf den Vorzustand zurueck, unabhaengig davon, ob dieser Vorzustand
--        selbst fehlerhaft war (identisches Prinzip wie V0009-Down, das
--        ebenfalls die von V0009 selbst korrigierte falsche
--        ADR-Paragraph-Referenz aus V0006 wiederherstellt). Kein Grund zur
--        Sorge: dieser Zustand ist nur fuer die Dauer eines
--        Rollback-Fensters gedacht (Wegwerf-Testcontainer-Verifikation bzw.
--        Notfall-Rueckbau vor einem Reapply).
--      - MINDESTENS EINE solche Ereigniszeile vorhanden: KEIN Hard-Delete,
--        KEINE Restauration der Vorgaenger-Zeile (waere ohnehin durch die
--        EXCLUDE-Constraint verhindert, solange die V0016-Version eine
--        offene `gueltig_bis IS NULL`-Range haelt) -- stattdessen wird NUR
--        die V0016-Version SCD2-konform geschlossen (`gueltig_bis :=
--        now()`), bleibt aber als historische Zeile bestehen (Append-only-/
--        Historien-Schutz gewahrt, analog dem "referenziert"-Zweig in
--        V0009-Teil-A). `aktiv` wird bewusst NICHT auf `false` gesetzt (das
--        ist der Unterschied zum V0004/V0006/V0007/V0009-Teil-B/V0015-
--        Rueckbau-Muster fuer KOMPLETT NEUE Codes: dort soll der Code
--        kuenftig gar nicht mehr verwendbar sein; hier soll der Code selbst
--        WEITERBESTEHEN, nur eben ohne diese spezifische Version) -- Ergebnis
--        ist identisch zu V0009-Teil-A: der Code braucht fuer neue Ereignisse
--        eine neue Katalog-Version (ausserhalb dieses Rollbacks), ein
--        manuelles Nacharbeiten ist ABSICHTLICH NICHT automatisiert (haette
--        einen Datenintegritaets-/Compliance-Review durch database-lead/
--        compliance-director zur Voraussetzung, kein reiner SQL-Rueckbau).

DO $$
DECLARE
    v_code           text;
    v_codes          text[] := ARRAY[
        'geraet_zuordnung.stammdaten.provisioniert',
        'geraet_zuordnung.stammdaten.aktualisiert',
        'geraet_zuordnung.stammdaten.geschreddert',
        'geraet_zuordnung.stammdaten.reverse_aufgeloest'
    ];
    v_new_id         uuid;
    v_new_gueltig_ab timestamptz;
    v_referenced     boolean;
BEGIN
    FOREACH v_code IN ARRAY v_codes LOOP
        v_new_id := NULL;

        SELECT id, gueltig_ab INTO v_new_id, v_new_gueltig_ab
          FROM audit.event_typ_version
         WHERE code = v_code AND gueltig_bis IS NULL
         ORDER BY gueltig_ab DESC
         LIMIT 1;

        IF v_new_id IS NULL THEN
            RAISE WARNING 'audit: keine offene (gueltig_bis IS NULL) Version fuer % gefunden -- V0016-Aenderung vermutlich bereits anderweitig zurueckgerollt oder Katalog seither veraendert; ueberspringe.', v_code;
            CONTINUE;
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM audit.event
             WHERE event_typ = v_code AND ts >= v_new_gueltig_ab
        ) INTO v_referenced;

        IF v_referenced THEN
            UPDATE audit.event_typ_version
               SET gueltig_bis = now()
             WHERE id = v_new_id;
            -- Vier textliche Bezugspunkte (Code, id, gueltig_ab), aber
            -- ABSICHTLICH nur DREI `%`-Platzhalter: `RAISE` verlangt eine
            -- EXAKTE Uebereinstimmung von Platzhalter- und Argumentanzahl,
            -- sonst Laufzeitfehler "too few parameters specified for RAISE"
            -- (empirisch in der Testcontainer-Verifikation dieser Migration
            -- aufgetreten -- das urspruengliche V0009-Teil-A-Vorbild,
            -- migrations/V0009__seed_shred_workflow_events.down.sql Zeile 94,
            -- traegt denselben Zaehlfehler [vier `%` vs. drei Argumente:
            -- v_code, v_new_id, v_new_gueltig_ab] und wuerde beim Durchlaufen
            -- dieses Zweigs ebenfalls fehlschlagen -- NICHT Teil dieser
            -- Migration behebbar, da V0009 bereits gemergt ist/append-only
            -- bleibt; s. finale Antwort database-lead, offener Punkt).
            RAISE WARNING 'audit: Version (code=%, id=%, gueltig_ab=%) wird bereits von audit.event referenziert (Ereignisse seit gueltig_ab vorhanden) -- KEIN Hard-Delete, KEINE Restauration der Vorgaenger-Version (Append-only-/Historien-Schutz gewahrt). Version stattdessen geschlossen (SCD2); Ruecksetzung auf den V0015-Stand erfordert manuellen Compliance-/database-lead-Review, kein automatischer SQL-Rueckbau.', v_code, v_new_id, v_new_gueltig_ab;
        ELSE
            DELETE FROM audit.event_typ_version WHERE id = v_new_id;
            UPDATE audit.event_typ_version
               SET gueltig_bis = NULL
             WHERE code = v_code AND gueltig_bis = v_new_gueltig_ab;
            IF NOT FOUND THEN
                RAISE WARNING 'audit: keine Vorgaenger-Version von % mit gueltig_bis=% gefunden -- Restauration uebersprungen (unerwarteter Zustand, bitte Katalog-Historie manuell pruefen).', v_code, v_new_gueltig_ab;
            END IF;
        END IF;
    END LOOP;
END
$$;
