-- V0028__messkonzept_version_energietraeger_system_zuordnung.sql
--
-- Befund (Arbeitsauftrag database-lead, Phase-4-Verifikation ADR-0007):
-- `energy.messkonzept_version_energietraeger` (mvet) hat KEIN `system_id`
-- — die Kette mvet -> `messkonzept_version` -> `messkonzept` ->
-- `endkunde` führt NIE zu einem System. `system_id` existiert nur auf
-- `energy.zaehler` und `energy.nutzungsverhaeltnis`. Bereits in V0023
-- ("OFFENER KLÄRUNGSPUNKT", D-SCOPE-ANSCHLUSSNUTZER) als Ursache dafür
-- benannt, dass der DB-Backstop-Trigger für die Anschlussnutzer-Sperre
-- NICHT gebaut werden konnte, dort ausdrücklich mit der Empfehlung (a)
-- "eine echte mvet_id/system-Zuordnungstabelle nachziehen". Diese Lücke
-- blockiert/betrifft VIER Dinge:
--   - ADR-0007 A12: Kategorie `rohdaten` bleibt gesperrt, solange
--     Anschlussnutzer-Sperren nicht auflösbar sind.
--   - ADR-0006 P4/C5 (Teil C, C4/C5): die Anschlussnutzer-Sperre im
--     DB-Backstop-Trigger (V0023) ist mangels dieser Zuordnung NICHT
--     baubar.
--   - ADR-0007 O-B3b: der WEG für die Substitutions-Erkennung ist ein
--     EXPLIZITES Feld am Messkonzept (B14, `energietraeger_substitution
--     boolean`, NICHT diese Tabelle) — die hier gebaute Zuordnung ist aber
--     Voraussetzung für die dort ausdrücklich als OPTIONAL benannte
--     Plausibilitätsprüfung ("Warnung, wenn ein Trägerwechsel [über die
--     mvet-Historie desselben Systems] sichtbar ist, das Kennzeichen aber
--     fehlt") — ohne mvet->System-Zuordnung ist "dasselbe System über
--     mehrere mvet-Versionen hinweg" nicht feststellbar. Nuance
--     (Sorgfaltspflicht, keine Beschönigung): diese Migration ersetzt
--     NICHT das in B14 entschiedene Merkmal, sie eröffnet nur den Pfad für
--     dessen optionale Zusatzprüfung.
--   - Die v1-Heuristik im Modul `berechnung`
--     (`AnalyticsMesswertMonatRepository.findAktiveZaehlerIds`,
--     src/backend/src/berechnung/persistence/
--     analytics-messwert-monat.repository.ts): "ALLE aktiven Zähler des
--     Endkunden mit passendem Energieträger" — dort selbst bereits als
--     "gröber als eine echte Systemgrenzen-Zuordnung" dokumentiert (ein
--     Endkunde mit ZWEI unabhängigen Gas-Messkonzepten summiert/prüft
--     fälschlich beide Systeme gemeinsam).
--
-- User-Entscheidung (fachlich, 2026-08-26): 1 mvet -> MEHRERE Systeme ->
-- n:m-Zuordnungstabelle, KEINE Spalte auf mvet.
--
-- Diese Migration baut NUR die Struktur. Sie baut NICHT: (a) das
-- B14-Merkmal `energietraeger_substitution` selbst (anderes Feld, anderer
-- Zweck, s. o.), (b) den Anschlussnutzer-Sperre-Trigger-Zweig aus V0023
-- (der bräuchte zusätzlich die in V0023 benannten Zeitraum-/
-- Zeitzonen-Entscheidungen (2) und die `energy.anschlussnutzer.
-- verarbeitungs_status`-Wertemenge (3) — beide dort weiterhin offen), (c)
-- eine Migration der v1-Heuristik auf diese Tabelle (Anwendungscode,
-- backend-lead/access-control-engineer-Scope), (d) Befüllung mit
-- Bestandsdaten (Tabelle startet LEER, s. u.).
--
-- NUR ENTWURF (Arbeitsauftrag): kein Apply gegen die Dev-DB (Port 5437),
-- kein Commit — ausschließlich gegen einen Wegwerf-Testcontainer
-- verifiziert (timescale/timescaledb:2.15.3-pg16-oss).
--
-- =====================================================================
-- Namenswahl `energy.messkonzept_version_energietraeger_system`
-- =====================================================================
-- Verworfene Alternativen:
--   - `energy.mvet_system`: "mvet" ist im Repo ausschließlich als
--     SPALTEN-Abkürzung etabliert (`mvet_id` auf `analytics.
--     berechnungslauf`/`energy.baseline_periode`, V0019) — NIE als
--     Tabellennamens-Fragment. Das als Tabellenname einzuführen wäre eine
--     NEUE, hier nicht angefragte Abkürzungskonvention.
--   - `energy.mvet_system_zuordnung` / `..._energietraeger_system_
--     zuordnung`: der bereits existierende Schwester-Fall für eine reine
--     n:m-Zuordnung, `energy.geraetegruppe_kanal` (V0002), trägt KEIN
--     `_zuordnung`-Suffix, obwohl er fachlich ebenfalls eine Zuordnung
--     ist. Für Konsistenz mit diesem einzigen bereits etablierten
--     Präzedenzfall bleibt der Name auf die vollen Namen beider
--     referenzierten Tabellen beschränkt, ohne Suffix.
-- Gewählt: volle Namen beider Seiten aneinandergereiht, exakt wie
-- `energy.geraetegruppe_kanal` es für `geraetegruppe`+`messkanal` tut.
-- Länge (47 Zeichen) liegt weit unter dem PostgreSQL-Bezeichnerlimit
-- (63 Byte).
--
-- =====================================================================
-- Mandantentreue DEKLARATIV (ADR-0010/V0017-Muster, hier auf ZWEI
-- FREMDE Tabellen statt einem Self-FK verallgemeinert)
-- =====================================================================
-- ADR-0010 (`energy.standort`) erzwingt "Kind und Parent gehören zum
-- selben Endkunden" über einen zusammengesetzten SELF-FK: `UNIQUE (id,
-- endkunde_id)` auf derselben Tabelle macht das Paar zu einem gültigen
-- FK-Ziel, und `FOREIGN KEY (parent_id, endkunde_id) REFERENCES
-- energy.standort (id, endkunde_id)` verlangt dann Wertegleichheit.
--
-- Hier gibt es KEINEN Self-FK, sondern ZWEI verschiedene Elterntabellen
-- (mvet, system) — das Muster wird daher auf zwei GESCHWISTER-FKs
-- verallgemeinert, die dieselbe EINE `endkunde_id`-Spalte der
-- Zuordnungszeile referenzieren:
--   FOREIGN KEY (mvet_id,   endkunde_id) REFERENCES mvet   (id, endkunde_id)
--   FOREIGN KEY (system_id, endkunde_id) REFERENCES system (id, endkunde_id)
-- Weil BEIDE FKs denselben `endkunde_id`-Spaltenwert der Zuordnungszeile
-- prüfen, kann ein INSERT nur dann gelingen, wenn dieser EINE Wert
-- GLEICHZEITIG mit der `endkunde_id` der referenzierten mvet-Zeile UND der
-- referenzierten system-Zeile übereinstimmt — transitiv also nur, wenn
-- mvet.endkunde_id = system.endkunde_id gilt. Ein Zuordnungsversuch über
-- die Mandantengrenze hinweg findet für mindestens einen der beiden FKs
-- keine passende (id, endkunde_id)-Zeile und scheitert an der
-- FK-Maschinerie selbst (Fehlercode 23503) — OHNE Trigger, OHNE
-- Anwendungscode, strukturell durch PostgreSQL erzwungen.
--
-- Voraussetzung dafür (Arbeitsauftrag: "wenn dafür eine redundante
-- endkunde_id-Spalte plus zusammengesetzte FKs nötig sind, baue sie"):
--   - `energy.system` hat `endkunde_id` bereits seit V0002 (NOT NULL) —
--     hier fehlt nur die zusätzliche `UNIQUE (id, endkunde_id)`, die das
--     Paar erst als FK-Ziel zulässig macht (Nachtrag unten, Schritt 1).
--   - `energy.messkonzept_version_energietraeger` hat HEUTE gar KEIN
--     `endkunde_id` — der V0019-Kommentar zu `analytics.berechnungslauf`
--     benennt genau diese Lücke bereits wörtlich: "endkunde_id/
--     energietraeger sind aus mvet_id herleitbar (mvet -> messkonzept_
--     version -> messkonzept -> endkunde_id; ... kein Cross-Tabellen-CHECK
--     über drei Hops in Postgres sinnvoll abbildbar" — und löst das dort
--     für `berechnungslauf` durch eine REDUNDANTE Kopie, deren Konsistenz
--     zu `mvet_id` App-Scope bleibt (KEIN DB-Constraint, weil `berechnungs
--     lauf` selbst kein FK-Ziel für einen Dritten sein muss). Hier ist das
--     ANDERS: wir brauchen `(id, endkunde_id)` als FK-ZIEL für die neue
--     Zuordnungstabelle — die Redundanz ist deshalb NICHT mehr bloß eine
--     Bequemlichkeitskopie, sondern die einzige Möglichkeit, denselben
--     Mandantentreue-Mechanismus wie ADR-0010 deklarativ abzubilden.
--     `id` allein ist als Primärschlüssel bereits global eindeutig — die
--     REDUNDANTE Kombination `(id, endkunde_id)` fügt KEINE neue
--     Eindeutigkeits-Garantie hinzu, sie ist ausschließlich das
--     FK-Ziel-Vehikel (identisches Argument zu ADR-0010/V0017,
--     dort für `energy.standort.id` + `endkunde_id`). Nachtrag unten,
--     Schritt 0: `ADD COLUMN endkunde_id` (rückwirkend befüllt aus dem
--     bestehenden 3-Hop-Pfad) + `UNIQUE (id, endkunde_id)`.
--
-- WICHTIGE NEBENWIRKUNG (Rollout-Koordination, backend-lead): ab dieser
-- Migration ist `energy.messkonzept_version_energietraeger.endkunde_id`
-- NOT NULL OHNE Default. Der bestehende Schreibpfad
-- (`EnergyMesskonzeptRepository.insertEnergietraeger()`,
-- src/backend/src/stammdaten/persistence/energy/
-- energy-messkonzept.repository.ts) liefert diese Spalte HEUTE NICHT mit
-- — jeder INSERT über diesen Pfad schlägt NACH dieser Migration fail-
-- closed mit einem NOT-NULL-Verstoß (23502) fehl, bis der Repository-Code
-- um `endkunde_id` ergänzt wird. Das ist ABSICHTLICH (fail-closed ist
-- sicherer als ein still falsch befüllter Mandant), aber ZWINGEND VOR
-- Anwendung dieser Migration mit dem Rollout des Code-Patches zu
-- koordinieren — sonst ist die Messkonzept-Erfassung im Betrieb blockiert.
--
-- =====================================================================
-- Temporalität: BEWUSST KEINE eigene Zeitachse
-- =====================================================================
-- `energy.messkonzept_version` ist bereits versioniert und append-only
-- (V0002: `UNIQUE (messkonzept_id, version_nr)`, `gueltig_von`/
-- `gueltig_bis`, "Änderungshistorie = append-only; keine destruktiven
-- Updates"). Eine Änderung der System-Zuordnung ist damit bereits über die
-- Versions-Achse der mvet abgedeckt: eine geänderte Zuordnung erfordert
-- eine NEUE `messkonzept_version` (also eine neue `mvet_id`), NICHT ein
-- Update dieser Zuordnungstabelle. Diese Tabelle bekommt deshalb WEDER
-- `gueltig_von`/`gueltig_bis` NOCH `updated_at` — NICHT vergessen, SONDERN
-- ausdrücklich entschieden: eine spätere "Nachrüstung" einer eigenen
-- Zeitachse hier würde eine ZWEITE, mit der mvet-Versionierung
-- konkurrierende Temporalitäts-Quelle schaffen. Konsequent dazu: KEIN
-- `UPDATE`-Grant (s. GRANTS unten) — eine falsche Zuordnung wird durch
-- eine neue mvet-Version korrigiert, nicht in-place editiert (identisches
-- Prinzip zu `energy.messkonzept_version_energietraeger` selbst, die
-- ebenfalls kein `updated_at` trägt, V0002 "Abweichung (e)").
--
-- =====================================================================
-- Übergangszustand: Tabelle startet LEER, KEINE Mindest-Zuordnung
-- =====================================================================
-- Jedes Bestands-`mvet` hat nach dieser Migration KEINE Zuordnung — das
-- ist ein GÜLTIGER Zustand, kein Datenfehler. Ein `CHECK`/Trigger, der
-- mindestens eine System-Zuordnung je mvet erzwingt, würde JEDES
-- bestehende Messkonzept sofort brechen (Arbeitsauftrag: ausdrücklich
-- NICHT erzwingen). Die bestehende v1-Heuristik
-- (`findAktiveZaehlerIds`, s. o.) bleibt für nicht zugeordnete mvet
-- unverändert als FALLBACK in Kraft — Status quo, nicht verschlechtert.
-- Ob/wann die Anwendung auf "Zuordnung vorhanden -> nutze sie, sonst ->
-- Heuristik" umstellt, ist backend-lead-Scope, NICHT Teil dieser
-- Migration.
--
-- =====================================================================
-- Index-Schnitt (beide Leserichtungen)
-- =====================================================================
-- PRIMARY KEY (mvet_id, system_id) bedient Leserichtung 1 ("alle Systeme
-- einer mvet", O-B3b-Plausibilitätsprüfung) bereits vollständig über sein
-- führendes Präfix `mvet_id` — kein Zusatzindex nötig.
-- Leserichtung 2 ("alle mvets eines Systems", ADR-0007 A12: "System ->
-- Sperre auflösen") steht NICHT am PK-Präfix — ohne eigenen Index wäre das
-- ein Sequential Scan über die gesamte Zuordnungstabelle. Eigener,
-- begründeter Index unten (kein spekulativer Index, .claude/rules/
-- database-migrations.md — beide Richtungen sind im Arbeitsauftrag
-- ausdrücklich als gebrauchte Zugriffspfade benannt).
--
-- =====================================================================
-- GRANTS für edms_app
-- =====================================================================
-- SELECT/INSERT, bewusst KEIN UPDATE (s. "Temporalität" oben) und KEIN
-- DELETE (eine falsche Zuordnung wird durch eine neue mvet-Version
-- ersetzt, nicht gelöscht — identisches append-only-Prinzip wie
-- `messkonzept`/`messkonzept_version`/`messkonzept_version_
-- energietraeger` selbst). Abweichung vom V0019-Präzedenzfall
-- `energy.baseline_periode` (dort BEWUSST KEIN edms_app-Grant, weil "die
-- allgemeine edms_app-Grant-Verdrahtung für das Schema `energy` in DIESEM
-- Repo bislang in KEINER Migration umgesetzt ist" — eine Einzeltabellen-
-- Lösung wäre spekulativ gewesen): dieser Arbeitsauftrag verlangt
-- AUSDRÜCKLICH Grants für edms_app auf dieser neuen Tabelle — anders als
-- bei `baseline_periode` also KEINE offene Frage, sondern ein expliziter
-- Auftrag. Das GRANT `USAGE ON SCHEMA energy` ist Voraussetzung dafür,
-- dass das Tabellen-Grant überhaupt wirkt (`energy` hat laut V0002 kein
-- begleitendes `GRANT ... TO PUBLIC`) — identisches Muster zu V0010
-- (`GRANT USAGE ON SCHEMA energy TO edms_ingest_worker`) und V0023
-- (`... TO edms_analytics_owner`). Diese Migration löst die ALLGEMEINE
-- `energy`/edms_app-Verdrahtungslücke NICHT (bewusst offen benannt in
-- V0019) — sie eröffnet den Zugriff NUR für die eine hier gebaute Tabelle.
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- (0) Nachtrag mvet: endkunde_id (+Backfill, NOT NULL, FK, UNIQUE) ->
-- (1) Nachtrag system: UNIQUE(id, endkunde_id) ->
-- (2) CREATE TABLE Zuordnung (PK, 2 zusammengesetzte FKs) ->
-- (3) Index (Leserichtung 2) -> (4) Kommentare -> (5) GRANTS.

-- =====================================================================
-- (0) Nachtrag energy.messkonzept_version_energietraeger
-- =====================================================================

ALTER TABLE energy.messkonzept_version_energietraeger
    ADD COLUMN endkunde_id uuid;

UPDATE energy.messkonzept_version_energietraeger AS mvet
   SET endkunde_id = mk.endkunde_id
  FROM energy.messkonzept_version AS mv
  JOIN energy.messkonzept AS mk ON mk.id = mv.messkonzept_id
 WHERE mv.id = mvet.messkonzept_version_id;

ALTER TABLE energy.messkonzept_version_energietraeger
    ALTER COLUMN endkunde_id SET NOT NULL;

ALTER TABLE energy.messkonzept_version_energietraeger
    ADD CONSTRAINT fk_mvet_endkunde FOREIGN KEY (endkunde_id) REFERENCES energy.endkunde(id);

ALTER TABLE energy.messkonzept_version_energietraeger
    ADD CONSTRAINT ux_mvet_id_endkunde UNIQUE (id, endkunde_id);

COMMENT ON COLUMN energy.messkonzept_version_energietraeger.endkunde_id IS
  'Redundant (App-Invariante bereits seit V0019-Kommentar auf analytics.berechnungslauf dokumentiert: aus messkonzept_version -> messkonzept -> endkunde_id ableitbar, 3 Hops, in Postgres nicht als Cross-Tabellen-CHECK abbildbar). Ab V0028 DB-seitig als FK-Ziel-Anker für den zusammengesetzten Mandantentreue-FK auf energy.messkonzept_version_energietraeger_system genutzt (ADR-0010/V0017-Muster, verallgemeinert auf zwei Fremdtabellen). ACHTUNG Rollout: NOT NULL ohne Default — der bestehende Schreibpfad (EnergyMesskonzeptRepository.insertEnergietraeger()) muss vor Anwendung dieser Migration um diese Spalte ergänzt werden. Keine PII (Pseudonym-Referenz auf energy.endkunde.id, rote Linie 1).';

-- =====================================================================
-- (1) Nachtrag energy.system: FK-Ziel-Paar für denselben Mechanismus
-- =====================================================================
-- endkunde_id existiert bereits seit V0002 (NOT NULL) — hier fehlt nur die
-- zusätzliche UNIQUE(id, endkunde_id), die das Paar als FK-Ziel zulässig
-- macht. Redundanzargument s. Migrations-Kopf.

ALTER TABLE energy.system
    ADD CONSTRAINT ux_system_id_endkunde UNIQUE (id, endkunde_id);

-- =====================================================================
-- (2) Die Zuordnungstabelle selbst
-- =====================================================================

CREATE TABLE energy.messkonzept_version_energietraeger_system (
    mvet_id     uuid NOT NULL,
    system_id   uuid NOT NULL,
    endkunde_id uuid NOT NULL,   -- Mandantentreue-Anker, s. Migrations-Kopf — KEINE dritte unabhängige Quelle
    created_at  timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (mvet_id, system_id),

    CONSTRAINT fk_mvet_system_mvet_mandant
        FOREIGN KEY (mvet_id, endkunde_id)
        REFERENCES energy.messkonzept_version_energietraeger (id, endkunde_id),

    CONSTRAINT fk_mvet_system_system_mandant
        FOREIGN KEY (system_id, endkunde_id)
        REFERENCES energy.system (id, endkunde_id)

    -- Bewusst KEIN ON DELETE CASCADE/SET NULL auf beiden FKs (Default NO
    -- ACTION): weder mvet- noch system-Zeilen werden je hart gelöscht
    -- (mvet: append-only/immutable, V0002 "Abweichung (e)"; system: "NIE
    -- hart löschen", database-lead-Votum S3-Bedingung b, V0002) — ein
    -- ON-DELETE-Verhalten für einen Fall, der nie eintritt, wäre
    -- spekulativ.
);

-- =====================================================================
-- (3) Index — Leserichtung 2 ("alle mvets eines Systems", ADR-0007 A12)
-- =====================================================================
-- system_id steht nicht am PK-Präfix (mvet_id, system_id) — ohne diesen
-- Index wäre "alle mvets zu System X" ein Sequential Scan. mvet_id als
-- zweite Spalte ergänzt (statt Index nur auf system_id): deckt den
-- Lesepfad "System -> Liste seiner mvets" per Index-Only-Scan, ohne einen
-- zusätzlichen Heap-Zugriff für die zurückgegebene mvet_id-Spalte.

CREATE INDEX ix_mvet_system_by_system ON energy.messkonzept_version_energietraeger_system (system_id, mvet_id);

-- =====================================================================
-- (4) Kommentare
-- =====================================================================

COMMENT ON TABLE energy.messkonzept_version_energietraeger_system IS
  'n:m-Zuordnung Messkonzept-Version-Energieträger (mvet) <-> System (User-Entscheidung 2026-08-26: 1 mvet kann MEHRERE Systeme referenzieren). Schließt die strukturelle Lücke "mvet -> System nie auflösbar" (ADR-0007 A12, ADR-0006 P4/C5, s. V0023 "OFFENER KLÄRUNGSPUNKT"; Voraussetzung für die optionale O-B3b-Plausibilitätsprüfung, NICHT Ersatz für das dort entschiedene Merkmal energietraeger_substitution). BEWUSST OHNE eigene Zeitachse (gueltig_von/gueltig_bis/updated_at): messkonzept_version ist bereits versioniert und append-only — eine geänderte Zuordnung erfordert eine NEUE mvet-Version, kein Update dieser Tabelle (s. Migrations-Kopf "Temporalität"). Startet LEER: ein mvet ohne Zuordnung ist ein gültiger Übergangszustand (Bestands-Messkonzepte) — die bestehende Endkunde+Energieträger-Heuristik (AnalyticsMesswertMonatRepository.findAktiveZaehlerIds) bleibt Fallback, bis Zuordnungen gepflegt sind. KEIN CHECK/KEINE Mindest-Zuordnung erzwungen (würde Bestand brechen).';

COMMENT ON COLUMN energy.messkonzept_version_energietraeger_system.endkunde_id IS
  'Mandantentreue-Anker (ADR-0010/V0017-Muster, auf zwei Fremdtabellen verallgemeinert, s. Migrations-Kopf): MUSS mit der endkunde_id BEIDER referenzierter Zeilen (mvet UND system) übereinstimmen — erzwungen durch zwei zusammengesetzte FKs auf dieselbe Spalte, nicht durch einen Trigger. Redundant zu energy.system.endkunde_id/energy.messkonzept_version_energietraeger.endkunde_id, aber kein Duplizierungsfehler: der Wert muss beim INSERT mit BEIDEN Seiten identisch gewählt werden, sonst schlägt einer der beiden FKs fehl (23503). Keine PII (Pseudonym-Referenz, rote Linie 1).';

-- =====================================================================
-- (5) GRANTS für edms_app (s. Migrations-Kopf "GRANTS für edms_app")
-- =====================================================================

GRANT USAGE ON SCHEMA energy TO edms_app;

GRANT SELECT, INSERT ON energy.messkonzept_version_energietraeger_system TO edms_app;
-- Bewusst KEIN UPDATE (Temporalität oben) und KEIN DELETE (append-only-
-- Prinzip wie messkonzept/messkonzept_version/messkonzept_version_
-- energietraeger selbst) — s. Migrations-Kopf "GRANTS für edms_app".
