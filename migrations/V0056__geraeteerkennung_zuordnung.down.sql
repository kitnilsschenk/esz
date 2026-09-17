-- Down zu V0056 (Geräteerkennung, TB-05).
--
-- ACHTUNG: Der Rueckbau vernichtet die Zuordnungen von Messkanaelen zu
-- Geraete-/Anlagengruppen samt Methode, Genauigkeit und Gueltigkeit. Aus
-- ihnen ergibt sich die Zuordnungsquote nach [Q3] Kap. 5 — die Zahl, mit der
-- gegenueber der Bewilligungsbehoerde nachgewiesen wird, dass 20 bis 40
-- Prozent des Jahresverbrauchs zugeordnet werden koennen. Ohne sie ist der
-- Nachweis nicht zu fuehren.
--
-- Ebenfalls fort ist die Feststellung, welche Systeme von der Erkennung
-- ausgenommen sind („gelten pauschal als erfuellt") -- eine fachliche
-- Wuerdigung, die niemand automatisch wiederherstellen kann.
--
-- VOR DEM RUECKBAU ZWINGEND PRUEFEN UND EXPORTIEREN:
--
--   SELECT g.endkunde_id, count(*) AS zuordnungen,
--          count(*) FILTER (WHERE k.gueltig_bis IS NULL) AS wirksam
--     FROM energy.geraetegruppe_kanal k
--     JOIN energy.geraetegruppe g ON g.id = k.geraetegruppe_id
--    GROUP BY g.endkunde_id;
--
--   SELECT id, geraeteerkennung_entbehrlich_grund
--     FROM energy.system WHERE geraeteerkennung_entbehrlich;
--
-- Sind Zeilen vorhanden, braucht der Rueckbau die ausdrueckliche Freigabe des
-- Users und einen dokumentierten Export
-- (`.claude/rules/database-migrations.md`).

ALTER TABLE energy.system
    DROP CONSTRAINT ck_system_geraeteerkennung_entbehrlich,
    DROP COLUMN geraeteerkennung_entbehrlich_grund,
    DROP COLUMN geraeteerkennung_entbehrlich;

ALTER TABLE energy.geraetegruppe_kanal
    DROP CONSTRAINT ex_geraetegruppe_kanal_ein_kanal_eine_gruppe;

ALTER TABLE energy.geraetegruppe_kanal DROP CONSTRAINT geraetegruppe_kanal_pkey;
ALTER TABLE energy.geraetegruppe_kanal
    ADD CONSTRAINT geraetegruppe_kanal_pkey PRIMARY KEY (geraetegruppe_id, messkanal_id);

ALTER TABLE energy.geraetegruppe_kanal
    DROP CONSTRAINT ck_geraetegruppe_kanal_beendet_grund,
    DROP CONSTRAINT ck_geraetegruppe_kanal_gueltigkeit,
    DROP CONSTRAINT ck_geraetegruppe_kanal_anteil,
    DROP CONSTRAINT ck_geraetegruppe_kanal_genauigkeit,
    DROP CONSTRAINT ck_geraetegruppe_kanal_methode;

ALTER TABLE energy.geraetegruppe_kanal
    ALTER COLUMN anteil_prozent DROP NOT NULL,
    ALTER COLUMN anteil_prozent DROP DEFAULT,
    ALTER COLUMN anteil_prozent TYPE numeric;

ALTER TABLE energy.geraetegruppe_kanal
    DROP COLUMN beendet_grund,
    DROP COLUMN gueltig_bis,
    DROP COLUMN gueltig_von,
    DROP COLUMN im_gesamtverbrauch_enthalten,
    DROP COLUMN genauigkeit_pct,
    DROP COLUMN methode;
