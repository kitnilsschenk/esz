-- V0008__create_endkunde_shred_antrag.sql
--
-- Review vor Merge (erfolgt): database-lead (Migrations-Entwurf) +
-- compliance-director (ADR-0009 kein Veto/Auflagen; PII-freie, personenbeziehbare
-- Spalten beantragt_von_sub/freigeber_sub, .claude/rules/database-migrations.md).
--
-- ADR-Bezug: docs/adr/ADR-0009-vier-augen-krypto-shredding.md §2.1/§2.6/§2.7
-- (Vier-Augen-/Freigabe-Kontrolle fuer Krypto-Shredding, Endkunde, Art. 17 DSGVO;
-- Folgeauftrag aus ADR-0008 §29(C4)/§19 Finding B). Design-Owner: access-control-
-- engineer. Migrations-Entwurf: database-lead.
--
-- MUSTER (bewusst gespiegelt, ADR-0009 §2.1 "bereits vorhandener Praezedenzfall"):
-- migrations/V0003__audit_log_schema.sql, Tabelle audit.retention_freigabe
-- (Spaltenpaar antragsteller/freigeber, CHECK ck_freigabe_vier_augen,
-- opake-principal-Kommentar-Konvention -- hier 1:1 auf beantragt_von_sub/
-- freigeber_sub uebertragen). energy.set_updated_at() (V0002) wird NUR
-- WIEDERVERWENDET, nicht neu angelegt.
--
-- NAMENSRAUM (ADR-0009 §2.1): Schema `energy`, NICHT `identity`. Nur (a) eine
-- gleich-Namensraum-FK auf den Pseudonym-Anker energy.endkunde(id), (b) whitelisted
-- Fach-/Statusmetadaten, (c) zwei opake sub-Werte OHNE FK auf identity -- KEINE PII
-- (rote Linie 1), kein Cross-Schema-FK (analog audit.event.actor_sub).
--
-- v1-TIEFE, EHRLICHES FRAMING (ADR-0009 §2.7, verbindlich): CHECK-Constraint
-- ck_shred_antrag_vier_augen + partieller Unique-Index sind ein DB-seitiger
-- INTEGRITAETS-GUARD (Datenkonsistenz), KEIN Sicherheits-Backstop. Ein CHECK
-- verhindert NICHT, dass die (aktuell breit berechtigte) App-Laufzeitrolle den
-- Freigabe-Schritt ohne echte Vier-Augen-Pruefung vornimmt, solange zwei
-- verschiedene sub-Werte eingetragen werden -- die AuthN/ABAC-Pruefung bleibt v1
-- vollstaendig App-Layer-Verantwortung (InCodePolicyAdapter, ADR-0009 §2.2). Eine
-- DB-SECURITY-DEFINER-Gate-Funktion (einziger Schreibpfad, analog
-- audit.retention_drop()) ist BEWUSST kein Bestandteil dieser Migration, sondern
-- BINDENDE Vorbedingung vor einem produktiven Bestand dieser Tabelle (ADR-0009 §2.7;
-- Vorbedingung: rollen-getrenntes Grant-Modell fuer identity/energy).
--
-- gueltig_bis: NOT NULL (ADR-0009 §2.1). Jeder Antrag bekommt bei Anlage ein
-- Verfallsdatum (App: beantragt_am + Frist, provisorischer Wert ADR-0009 §5/§8,
-- final security-lead/compliance-director) -- ein nie-verfallender offener Antrag
-- ist ausgeschlossen. Die App befuellt den Wert; die Migration setzt keinen
-- DB-Default (Fristberechnung ist App-Fachregel).
--
-- OFFEN (ADR-0009 §8, nicht Gegenstand dieser Migration): finaler Fristwert;
-- finale ablehnungsgrund-Whitelist (App-seitig, DB speichert text); Audit-Katalog-
-- Seed der neuen Event-Codes (separate Migration V0009); ein spaeterer, nicht-
-- partieller Index (endkunde_id, beantragt_am) fuer die Liste-Route (erst nach
-- gemessenem Zugriffspfad, postgres-engineer -- keine spekulativen Indizes).

CREATE TABLE energy.endkunde_shred_antrag (
    id                uuid        PRIMARY KEY,        -- App: UUIDv7, KEIN DB-DEFAULT (Konvention V0002/V0003)
    endkunde_id       uuid        NOT NULL REFERENCES energy.endkunde(id),
    grund             text        NOT NULL,           -- whitelisted App-seitig: KryptoShreddingGrund; DB speichert text
    beantragt_von_sub text        NOT NULL,           -- opaker Principal, KEIN FK -- analog audit.retention_freigabe.antragsteller
    beantragt_am      timestamptz NOT NULL DEFAULT now(),
    freigeber_sub     text,                            -- opaker Principal, gesetzt bei Freigabe/Ablehnung; muss <> beantragt_von_sub (CHECK)
    entschieden_am    timestamptz,                     -- Zeitpunkt der Freigabe- ODER Ablehnungsentscheidung
    status            text        NOT NULL DEFAULT 'beantragt',  -- beantragt|freigegeben|abgelehnt|ausgefuehrt|abgelaufen
    ablehnungsgrund   text,                            -- whitelisted App-seitig (final ADR-0009 §8), NULL solange nicht abgelehnt
    gueltig_bis       timestamptz NOT NULL,            -- Verfallsfenster; App setzt beantragt_am + Frist (ADR-0009 §2.1/§5)
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_shred_antrag_vier_augen CHECK (freigeber_sub IS NULL OR freigeber_sub <> beantragt_von_sub),
    CONSTRAINT ck_shred_antrag_status CHECK (status IN ('beantragt', 'freigegeben', 'abgelehnt', 'ausgefuehrt', 'abgelaufen'))
);

-- DSGVO-Markierung (1:1 aus audit.retention_freigabe): personenbeziehbar
-- pseudonym/opak (ErwGr. 26), pii=false -- kein direktes PII-Feld.
COMMENT ON COLUMN energy.endkunde_shred_antrag.beantragt_von_sub IS
  'personenbeziehbar=true; pii=false; art=opake-principal (Vier-Augen-Workflow, kein FK); analog audit.retention_freigabe.antragsteller / audit.event.actor_sub; ADR-0009 §2.1/§2.6';
COMMENT ON COLUMN energy.endkunde_shred_antrag.freigeber_sub IS
  'personenbeziehbar=true; pii=false; art=opake-principal (Vier-Augen-Workflow, kein FK); analog audit.retention_freigabe.freigeber / audit.event.actor_sub; ADR-0009 §2.1/§2.6';

-- Wiederverwendung der bereits vorhandenen Trigger-Funktion (kein CREATE FUNCTION;
-- energy.set_updated_at() existiert seit V0002__kern_datenmodell_energie.sql).
CREATE TRIGGER trg_endkunde_shred_antrag_updated_at BEFORE UPDATE ON energy.endkunde_shred_antrag
    FOR EACH ROW EXECUTE FUNCTION energy.set_updated_at();

-- Pflicht-Auflage (ADR-0009 §5): hoechstens EIN offener (status='beantragt')
-- Antrag je Endkunde. Verhindert widerspruechliche Parallel-Antraege und schliesst
-- die Race-Luecke zwischen "Antrag stellen" und "Freigeben/Ablehnen".
CREATE UNIQUE INDEX ux_endkunde_shred_antrag_offen_je_endkunde
    ON energy.endkunde_shred_antrag (endkunde_id)
    WHERE status = 'beantragt';
