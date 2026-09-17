-- V0019__analytics_berechnungslauf_schema.sql
--
-- ADR-Bezug: docs/adr/ADR-0006-baseline-bereinigung.md Teil B (Status:
-- proposed -- Freigabe User steht noch aus; diese Migration ist ein
-- DESIGN-ENTWURF, s. Auftrag "NUR ENTWERFEN, KEIN edms-migrate up"). Deckt
-- ab: D1 (B1, Berechnungslauf), D2 (B2, Einfrieren), D3 (B3,
-- Verfahrens-Version SCD2 + Golden Vectors), Teil des D8/B7 (dritte
-- Snapshot-Art `eingang_einflussgroesse`, PII-frei), B9 (Schema-Skizze),
-- B12 (Rechenmodell-Konstanten + Golden-Vector-Startsatz).
--
-- Fünf bindende compliance-director-Auflagen aus dem Phase-3-Votum
-- (A6-A10, Arbeitsauftrag) sind in dieser Datei umgesetzt:
--   A6 (Grants/REVOKE)      -> Abschnitt "ROLLEN" + "GRANTS" (Volltext, s. u.)
--   A7 (Retention-Mechanik) -> analytics.lauf_retention_status (D-A7 unten)
--   A8 (PII-Kommentare)     -> COMMENT ON COLUMN (wert_kwh, endkunde_id,
--                              wert_num/wert_code der Einflussgrößen-Snapshot-
--                              Projektion)
--   A9 (synthetic/Werte-Verbot) -> NICHT diese Datei, s. V0021 (Audit-Seed)
--   A10 (Sperr-Zustand)     -> KEINE neue Spalte nötig: berechnungslauf.
--                              endkunde_id FK'd bereits auf energy.endkunde,
--                              dessen verarbeitungs_status (V0002) die App
--                              fail-closed prüfen kann. Geprüft, nicht
--                              dupliziert (s. Kommentar bei berechnungslauf).
--
-- Design-Owner: database-lead (Migrations-Entwurf, direkter Arbeitsauftrag).
-- Review vor Merge (ausstehend, Status des ADR selbst ist "proposed"):
-- technical-director (Gesamt-Architektur/ADR-Freigabe), compliance-director
-- (A6-A10-Umsetzung gegenprüfen), access-control-engineer (B10-PolicyActions
-- gegen die hier gebauten Grants), timescale-engineer (Bestätigung: KEINE
-- Hypertable, s. u.), retention-engineer (O-B4/O-B9, sobald der eigentliche
-- Lösch-Job gebaut wird -- diese Migration liefert nur die Struktur, A7).
--
-- =====================================================================
-- WARUM analytics.* KEINE Hypertables sind (ADR B9, Zeile 507; Auftrag)
-- =====================================================================
-- Zugriffspfad ist immer "ein Snapshot/ein Lauf vollständig" (PK-Präfix
-- snapshot_id bzw. lauf_id), nie "Zeitfenster über alle Kanäle/Endkunden".
-- Erwartetes Volumen (O-B6): ~365 Zeilen/Kanal/Jahr in eingang_messwert_tag
-- (Tagesaggregat statt 15-Minuten-Rohwerte) -- Größenordnung 10^5-10^6
-- Zeilen/Jahr bei realistischer Kanal-/Endkundenzahl, nicht 10^8-10^9 wie
-- measurement.messwert. Gewöhnliche B-Tree-Tabellen mit den PKs unten
-- bedienen dieses Muster besser als Chunk-Pruning, das auf Zeit-Range-Scans
-- über VIELE Entitäten optimiert. Zusätzlich: Apache-2-Compliance ist mit
-- normalen Tabellen ohnehin konfliktfrei (.claude/rules/dependencies.md
-- verbietet TSL-Features wie Compression/Retention-Policies -- die hier
-- ohnehin nicht gebraucht werden, A7 löst Retention über eine eigene
-- Struktur + künftigen `DELETE`-Job, s. u.).
--
-- =====================================================================
-- Entscheidungen mit Begründung (über die wörtliche B9-Skizze hinaus)
-- =====================================================================
--
-- (D-A6-OWNER) Eigene, NEUE Owner-Rolle `edms_analytics_owner` (NOLOGIN):
--   analog `edms_audit_owner` (V0003). A6(a) verlangt wörtlich, dass die
--   App-Laufzeitrolle NICHT Eigentümerin der analytics-Tabellen ist, "sonst
--   greift REVOKE nicht" -- ein Tabellen-Owner ist von REVOKE FROM PUBLIC
--   grundsätzlich unberührt (Owner-Privileg ist kein PUBLIC-Grant). Die
--   gesamte Schema-Eigentümerschaft (nicht nur die REVOKE-Tabellen) liegt
--   bei dieser einen Rolle -- Konsistenz mit dem audit-Schema-Muster, nicht
--   weil jede Tabelle REVOKE bräuchte (lauf_auftrag/lauf_retention_status
--   sind mutable, s. u., aber ein einheitlicher Schema-Owner vereinfacht die
--   Rechte-Buchhaltung).
--
-- (D-A6-VERFAHREN-REVOKE) `analytics.verfahren`/`verfahren_version`
--   ZUSÄTZLICH unter REVOKE UPDATE, DELETE FROM PUBLIC, über die wörtliche
--   B9-Skizze hinaus (die dort keinen REVOKE-Eintrag für den
--   Verfahrenskatalog vorsieht). Begründung: B3 verlangt "gepflegt
--   ausschließlich über Migrationen" -- STRIKTER als der audit-Katalog
--   (audit.event_typ_version erlaubt der Betriebsrolle `edms_audit_betrieb`
--   INSERT für den `/add-audit-event`-Workflow, V0003). Für den
--   Verfahrenskatalog gibt es KEINEN analogen Laufzeit-Pflegepfad -- die
--   "Disziplin-Auflage" aus B3 ("eine Änderung an einer Rechenvorschrift ist
--   kein normales Deployment") wird durch dieses REVOKE zusätzlich zur
--   fehlenden INSERT-Grant strukturell (nicht nur durch Prozessdisziplin)
--   erzwungen. KEINE Rolle bekommt INSERT auf diese beiden Tabellen -- nur
--   künftige Migrationen (unter Owner-/Runner-Rechten) können neue
--   Verfahrens-Versionen anlegen.
--
-- (D-A6-RETENTION) Eigene, NEUE Rolle `edms_retention` (NOLOGIN), bewusst
--   NICHT analytics-spezifisch benannt (analog `edms_app`, V0003-Kommentar
--   V1(b): "voraussichtlich schemaübergreifende Runtime-Rolle") -- ein
--   künftiger fristgebundener Lösch-Job (ADR B2, O-B4/O-B9, Ops-/pg_cron-
--   Scope, NICHT Teil dieser Migration) wird vermutlich auch andere Schemata
--   betreffen (identity-Shred läuft z. B. bereits über einen eigenen Pfad).
--   DELETE-Grant hier NUR auf die sieben Nachweis-/Snapshot-Tabellen (s.
--   GRANTS) -- NICHT auf verfahren/verfahren_version (die sind für IMMER
--   gültig, auch für uralte Läufe, s. o.) und NICHT auf lauf_auftrag/
--   lauf_retention_status direkt (Bookkeeping wird über ON DELETE CASCADE
--   an berechnungslauf mitgeräumt bzw. bleibt bestehen, s. D-A7).
--
-- (D-A6-DETAIL-READER) Eigene, NEUE Rolle `edms_analytics_detail_reader`
--   (NOLOGIN): SELECT NUR auf `eingang_messwert_tag`/`eingang_einflussgroesse`
--   (wörtlicher Auftrag, A6c) PLUS -- über den wörtlichen Auftragstext hinaus
--   ergänzt, analog V0010 D-GRANT-ERW -- SELECT auf `eingang_snapshot`
--   (Snapshot-Metadaten: art/von/bis/endkunde_id), OHNE die die beiden
--   Detail-Tabellen für einen künftigen Konsumenten (voraussichtlich
--   `bafa-export-engineer`, ADR-0007) nicht sinnvoll auflösbar wären. Diese
--   Rolle hat in v1 KEINEN Endpunkt/Konsumenten (B10: "Snapshot-Tageszeilen
--   ... bekommen in v1 keinen eigenen Endpunkt") -- sie wird bereits jetzt
--   angelegt, analog `edms_ingest_worker` in V0010 (Rolle vor Verdrahtung).
--   Credential-/Mitgliedschafts-Zuweisung bewusst NICHT Teil dieser
--   Migration (devops-lead/security-lead, wie überall in diesem Repo).
--
-- (D-GV) `analytics.verfahren_version.golden_vectors jsonb NOT NULL`: Spalte
--   ZUSÄTZLICH zur wörtlichen B9-Skizze (die nur `parameter_schema` zeigt),
--   aber laut Arbeitsauftrag ausdrücklich gefordert ("verfahren_version ...
--   mit parameter_schema, golden_vectors"). Kanonische Quelle für CI-Gates
--   bleibt die Repo-Datei `tests/golden/verfahren/<code>@<version>.json`
--   (D3/B12.6, dort per Git-Historie versioniert und CI-geprüft) -- diese
--   Spalte ist ein BEWUSST REDUNDANTER, migrations-gebundener Spiegel
--   desselben Inhalts für DB-seitige Nachvollziehbarkeit (DE-03: die
--   Behörde kann den Vektorsatz einer historischen Verfahrens-Version direkt
--   aus dem Katalog lesen, ohne auf den Repo-Stand zum damaligen Zeitpunkt
--   angewiesen zu sein) und für einen künftigen DB-seitigen
--   Bootstrap-Vollständigkeitscheck (B3: "Golden Vectors ... je
--   Verfahrensversion"). Beide Quellen synchron zu halten ist eine
--   Prozessdisziplin (Review-Pflicht bei jeder neuen Verfahrens-Version-
--   Migration), NICHT DB-mechanisch erzwungen -- ausdrücklich dokumentiert,
--   kein stiller Anspruch auf automatische Konsistenz.
--
-- (D-SNAPSHOT-ART) `analytics.eingang_snapshot.art` CHECK ('messwert_tag',
--   'klima_tag', 'einflussgroesse'): B9-Skizzenkommentar nennt nur die
--   ersten zwei Werte, B7 stellt aber ausdrücklich klar, dass Einflussgrößen
--   eine "DRITTE Snapshot-Art" sind ("in den Lauf eingefroren"). CHECK
--   ergänzt, kein spekulativer vierter Wert.
--
-- (D-CASCADE) `analytics.laufergebnis.lauf_id` und `analytics.
--   lauf_retention_status.lauf_id` bekommen `ON DELETE CASCADE` auf
--   `berechnungslauf(id)` -- Abweichung von der wörtlichen B9-Skizze (dort
--   ohne ON-DELETE-Klausel, Default NO ACTION). Begründung: beide Zeilen
--   haben KEINE eigenständige fachliche Existenz ohne ihren Lauf (Monatszeile
--   bzw. Retention-Bookkeeping) -- löscht der künftige Retention-Job (A7)
--   einen abgelaufenen Lauf, sollen seine Monatszeilen automatisch mit
--   verschwinden, ohne dass der Job sie einzeln vorher wegräumen muss.
--   BEWUSST NICHT auf `eingang_snapshot`/`eingang_messwert_tag`/
--   `eingang_klima_tag`/`eingang_einflussgroesse`/`klima_tag` angewendet
--   (Default NO ACTION bleibt): Snapshots sind laut B2 CONTENT-ADDRESSED und
--   damit potenziell von MEHREREN Läufen referenziert (Re-Run über
--   unveränderten Zeitraum dedupliziert auf denselben Snapshot) -- ein
--   Cascade-Delete würde einen noch von einem ANDEREN, nicht abgelaufenen
--   Lauf referenzierten Snapshot mitreißen. Die NO-ACTION-Grenze zwingt den
--   künftigen Retention-Job stattdessen zu einem zweiten, expliziten Schritt
--   ("verwaiste Snapshots identifizieren und separat löschen") -- das ist
--   der SICHERE Default für geteilte Objekte, kein Versehen.
--
-- (D-CHECK) Zusätzliche, nicht-spekulative Domänen-CHECKs über die
--   wörtliche Skizze hinaus (physikalische Nichtnegativität, explizit aus
--   B12.1/B12.4 hergeleitet, s. jeweilige Tabelle): grundlast_anteil
--   zwischen 0 und 1 (B12.1: "0…1"), GTZ-/Baseline-Größen >= 0, Tages-
--   zählungen >= 0 und disjunkt-additiv (B12.4: "disjunkt, Summe =
--   tage_gesamt", wörtlich), abdeckung_pct zwischen 0 und 100,
--   periode_bis > periode_von.
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- Schema -> analytics.set_updated_at() -> verfahren(+seed) ->
-- verfahren_version(+Seed v1) -> eingang_snapshot -> eingang_messwert_tag ->
-- eingang_klima_tag -> eingang_einflussgroesse -> klima_tag ->
-- berechnungslauf -> laufergebnis -> lauf_auftrag -> lauf_retention_status
-- (+Trigger) -> Indizes -> PII-Kommentare (A8) -> energy.baseline_periode
-- (additiv) -> REVOKE (A6) -> Rollen (idempotente DO-Blöcke) -> Ownership ->
-- GRANTS (A6, Volltext).

CREATE SCHEMA analytics;   -- PII-frei, pseudonym; FKs nach energy zulaessig,
                            -- measurement-Bezuege FK-los (Konvention V0002)

CREATE FUNCTION analytics.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

-- =====================================================================
-- Verfahrenskatalog (D3/B3): SCD2, Muster audit.event_typ/event_typ_version
-- (V0003). Gepflegt AUSSCHLIESSLICH über Migrationen (B3) -- s. D-A6-
-- VERFAHREN-REVOKE oben: KEINE Laufzeit-INSERT-Rolle.
-- =====================================================================

CREATE TABLE analytics.verfahren (
    code         text PRIMARY KEY,             -- z. B. 'witterung_gtz_vdi3807'
    art          text NOT NULL,                -- bereinigung|baseline
    beschreibung text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_verfahren_art CHECK (art IN ('bereinigung', 'baseline'))
);

CREATE TABLE analytics.verfahren_version (
    id               uuid PRIMARY KEY,          -- Migrations-Seed: gen_random_uuid() (V0003-Konvention V4)
    code             text NOT NULL REFERENCES analytics.verfahren(code),
    version          int  NOT NULL,
    parameter_schema jsonb NOT NULL,             -- JSON-Schema-artige Beschreibung des erlaubten `berechnungslauf.parameter`
    golden_vectors   jsonb NOT NULL,             -- Spiegel von tests/golden/verfahren/<code>@<version>.json (D-GV)
    beschreibung     text NOT NULL,
    aktiv            boolean NOT NULL DEFAULT true,
    gueltig_ab       timestamptz NOT NULL,
    gueltig_bis      timestamptz,                -- NULL = aktuell
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (code, version),
    CONSTRAINT ex_verfahren_version_no_overlap EXCLUDE USING gist (
        code WITH =, tstzrange(gueltig_ab, gueltig_bis) WITH &&
    )
);

-- =====================================================================
-- Seed v1: witterung_gtz_vdi3807@1 (B12.1 Konstanten, B12.6 Golden Vectors)
-- =====================================================================

INSERT INTO analytics.verfahren (code, art, beschreibung) VALUES (
    'witterung_gtz_vdi3807',
    'bereinigung',
    'Witterungsbereinigung nach Gradtagzahlen (VDI 3807), Grundlast-Zerlegung über expliziten Parameter g (ADR-0006 B5/B12.1). Vergleich auf Ist-Wetter (Baseline wird skaliert, Ist-Verbrauch nie).'
);

INSERT INTO analytics.verfahren_version
    (id, code, version, parameter_schema, golden_vectors, beschreibung, aktiv, gueltig_ab)
VALUES (
    gen_random_uuid(), 'witterung_gtz_vdi3807', 1,
    $params$
    {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "urn:edms:analytics:verfahren:witterung_gtz_vdi3807:1",
      "type": "object",
      "additionalProperties": false,
      "required": ["t_innen_c", "t_heizgrenze_c", "tage_pro_jahr", "tages_zeitzone"],
      "properties": {
        "t_innen_c": {"type": "number", "default": 20, "einheit": "degC",
          "beschreibung": "Angenommene Innentemperatur (VDI-3807-Standardwert, B12.1)"},
        "t_heizgrenze_c": {"type": "number", "default": 15, "einheit": "degC",
          "beschreibung": "Heizgrenztemperatur (VDI-3807-Standardwert, B12.1)"},
        "tage_pro_jahr": {"type": "number", "default": 365.25, "einheit": "d",
          "beschreibung": "Tage pro (Baseline-)Jahr, Grundlast-Proration (Schaltjahr-Glaettung), B12.1"},
        "oel_heizwert_kwh_je_liter": {"type": "number", "default": 10.0, "einheit": "kWh/l",
          "status": "fachlich_zu_bestaetigen",
          "beschreibung": "Heizoel-EL-Literwert, nur bei energietraeger=oel (B12.1/B12.3)"},
        "normperiode": {"type": "string", "default": "1991-2020",
          "status": "fachlich_zu_bestaetigen",
          "beschreibung": "WMO-Referenzperiode fuer GTZ_norm -- NUR Ausweis (B_norm), geht NICHT in R_m/A_m ein (B12.1)"},
        "tages_zeitzone": {"type": "string", "default": "Europe/Berlin",
          "beschreibung": "Lokale Kalendertag-Zeitzone fuer die GTZ-Tagesbildung (D4), je Lauf eingefroren"}
      }
    }
    $params$::jsonb,
    $vectors$
    [
      {"vektor": "V1", "energietraeger": "gas", "b_a_kwh": 20000, "g": 0.20,
       "gtz_base_kd": 3500, "monat": "2027-01", "d_m": 31, "gtz_m_ist_kd": 400,
       "erwartet_r_m_kwh": 2168.065,
       "zusatz": {"gtz_norm_kd": 3400, "erwartet_b_norm_kwh": 19542.857}},
      {"vektor": "V2", "energietraeger": "strom", "b_a_kwh": 3000, "g": 1.00,
       "gtz_base_kd": null, "monat": "2027-07", "d_m": 31, "gtz_m_ist_kd": 0,
       "erwartet_r_m_kwh": 254.620},
      {"vektor": "V3", "energietraeger": "gas", "b_a_kwh": 20000, "g": 0.20,
       "gtz_base_kd": 3500, "monat": "2027-08", "d_m": 31, "gtz_m_ist_kd": 0,
       "erwartet_r_m_kwh": 339.493}
    ]
    $vectors$::jsonb,
    'Startsatz v1 (ADR-0006 B12.6): drei Golden Vectors -- gemischte Grundlast/Witterungs-Aufteilung (V1), Grenzfall g=1 (V2), Grenzfall GTZ_m=0 (V3). Kanonische Quelle: tests/golden/verfahren/witterung_gtz_vdi3807@1.json (D-GV). Zwei Parameter sind fachlich noch zu bestaetigen (oel_heizwert_kwh_je_liter, normperiode) -- s. parameter_schema.status.',
    true, now()
);

-- =====================================================================
-- D2 -- Einfrieren: eingang_snapshot (content-addressed, B2) +
-- drei Detail-Tabellen (messwert_tag/klima_tag/einflussgroesse, B7/D-SNAPSHOT-ART)
-- =====================================================================

CREATE TABLE analytics.eingang_snapshot (
    id             uuid PRIMARY KEY,
    endkunde_id    uuid NOT NULL REFERENCES energy.endkunde(id),
    art            text NOT NULL,               -- messwert_tag|klima_tag|einflussgroesse (D-SNAPSHOT-ART)
    inhalt_hash    bytea NOT NULL,
    von            date NOT NULL,
    bis            date NOT NULL,
    zeilen_anzahl  int  NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (endkunde_id, art, inhalt_hash),      -- Dedup NUR je Endkunde (B2: Retention/Shred-Trennung)
    CONSTRAINT ck_eingang_snapshot_art CHECK (art IN ('messwert_tag', 'klima_tag', 'einflussgroesse')),
    CONSTRAINT ck_eingang_snapshot_zeitraum CHECK (bis >= von),
    CONSTRAINT ck_eingang_snapshot_zeilen_anzahl CHECK (zeilen_anzahl >= 0)
);

CREATE TABLE analytics.eingang_messwert_tag (
    snapshot_id       uuid NOT NULL REFERENCES analytics.eingang_snapshot(id),
    messkanal_key     int  NOT NULL,             -- FK-los (V0002-Konvention, measurement-Bezug)
    tag               date NOT NULL,             -- lokaler Kalendertag (D4)
    wert_kwh          numeric(18,3) NOT NULL,
    qualitaet_min     smallint NOT NULL,         -- niedrigster Rang des Tages (D6/B12.4, measurement.rang())
    anzahl_messwerte  int NOT NULL,
    PRIMARY KEY (snapshot_id, messkanal_key, tag),
    CONSTRAINT ck_eingang_messwert_tag_anzahl CHECK (anzahl_messwerte >= 0)
);

CREATE TABLE analytics.eingang_klima_tag (
    snapshot_id  uuid NOT NULL REFERENCES analytics.eingang_snapshot(id),
    station_ref  text NOT NULL,
    tag          date NOT NULL,
    t_mittel     numeric(6,2) NOT NULL,
    gtz_tag      numeric(8,2) NOT NULL,          -- mit den lauf-eigenen t_innen/t_heizgrenze berechnet (B12.1)
    PRIMARY KEY (snapshot_id, tag),
    CONSTRAINT ck_eingang_klima_tag_gtz CHECK (gtz_tag >= 0)
);

-- Dritte Snapshot-Art (D7/A5, B7): pseudonyme PROJEKTION der Einflussgroessen
-- OHNE betroffener_typ/quelle_typ/rechtsgrundlage/anlass_code (die bleiben
-- ausschliesslich in `einfluss`, s. V0020). Kein Personenbezug im Exportpfad
-- -- aber wert_num/wert_code SIND selbst der PII-Wert (A8, s. Kommentar u.).
CREATE TABLE analytics.eingang_einflussgroesse (
    snapshot_id       uuid NOT NULL REFERENCES analytics.eingang_snapshot(id),
    system_id         uuid NOT NULL,             -- Pseudonym-Referenz auf energy.system.id, FK-los (Snapshot-Konvention, s. Datei-Kopf)
    groesse_code      text NOT NULL,
    wert_num          numeric(18,3),
    wert_code         text,
    gueltig_ab_monat  date NOT NULL,
    gueltig_bis_monat date,
    PRIMARY KEY (snapshot_id, system_id, groesse_code, gueltig_ab_monat),
    CONSTRAINT ck_eingang_einflussgroesse_wert CHECK (wert_num IS NOT NULL OR wert_code IS NOT NULL)
);

-- Laufender Vorrat (D4), Revisionsachse -- append-only: neue Revision = neue
-- Zeile, nie Ueberschreiben (R2: DWD revidiert Werte nachtraeglich).
CREATE TABLE analytics.klima_tag (
    station_ref   text NOT NULL,
    tag           date NOT NULL,
    revision      int  NOT NULL,
    t_mittel      numeric(6,2) NOT NULL,
    quelle        text NOT NULL,
    abgerufen_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (station_ref, tag, revision),
    CONSTRAINT ck_klima_tag_revision CHECK (revision >= 0)
);

-- =====================================================================
-- D1 -- Der Berechnungslauf (Nachweis-Artefakt, append-only) + Rechenprotokoll
-- =====================================================================

CREATE TABLE analytics.berechnungslauf (
    id                    uuid PRIMARY KEY,
    endkunde_id           uuid NOT NULL REFERENCES energy.endkunde(id),   -- redundant (B1, ABAC-Filter ohne Join);
                                                                            -- A10: verarbeitungs_status hier auflösbar,
                                                                            -- fail-closed-Prüfung bleibt App-Scope
    energietraeger        text NOT NULL,          -- redundant (B1)
    mvet_id               uuid NOT NULL REFERENCES energy.messkonzept_version_energietraeger(id),
    verfahren_code        text NOT NULL,
    verfahren_version     int  NOT NULL,
    parameter             jsonb NOT NULL,
    parameter_hash        bytea NOT NULL,
    periode_von           date NOT NULL,
    periode_bis           date NOT NULL,
    messwert_snapshot_id  uuid NOT NULL REFERENCES analytics.eingang_snapshot(id),
    klima_snapshot_id     uuid NOT NULL REFERENCES analytics.eingang_snapshot(id),
    station_ref           text NOT NULL,           -- eingefroren, keine Laufzeit-Aufloesung (D4 fail-closed-Regel)
    rohdaten_hash         bytea NOT NULL,           -- Siegel ueber die geordnete Rohmenge (B2.3)
    baseline_wert_kwh     numeric(18,3) NOT NULL,
    grundlast_anteil      numeric(4,3) NOT NULL,    -- g, 0..1 (B12.1)
    gtz_base              numeric(10,2) NOT NULL,
    gtz_norm              numeric(10,2),
    baseline_norm_kwh     numeric(18,3),            -- wetterneutral, NUR Ausweis (B_norm, B12.1)
    qualitaets_stufe_min  text NOT NULL,             -- belastbar|eingeschraenkt|nicht_ausweisbar (B12.4)
    ausloeser             text NOT NULL,             -- manuell|job|nachlauf_korrektur
    code_revision         text NOT NULL,             -- Git-SHA, forensisch (D3)
    ersetzt_lauf_id       uuid REFERENCES analytics.berechnungslauf(id),
    erstellt_at           timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (verfahren_code, verfahren_version)
        REFERENCES analytics.verfahren_version (code, version),
    -- KEIN status, KEIN updated_at: der Lauf entsteht erst bei Erfolg (D1) --
    -- Job-Steuerung lebt getrennt in analytics.lauf_auftrag.
    CONSTRAINT ck_berechnungslauf_periode CHECK (periode_bis > periode_von),
    CONSTRAINT ck_berechnungslauf_ausloeser CHECK (ausloeser IN ('manuell', 'job', 'nachlauf_korrektur')),
    CONSTRAINT ck_berechnungslauf_qualitaet CHECK (qualitaets_stufe_min IN ('belastbar', 'eingeschraenkt', 'nicht_ausweisbar')),
    CONSTRAINT ck_berechnungslauf_grundlast_anteil CHECK (grundlast_anteil >= 0 AND grundlast_anteil <= 1),
    CONSTRAINT ck_berechnungslauf_gtz_base CHECK (gtz_base >= 0),
    CONSTRAINT ck_berechnungslauf_gtz_norm CHECK (gtz_norm IS NULL OR gtz_norm >= 0),
    CONSTRAINT ck_berechnungslauf_baseline_wert CHECK (baseline_wert_kwh >= 0),
    CONSTRAINT ck_berechnungslauf_baseline_norm CHECK (baseline_norm_kwh IS NULL OR baseline_norm_kwh >= 0)
);
-- Hinweis (App-Invariante, NICHT DB-erzwungen): endkunde_id/energietraeger
-- sind aus mvet_id herleitbar (mvet -> messkonzept_version -> messkonzept ->
-- endkunde_id; energietraeger direkt auf mvet) -- die Redundanz ist gewollt
-- (B1), ihre Konsistenz zu mvet_id sicherzustellen ist App-Schreibpfad-Scope
-- (kein Cross-Tabellen-CHECK ueber drei Hops in Postgres sinnvoll abbildbar).

CREATE TABLE analytics.laufergebnis (
    lauf_id           uuid NOT NULL REFERENCES analytics.berechnungslauf(id) ON DELETE CASCADE,  -- D-CASCADE
    monat             date NOT NULL,               -- Monatserster, lokal
    referenz_kwh      numeric(18,3) NOT NULL,       -- R_m
    ist_kwh           numeric(18,3) NOT NULL,       -- A_m
    gtz_ist           numeric(10,2) NOT NULL,
    tage_gesamt       smallint NOT NULL,
    tage_gemessen     smallint NOT NULL,
    tage_geschaetzt   smallint NOT NULL,
    tage_ersatz       smallint NOT NULL,
    tage_fehlend      smallint NOT NULL,
    abdeckung_pct     numeric(5,2) NOT NULL,
    qualitaets_stufe  text NOT NULL,                -- belastbar|eingeschraenkt|nicht_ausweisbar (B12.4)
    PRIMARY KEY (lauf_id, monat),
    CONSTRAINT ck_laufergebnis_monat CHECK (monat = date_trunc('month', monat)::date),
    CONSTRAINT ck_laufergebnis_qualitaet CHECK (qualitaets_stufe IN ('belastbar', 'eingeschraenkt', 'nicht_ausweisbar')),
    CONSTRAINT ck_laufergebnis_werte CHECK (referenz_kwh >= 0 AND ist_kwh >= 0 AND gtz_ist >= 0),
    CONSTRAINT ck_laufergebnis_abdeckung CHECK (abdeckung_pct >= 0 AND abdeckung_pct <= 100),
    CONSTRAINT ck_laufergebnis_tage_nichtneg CHECK (
        tage_gesamt >= 0 AND tage_gemessen >= 0 AND tage_geschaetzt >= 0
        AND tage_ersatz >= 0 AND tage_fehlend >= 0
    ),
    -- B12.4, woertlich: "disjunkt, Summe = tage_gesamt".
    CONSTRAINT ck_laufergebnis_tage_summe CHECK (
        tage_gemessen + tage_geschaetzt + tage_ersatz + tage_fehlend = tage_gesamt
    )
);

-- =====================================================================
-- Mutable, KEIN Nachweisartefakt: Job-Steuerung (D1) + Retention-Bookkeeping (A7)
-- =====================================================================

CREATE TABLE analytics.lauf_auftrag (
    id            uuid PRIMARY KEY,
    endkunde_id   uuid NOT NULL,                  -- kein FK: Auftrag kann auch ohne (noch) aufloesbares mvet entstehen; App prueft
    energietraeger text NOT NULL,
    periode_von   date NOT NULL,
    periode_bis   date NOT NULL,
    status        text NOT NULL,                  -- angefordert|laeuft|abgeschlossen|fehlgeschlagen
    versuche      int  NOT NULL DEFAULT 0,
    fehler_code   text,
    lauf_id       uuid REFERENCES analytics.berechnungslauf(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_lauf_auftrag_status CHECK (status IN ('angefordert', 'laeuft', 'abgeschlossen', 'fehlgeschlagen')),
    CONSTRAINT ck_lauf_auftrag_periode CHECK (periode_bis > periode_von),
    CONSTRAINT ck_lauf_auftrag_versuche CHECK (versuche >= 0)
);

-- A7 (Retention-Mechanik): TRENNT "nie in einen BAFA-Nachweis eingegangen"
-- von "unter Legal-Hold" -- Struktur fuer einen SPAETEREN fristgebundenen
-- Loesch-Job (Ops-/pg_cron-Scope, KEIN Job in dieser Migration). 1:1 zu
-- berechnungslauf, aber bewusst eine EIGENE, mutable Tabelle (nicht eine
-- Spalte auf berechnungslauf selbst): das Nachweis-Artefakt bleibt gemaess
-- D1 vollstaendig frei von jeglichem Status/updated_at ("der Lauf entsteht
-- erst bei Erfolg, es gibt keinen Status im Nachweisartefakt") -- dieselbe
-- Loesung, mit der D1 bereits den Selbstwiderspruch "append-only mit
-- Status-Update" fuer die Job-Steuerung (lauf_auftrag) aufloest, hier
-- wiederverwendet fuer die Retention-Buchhaltung.
CREATE TABLE analytics.lauf_retention_status (
    lauf_id            uuid PRIMARY KEY REFERENCES analytics.berechnungslauf(id) ON DELETE CASCADE,  -- D-CASCADE
    nachweis_gebunden  boolean NOT NULL DEFAULT false,   -- true, sobald ADR-0007 diesen Lauf in einen Nachweis uebernommen hat
    legal_hold         boolean NOT NULL DEFAULT false,   -- Sperre UNABHAENGIG von Nachweisbindung (z. B. laufende Pruefung)
    nachweis_referenz  text,                              -- Slot, KEIN FK (ADR-0007-Scope, analog baseline_beleg_ref)
    gebunden_at        timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_lauf_retention_gebunden_at CHECK (
        (nachweis_gebunden AND gebunden_at IS NOT NULL) OR (NOT nachweis_gebunden AND gebunden_at IS NULL)
    )
);
COMMENT ON TABLE analytics.lauf_retention_status IS
  'A7 (compliance-director-Auflage, Phase-3-Votum ADR-0006): Struktur fuer einen kuenftigen fristgebundenen Loesch-Job auf analytics.berechnungslauf/laufergebnis/eingang_*. Ein Lauf ist erst loeschbar, wenn nachweis_gebunden=false UND legal_hold=false UND die Nachweisfrist (BAFA-Nachweispflicht, Arbeitshypothese) abgelaufen ist. Retention-Frist selbst NICHT in dieser Migration (Ops-/pg_cron-Scope, O-B4/O-B9, retention-engineer+compliance-director).';

CREATE TRIGGER trg_lauf_auftrag_updated_at BEFORE UPDATE ON analytics.lauf_auftrag
    FOR EACH ROW EXECUTE FUNCTION analytics.set_updated_at();
CREATE TRIGGER trg_lauf_retention_status_updated_at BEFORE UPDATE ON analytics.lauf_retention_status
    FOR EACH ROW EXECUTE FUNCTION analytics.set_updated_at();

-- =====================================================================
-- Indizes (mit Begruendung -- keine spekulativen Indizes,
-- .claude/rules/database-migrations.md)
-- =====================================================================

-- API-Listing-Filter (B10): GET /analytics/endkunden/{id}/berechnungslaeufe
-- filtert nach energietraeger + periode.
CREATE INDEX ix_berechnungslauf_endkunde ON analytics.berechnungslauf (endkunde_id, energietraeger, periode_von);
-- F7(b)/Recalc: ein neuer Lauf muss den Vorgaenger je Bezugsobjekt+Periode
-- finden koennen, um ersetzt_lauf_id zu setzen; Basis der View
-- analytics.lauf_aktuell (B1, "juengster Lauf je Bezugsobjekt+Periode, der
-- selbst nicht ersetzt wurde" -- View selbst ist Anwendungs-/Folge-Scope).
CREATE INDEX ix_berechnungslauf_mvet_periode ON analytics.berechnungslauf (mvet_id, periode_von, periode_bis);
-- "der selbst nicht ersetzt wurde" -- Anti-Join-Praedikat fuer lauf_aktuell;
-- partiell, weil die meisten Laeufe (noch) nicht ersetzt sind.
CREATE INDEX ix_berechnungslauf_ersetzt ON analytics.berechnungslauf (ersetzt_lauf_id) WHERE ersetzt_lauf_id IS NOT NULL;

-- Job-Queue-Polling liest nur offene/laufende Auftraege (D1), nicht den
-- gesamten Verlauf.
CREATE INDEX ix_lauf_auftrag_offen ON analytics.lauf_auftrag (status, created_at) WHERE status IN ('angefordert', 'laeuft');

-- Retention-Job (A7): Kandidaten-Selektion "nicht gebunden, keine Sperre".
CREATE INDEX ix_lauf_retention_status_kandidat ON analytics.lauf_retention_status (nachweis_gebunden, legal_hold)
    WHERE NOT nachweis_gebunden AND NOT legal_hold;

-- =====================================================================
-- PII-Kommentare (A8, zwingend -- .claude/rules/database-migrations.md)
-- =====================================================================

COMMENT ON COLUMN analytics.eingang_messwert_tag.wert_kwh IS
  'personenbeziehbar=true; pii=false (pseudonym); grundlage=Art.6(1)(b/f) via identity; retention=BAFA-Nachweispflicht; shred=nein — Re-ID-Schluessel in identity';
COMMENT ON COLUMN analytics.eingang_snapshot.endkunde_id IS
  'personenbeziehbar=true; pii=false (pseudonym); grundlage=Art.6(1)(b/f) via identity; retention=BAFA-Nachweispflicht; shred=nein — Re-ID-Schluessel in identity';
COMMENT ON COLUMN analytics.berechnungslauf.endkunde_id IS
  'personenbeziehbar=true; pii=false (pseudonym); grundlage=Art.6(1)(b/f) via identity; retention=BAFA-Nachweispflicht; shred=nein — Re-ID-Schluessel in identity';
COMMENT ON COLUMN analytics.eingang_einflussgroesse.wert_num IS
  'pii=true — Personenzahl/Nutzflaeche sind der PII-Wert, auch pseudonymisiert; retention wie oben; shred=nein';
COMMENT ON COLUMN analytics.eingang_einflussgroesse.wert_code IS
  'pii=true — Personenzahl/Nutzflaeche sind der PII-Wert, auch pseudonymisiert; retention wie oben; shred=nein';

-- =====================================================================
-- Additiv in energy (D5/B5): Baseline-Bezugszeitraeume fuer GTZ_base.
-- Keine PII, keine neue Rolle -- normale energy-Stammdaten-Tabelle.
-- =====================================================================

CREATE TABLE energy.baseline_periode (
    id          uuid PRIMARY KEY,
    mvet_id     uuid NOT NULL REFERENCES energy.messkonzept_version_energietraeger(id),
    von         date NOT NULL,
    bis         date NOT NULL,
    menge       numeric(18,3),
    einheit     text,
    beleg_ref   uuid,                            -- Slot, KEIN FK (Beleg-ADR, Teil A O4)
    created_at  timestamptz NOT NULL DEFAULT now(),
    CHECK (bis > von)
);
-- GTZ_base-Berechnung (B5/B12.1) liest ALLE Baseline-Perioden je mvet_id.
CREATE INDEX ix_baseline_periode_mvet ON energy.baseline_periode (mvet_id);
-- HINWEIS (wie V0012-Kommentar zu measurement.taegliche_abdeckung): die
-- allgemeine edms_app-Grant-Verdrahtung fuer das Schema `energy` ist in
-- DIESEM Repo bislang in KEINER Migration umgesetzt (ADR-0002-Scope) --
-- diese Tabelle bekommt daher HIER bewusst KEINEN eigenen Grant fuer
-- edms_app (das waere eine spekulative Einzelfall-Loesung fuer genau eine
-- energy-Tabelle, waehrend der Rest von energy weiterhin ungegrantet
-- bliebe). Benannt, nicht nachgezogen (Arbeitsauftrag).

-- =====================================================================
-- A6 -- REVOKE (append-only, Muster V0013/audit-Schema). Gilt fuer die
-- NEUN Nachweis-/Katalog-Tabellen (D-A6-VERFAHREN-REVOKE fuer die ersten
-- beiden, ueber die woertliche B9-Skizze hinaus).
-- =====================================================================

REVOKE UPDATE, DELETE ON
    analytics.verfahren, analytics.verfahren_version,
    analytics.berechnungslauf, analytics.laufergebnis,
    analytics.eingang_snapshot, analytics.eingang_messwert_tag,
    analytics.eingang_klima_tag, analytics.eingang_einflussgroesse,
    analytics.klima_tag
FROM PUBLIC;

-- =====================================================================
-- Rollen (idempotente DO-Bloecke, Muster V0003/V0010) -- A6
-- =====================================================================

DO $$ BEGIN
    CREATE ROLE edms_analytics_owner NOLOGIN;   -- Owner ALLER analytics-Objekte (D-A6-OWNER); NICHT die App-Laufzeitrolle
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Rolle edms_analytics_owner existiert bereits (cluster-globales Objekt) -- ueberspringe.';
END $$;

DO $$ BEGIN
    CREATE ROLE edms_retention NOLOGIN;         -- DELETE-Berechtigte fuer fristgebundene Loeschlaeufe (A6b, D-A6-RETENTION)
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Rolle edms_retention existiert bereits (cluster-globales Objekt) -- ueberspringe.';
END $$;

DO $$ BEGIN
    CREATE ROLE edms_analytics_detail_reader NOLOGIN;  -- Least-Privilege-Leserolle fuer Detail-Snapshots (A6c)
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Rolle edms_analytics_detail_reader existiert bereits (cluster-globales Objekt) -- ueberspringe.';
END $$;

-- edms_app existiert bereits seit V0003 (Runtime-Schreibpfad-Rolle,
-- schemauebergreifend). Credential-/Mitgliedschafts-Zuweisung fuer alle drei
-- neuen Rollen bewusst NICHT Teil dieser Migration (devops-lead/security-lead,
-- wie ueberall in diesem Repo).

-- =====================================================================
-- Ownership (A6a: App-Laufzeitrolle ist NICHT Eigentuemerin) -- ERST HIER
-- =====================================================================

ALTER SCHEMA analytics OWNER TO edms_analytics_owner;

ALTER TABLE analytics.verfahren               OWNER TO edms_analytics_owner;
ALTER TABLE analytics.verfahren_version        OWNER TO edms_analytics_owner;
ALTER TABLE analytics.eingang_snapshot         OWNER TO edms_analytics_owner;
ALTER TABLE analytics.eingang_messwert_tag     OWNER TO edms_analytics_owner;
ALTER TABLE analytics.eingang_klima_tag        OWNER TO edms_analytics_owner;
ALTER TABLE analytics.eingang_einflussgroesse  OWNER TO edms_analytics_owner;
ALTER TABLE analytics.klima_tag                OWNER TO edms_analytics_owner;
ALTER TABLE analytics.berechnungslauf          OWNER TO edms_analytics_owner;
ALTER TABLE analytics.laufergebnis             OWNER TO edms_analytics_owner;
ALTER TABLE analytics.lauf_auftrag             OWNER TO edms_analytics_owner;
ALTER TABLE analytics.lauf_retention_status    OWNER TO edms_analytics_owner;
ALTER FUNCTION analytics.set_updated_at()      OWNER TO edms_analytics_owner;

-- =====================================================================
-- GRANTS (A6, VOLLTEXT -- vom Arbeitsauftrag ausdruecklich zum
-- Gegenlesen angefordert)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (a) App-Laufzeitrolle edms_app: NUR INSERT/SELECT, NIRGENDS UPDATE/DELETE.
--     Auf den REVOKE-Tabellen (s. o.) greift damit REVOKE FROM PUBLIC
--     tatsaechlich, weil edms_app weder Owner ist noch ein UPDATE/DELETE-
--     Grant bekommt. lauf_auftrag/lauf_retention_status sind mutable
--     Bookkeeping-Tabellen (D1/A7) -- dort zusaetzlich UPDATE, aber
--     weiterhin KEIN DELETE (Retention bleibt exklusiv edms_retention
--     vorbehalten, s. u.).
-- ---------------------------------------------------------------------

GRANT USAGE ON SCHEMA analytics TO edms_app;

GRANT SELECT ON analytics.verfahren, analytics.verfahren_version TO edms_app;   -- lesen, NIE schreiben (D-A6-VERFAHREN-REVOKE)

GRANT INSERT, SELECT ON
    analytics.berechnungslauf, analytics.laufergebnis,
    analytics.eingang_snapshot, analytics.eingang_messwert_tag,
    analytics.eingang_klima_tag, analytics.eingang_einflussgroesse,
    analytics.klima_tag
    TO edms_app;

GRANT INSERT, SELECT, UPDATE ON analytics.lauf_auftrag TO edms_app;
GRANT INSERT, SELECT, UPDATE ON analytics.lauf_retention_status TO edms_app;   -- setzt nachweis_gebunden/legal_hold (ADR-0007-Anschluss)

-- ---------------------------------------------------------------------
-- (b) Retention-Rolle edms_retention: NUR DELETE auf den sieben Nachweis-/
--     Snapshot-Tabellen (NICHT auf verfahren/verfahren_version, die gelten
--     fuer IMMER, auch fuer uralte Laeufe -- s. D-A6-RETENTION). Ausfuehrung
--     eines konkreten Loesch-Jobs ist Ops-/pg_cron-Scope (A7), NICHT Teil
--     dieser Migration -- diese Rolle ist die STRUKTUR dafuer.
-- ---------------------------------------------------------------------

GRANT USAGE ON SCHEMA analytics TO edms_retention;

GRANT DELETE ON
    analytics.berechnungslauf, analytics.laufergebnis,
    analytics.eingang_snapshot, analytics.eingang_messwert_tag,
    analytics.eingang_klima_tag, analytics.eingang_einflussgroesse,
    analytics.klima_tag
    TO edms_retention;

-- Lesend, um Retention-Kandidaten zu bestimmen (nachweis_gebunden/legal_hold,
-- A7) und verwaiste Snapshots zu identifizieren (D-CASCADE-Kommentar oben).
GRANT SELECT ON
    analytics.berechnungslauf, analytics.laufergebnis,
    analytics.eingang_snapshot, analytics.eingang_messwert_tag,
    analytics.eingang_klima_tag, analytics.eingang_einflussgroesse,
    analytics.klima_tag, analytics.lauf_retention_status
    TO edms_retention;

-- ---------------------------------------------------------------------
-- (c) Detail-Leserolle edms_analytics_detail_reader: NUR SELECT auf die
--     zwei Detail-Snapshot-Tabellen (read:verbrauch_detail-Niveau, B10) plus
--     eingang_snapshot fuer Metadaten (D-A6-DETAIL-READER, ueber den
--     woertlichen Auftrag hinaus ergaenzt). KEIN INSERT/UPDATE/DELETE, KEIN
--     Zugriff auf berechnungslauf/laufergebnis (Aggregat-Niveau,
--     read:verbrauch_aggregat, bereits ueber edms_app/read:berechnungslauf
--     erreichbar -- diese Rolle deckt NUR das Detail-Niveau ab, B10).
-- ---------------------------------------------------------------------

GRANT USAGE ON SCHEMA analytics TO edms_analytics_detail_reader;

GRANT SELECT ON
    analytics.eingang_messwert_tag,
    analytics.eingang_einflussgroesse,
    analytics.eingang_snapshot
    TO edms_analytics_detail_reader;
