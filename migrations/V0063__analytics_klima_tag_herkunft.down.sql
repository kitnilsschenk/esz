-- V0063__analytics_klima_tag_herkunft.down.sql
--
-- Rueckbau der drei Herkunftsspalten an `analytics.klima_tag`.
--
-- Anders als bei den Katalog-Migrationen (V0032/V0062) ist hier KEINE
-- Referenz-Pruefung noetig: die Spalten sind rein additiv, nullable, ohne FK
-- und ohne Abhaengigkeit anderer Objekte. Der Rueckbau verliert allerdings
-- die Herkunft REAL abgerufener DWD-Werte unwiederbringlich (Auflage A-3) --
-- die Zeilen selbst bleiben stehen, nur ihre Belegkette faellt weg.
--
-- Deshalb: laut, nicht still. Sind bereits DWD-Zeilen vorhanden, bricht der
-- Rueckbau ab. Wer ihn dann trotzdem will, loescht die Werte vorher bewusst
-- (Nachweis-/Backup-Pflicht, `.claude/rules/database-migrations.md`).

DO $$
DECLARE
    v_dwd_zeilen bigint;
BEGIN
    SELECT count(*) INTO v_dwd_zeilen
      FROM analytics.klima_tag
     WHERE lizenz_id IS NOT NULL OR datei_version IS NOT NULL;

    IF v_dwd_zeilen > 0 THEN
        RAISE EXCEPTION 'analytics.klima_tag: % Zeile(n) tragen bereits eine Herkunft (datei_version/lizenz_id) -- Rueckbau wuerde den Lizenz-/Quellennachweis nach Auflage A-3 (docs/datenquellen.md DQ-001) vernichten. Migration abgebrochen; bewusster Rueckbau erfordert vorheriges Loeschen dieser Werte mit Review.', v_dwd_zeilen;
    END IF;
END
$$;

ALTER TABLE analytics.klima_tag
    DROP CONSTRAINT IF EXISTS ck_klima_tag_qualitaets_niveau;

ALTER TABLE analytics.klima_tag
    DROP COLUMN IF EXISTS qualitaets_niveau,
    DROP COLUMN IF EXISTS lizenz_id,
    DROP COLUMN IF EXISTS datei_version;

COMMENT ON COLUMN analytics.klima_tag.quelle IS NULL;
