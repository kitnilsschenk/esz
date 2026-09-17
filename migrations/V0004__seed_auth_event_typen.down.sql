-- V0004__seed_auth_event_typen.down.sql
--
-- Rollt den Katalog-Seed aus V0004 zurueck. Anders als bei V0003
-- (`DROP SCHEMA audit CASCADE`, kein Bestandsschema) ist hier ein
-- schonenderer Ansatz noetig: `audit.event_typ`/`audit.event_typ_version`
-- sind bewusst NICHT unter `REVOKE UPDATE, DELETE` (governte Konfiguration,
-- V0003-Migrations-Kopf, Abweichung (f)) -- ein hartes DELETE ist technisch
-- moeglich, darf aber NIE Zeilen entfernen, auf die bereits echte
-- `audit.event`-Zeilen per FK verweisen (`audit.event.event_typ REFERENCES
-- audit.event_typ(code) ... ON DELETE NO ACTION` -- ein DELETE waeh'rend
-- bestehender Referenzen wuerde ohnehin hart mit einem FK-Fehler abbrechen,
-- aber DIESE Migration entscheidet bewusst VORHER, statt sich auf den
-- DB-Fehler zu verlassen, um einen klaren, absichtsvollen Fallback
-- (Deaktivieren statt Abbruch) zu bieten).
--
-- Vorgehen je Code (SCD2-konform):
--   - KEINE `audit.event`-Zeile referenziert den Code (Normalfall: frische
--     Dev-/Test-/CI-Instanz direkt nach V0004, Greenfield -- der in dieser
--     Migration dokumentierte Bootstrap-Zustand VOR echtem Go-Live, s.
--     Up-Datei-Kopf): vollstaendiger Rueckbau -- `event_typ_version`-Zeile(n)
--     UND `event_typ`-Header-Zeile werden geloescht (deterministischer
--     Down/Up-Roundtrip, analog V0001-V0003).
--   - MINDESTENS EINE `audit.event`-Zeile referenziert den Code (der Code
--     wurde bereits produktiv verwendet): KEIN Hard-Delete (Append-only-/
--     FK-Schutz bleibt gewahrt) -- stattdessen wird die aktuell gueltige
--     `event_typ_version`-Zeile SCD2-konform geschlossen (`gueltig_bis :=
--     now()`, `aktiv := false`). Der `event_typ`-Header bleibt bestehen
--     (FK-Ziel bestehender Events darf nicht verschwinden). Ergebnis: der
--     Code kann ab sofort nicht mehr fuer NEUE Events verwendet werden
--     (`audit.event_seal()` findet keine gueltige/aktive Version mehr,
--     s. V0003 Schritt (2)), bestehende Zeilen und ihre Ketten-Integritaet
--     bleiben unangetastet.
DO $$
DECLARE
    v_code       text;
    v_codes      text[] := ARRAY[
        'auth.anmeldung.erfolg',
        'auth.anmeldung.fehlschlag',
        'auth.token.erneuert',
        'auth.abmeldung.erfolg',
        'authz.zugriff.verweigert'
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
