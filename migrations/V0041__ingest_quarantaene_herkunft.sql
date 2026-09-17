-- V0041 — Herkunft an der Quarantaene: aus welchem Netz und aus welcher
-- ChirpStack-Application kam ein liegengebliebener Uplink?
-- (ADR-0011 D8 + D1/B1.)
--
-- ANLASS
-- ------
-- `ingest.eingang_quarantaene` haelt fest, WAS liegen blieb und WARUM --
-- aber nicht, WOHER es kam. Bei einem Netzserver war das gleichgueltig. Ab
-- zwei ist es der erste Handgriff: "Netz A oder Netz B?" laesst sich heute
-- nicht beantworten, und der Arbeitsvorrat aus ADR-0011 A2 zeigt bei
-- `devEUI_unbekannt` nur einen redigierten Topic-String, mit dem niemand ein
-- Geraet findet.
--
-- DREI SPALTEN, ZWEI HERKUENFTE
-- -----------------------------
-- `quelle_code`  -- WELCHER Worker-Prozess hat die Nachricht empfangen
--                   (ADR-0011 D8, gleiche Kennung wie `ingest.quelle_status`).
-- `chirpstack_tenant_id` / `chirpstack_application_id`
--                -- WOHIN gehoert das Geraet laut Netzserver (ADR-0011 D1).
--                   Beim Betreiber ist Tenant = Endkunde und Application =
--                   Gebaeude; das macht aus einer anonymen Zeile einen
--                   Hinweis, wo jemand suchen muss.
--
-- ALLE DREI SIND NULLABLE, und das ist kein Versehen:
--   - `quelle_code` fehlt bei Zeilen, die VOR dieser Migration entstanden
--     sind. Ein Default waere eine Behauptung ueber Vergangenes.
--   - Die ChirpStack-IDs fehlen bei `envelope_parse_fehler` -- dort liess
--     sich der Envelope gar nicht lesen (SEC-1) -- und bei Netzservern, die
--     sie nicht mitsenden.
--
-- NUR IDs, KEINE NAMEN (ADR-0011 D1)
-- ----------------------------------
-- Aufgenommen werden ausschliesslich die opaken UUIDs. Die dazugehoerigen
-- Namen (`tenantName`, `applicationName`, `deviceName`, `tags`) bleiben
-- draussen: Es ist Freitext, den jemand in einem FREMDEN System getippt hat
-- -- ohne Feldkatalog, ohne Loeschkonzept, ohne unsere Kontrolle. Im
-- Beispielbeleg lautete `applicationName` "GS Lahnstein" (faktisch eine
-- Anschrift) und `tags.consumerName` "Lueftung EG"; in einem Wohnkontext
-- stuende dort ebenso gut ein Nachname. Gebraucht werden die Namen ohnehin
-- nicht: Sobald ADR-0011 B2 die Application einem `energy.standort`
-- zuordnet, zeigt die Oberflaeche den EDMS-eigenen Gebaeudenamen.
--
-- KEIN FREMDSCHLUESSEL
-- --------------------
-- `quelle_code` verweist LOGISCH auf `ingest.quelle_status.quelle_code`,
-- ohne FK -- dieselbe Konvention wie `zaehler_id`/`messkanal_key` in
-- derselben Tabelle (V0011, D-QUAR-SPALTEN). Eine Quarantaene-Zeile muss
-- auch dann bestehen bleiben, wenn ihre Quelle nie eine Statuszeile
-- geschrieben hat.
--
-- Review-Bedarf (`.claude/rules/database-migrations.md`): `database-lead`;
-- `compliance-director` wegen der Aufnahme fremder Kennungen (auch wenn es
-- opake IDs sind, s. o.).

ALTER TABLE ingest.eingang_quarantaene
    ADD COLUMN quelle_code               text,   -- LOGISCHER Verweis auf ingest.quelle_status (kein FK), NULLABLE
    ADD COLUMN chirpstack_tenant_id      uuid,   -- Netzserver-Mandant; beim Betreiber = Endkunde. NULLABLE
    ADD COLUMN chirpstack_application_id uuid;   -- Netzserver-Application; beim Betreiber = Gebaeude. NULLABLE

-- Gleiche Form wie ingest.quelle_status.quelle_code (V0039) -- der Wert
-- stammt aus derselben Umgebungsvariablen und wird gegen dieselbe Kennung
-- gelesen.
ALTER TABLE ingest.eingang_quarantaene
    ADD CONSTRAINT ck_quarantaene_quelle_code_form
        CHECK (quelle_code IS NULL OR quelle_code ~ '^[a-z0-9][a-z0-9_-]{0,62}$');

-- Der Arbeitsvorrat wird nach Quelle gefiltert ("was liegt bei Netz B?").
-- Teilindex, weil Altzeilen die Spalte nicht tragen.
CREATE INDEX ix_quarantaene_quelle_empfangen
    ON ingest.eingang_quarantaene (quelle_code, empfangen_at DESC)
    WHERE quelle_code IS NOT NULL;

COMMENT ON COLUMN ingest.eingang_quarantaene.quelle_code               IS 'Welcher Worker-Prozess die Nachricht empfangen hat (ADR-0011 D8). NULL bei Zeilen vor V0041. pii=false.';
COMMENT ON COLUMN ingest.eingang_quarantaene.chirpstack_tenant_id      IS 'Opake Mandanten-Kennung des Netzservers (ADR-0011 D1). NUR die ID -- Namen bleiben bewusst draussen. pii=false.';
COMMENT ON COLUMN ingest.eingang_quarantaene.chirpstack_application_id IS 'Opake Application-Kennung des Netzservers (ADR-0011 D1); beim Betreiber ein Gebaeude. NUR die ID. pii=false.';
