-- =====================================================================
-- V0071 -- `foerderjahr.stammdaten.definiert` bekommt von_tag/bis_tag
-- =====================================================================
--
-- Seit V0070 traegt ein Foerderjahr taggenaue Grenzen. Das Audit-Ereignis,
-- das seine Definition festhaelt, fuehrte bisher nur `von_monat`/`bis_monat`
-- -- und damit ausgerechnet NICHT die Angabe, auf die es ankommt: Bei einem
-- Foerderjahr aus dem Bewilligungszeitraum ist der Monat das Etikett, der Tag
-- die Zusage.
--
-- Die Kontext-Whitelist ist fail-closed: Ein Key, der hier nicht steht, laesst
-- den Audit-Schreibpfad die Zeile ABWEISEN. Ohne diese Migration koennte also
-- kein Foerderjahr mehr angelegt werden.
--
-- Kein Personenbezug: Zwei Kalenderdaten aus einem Bescheid (A9 unberuehrt).
--
-- SCD2 wie bei jeder Katalog-Aenderung: die offene Version wird geschlossen,
-- eine neue mit den zwei zusaetzlichen Keys geoeffnet. Bestehende Zeilen
-- bleiben gegen die Version gueltig, unter der sie geschrieben wurden.

DO $$
DECLARE
    v_code text := 'foerderjahr.stammdaten.definiert';
    v_alt  audit.event_typ_version%ROWTYPE;
BEGIN
    SELECT * INTO v_alt
      FROM audit.event_typ_version
     WHERE code = v_code AND gueltig_bis IS NULL
     ORDER BY gueltig_ab DESC
     LIMIT 1;

    IF v_alt.id IS NULL THEN
        RAISE EXCEPTION 'audit: keine offene (gueltig_bis IS NULL) Version fuer % -- Katalog in unerwartetem Zustand, Migration abgebrochen.', v_code;
    END IF;

    IF 'von_tag' = ANY (v_alt.erlaubte_kontext_keys) THEN
        RAISE EXCEPTION 'audit: von_tag steht bereits in der Whitelist von % -- Migration abgebrochen (doppelte Anwendung?).', v_code;
    END IF;

    UPDATE audit.event_typ_version
       SET gueltig_bis = now()
     WHERE id = v_alt.id;

    INSERT INTO audit.event_typ_version
        (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
         rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
    VALUES
        (gen_random_uuid(), v_code, v_alt.objekt_typ, v_alt.aktion_kategorie,
         v_alt.erlaubte_kontext_keys || ARRAY['von_tag', 'bis_tag'],
         v_alt.rolle_erfassen, v_alt.pflichtereignis, v_alt.aktiv,
         v_alt.beschreibung || ' NEU (V0071): kontext.von_tag / kontext.bis_tag = die taggenauen Grenzen des Foerderjahres (V0070). von_tag inklusiv, bis_tag EXKLUSIV -- anders als von_monat/bis_monat, die beide inklusiv sind und seit V0070 aus den Tagen abgeleitet werden. Sie stehen im Log, weil bei definition_quelle=bewilligungszeitraum der Tag die beschiedene Zusage ist und der Monat nur das Etikett; ohne sie liesse sich spaeter nicht mehr belegen, welchen Zeitraum ein Nachweis eigentlich meinte. Zwei Kalenderdaten, kein Personenbezug (A9 unberuehrt).',
         now());
END
$$;

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration, s. V0062-Kopf)
-- =====================================================================
-- Diese Migration emittiert KEINE eigene `audit.katalog.geaendert`-Zeile: Ein
-- SQL-Migrationsskript kann keinen validierten `actor_*`-Principal
-- herstellen, und einen zu erfinden ist genau das, was das Audit-Log
-- ausschliesst. Die Aenderung ist ueber die Migrationshistorie belegt.
