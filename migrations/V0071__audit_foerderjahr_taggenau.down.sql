-- =====================================================================
-- V0071 (down) -- von_tag/bis_tag aus der Kontext-Whitelist nehmen
-- =====================================================================
--
-- Schliesst die in V0071 geoeffnete Version und oeffnet die vorherige wieder.
-- Bestehende Audit-Zeilen bleiben unangetastet -- sie sind append-only und
-- gegen die Version gueltig, unter der sie geschrieben wurden. Eine Zeile mit
-- `von_tag` im Kontext bleibt also lesbar; nur NEUE Zeilen mit diesem Key
-- werden nach dem Rollback wieder abgewiesen.
--
-- Reihenfolge beim Rollback: V0071 vor V0070. Andersherum liefe der
-- Foerderjahr-Anlegepfad in die fail-closed Whitelist, weil der Service die
-- Spalten dann nicht mehr kennt, das Ereignis sie aber noch fuehren duerfte.

DO $$
DECLARE
    v_code text := 'foerderjahr.stammdaten.definiert';
    v_neu  audit.event_typ_version%ROWTYPE;
BEGIN
    SELECT * INTO v_neu
      FROM audit.event_typ_version
     WHERE code = v_code AND gueltig_bis IS NULL
     ORDER BY gueltig_ab DESC
     LIMIT 1;

    IF v_neu.id IS NULL OR NOT ('von_tag' = ANY (v_neu.erlaubte_kontext_keys)) THEN
        RAISE EXCEPTION 'audit: offene Version fuer % fuehrt kein von_tag -- V0071 war nicht angewendet, Rollback abgebrochen.', v_code;
    END IF;

    DELETE FROM audit.event_typ_version WHERE id = v_neu.id;

    UPDATE audit.event_typ_version
       SET gueltig_bis = NULL
     WHERE id = (
         SELECT id FROM audit.event_typ_version
          WHERE code = v_code AND gueltig_bis IS NOT NULL
          ORDER BY gueltig_bis DESC
          LIMIT 1
     );
END
$$;
