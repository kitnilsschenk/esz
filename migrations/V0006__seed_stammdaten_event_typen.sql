-- V0006__seed_stammdaten_event_typen.sql
--
--
-- ADR-Bezug: docs/adr/ADR-0008-stammdaten-betriebs-ui.md Teil B §17 (D5 --
-- "Audit-Verdrahtung, Linie 4, erster Fach-Emitter") + §16 (D4 -- Break-glass
-- `read:verbrauch_detail`) + §22 (D10 -- `kontext.synthetic` Pflicht-Tag).
-- Konsistent zu ADR-0003 §13.2 ("kontrolliertes Vokabular, ausschliesslich
-- ueber `/add-audit-event` erweiterbar") und dem Katalog-Mechanismus aus
-- migrations/V0003__audit_log_schema.sql (Tabellen `audit.event_typ` +
-- `audit.event_typ_version`, SCD2, append-only) sowie dem darauf aufsetzenden
-- Muster aus migrations/V0004__seed_auth_event_typen.sql (Seed-Konventionen
-- 1:1 uebernommen: `gen_random_uuid()` fuer `event_typ_version.id` bei
-- Migrations-Seed-Zeilen ist ausdruecklich zulaessig, App-Laufzeit-Events
-- bleiben UUIDv7 ohne DB-Default).
--
-- Arbeitspaket: `/add-audit-event` fuer die Fach-Event-Codes aus
-- `src/backend/src/stammdaten/audit/stammdaten-audit-events.ts`
-- (`STAMMDATEN_EVENT_CODES`) -- Referenz-Konstanten, die von den
-- `@AuditAction`-Decoratoren in den Stammdaten-Controllern bereits
-- KONSUMIERT werden (s. Ist-Stand-Abgleich unten), aber bislang OHNE
-- Katalog-Eintrag am DB-seitigen FK/Trigger fail-closed scheitern wuerden
-- (Bootstrap-Luecke, analog AUTH_EVENT_CODES vor V0004). Design-Owner dieser
-- Migration: audit-trail-engineer (Fachschema Action/objekt_typ/Kontext-
-- Whitelist/rolle_erfassen/pflichtereignis je Code -- kein PII, kontrolliertes
-- Vokabular). Review vorgesehen: access-control-engineer/compliance-director
-- (s. `stammdaten-audit-events.ts`-TODO).
--
-- =====================================================================
-- BEFUND: 17 Codes, NICHT 18 (Abweichung vom Arbeitsauftrag)
-- =====================================================================
--
-- Der Arbeitsauftrag spricht von "18 zu seedenden Codes". Ein Vollzaehlen von
-- `STAMMDATEN_EVENT_CODES` in `stammdaten-audit-events.ts` (Stand dieser
-- Migration) ergibt exakt **17** Eintraege:
--   4x endkunde.stammdaten.* (angelegt/geaendert/gesperrt/geschreddert)
--   2x system.stammdaten.* (angelegt/geaendert)
--   3x zaehler.stammdaten.* (angelegt/geaendert/stillgelegt)
--   3x messkanal.stammdaten.* (angelegt/geaendert/stillgelegt)
--   1x messkonzept.version.angelegt
--   1x anschlussnutzer.stammdaten.angelegt
--   2x nutzungsverhaeltnis.* (angelegt/beendet)
--   1x stammdaten.verbrauch_detail.einsicht
-- Diese Migration seedet die tatsaechlich im Code vorhandenen 17 Codes.
-- KEIN 18. Code wurde in `stammdaten-audit-events.ts`, den neun Stammdaten-
-- Controllern oder `docs/adr/ADR-0008-stammdaten-betriebs-ui.md` §17
-- gefunden (dort werden ebenfalls exakt diese 17 Codes aufgezaehlt, s.
-- ADR-Zitat: "endkunde.stammdaten.angelegt/.geaendert/.gesperrt/
-- .geschreddert, system.stammdaten.angelegt/geaendert,
-- zaehler.stammdaten.angelegt/geaendert/stillgelegt, messkanal.*,
-- messkonzept.version.angelegt, anschlussnutzer.stammdaten.angelegt,
-- nutzungsverhaeltnis.angelegt/beendet, stammdaten.verbrauch_detail.
-- einsicht"). Der Auftrag-Zaehler "18" wird als Uebertragungsfehler
-- gewertet und NICHT durch einen erfundenen 18. Code kompensiert (kein
-- Katalog-Eintrag ohne realen Code/Decorator-Bezug, s. Grounding-Pflicht des
-- Arbeitsauftrags selbst). Bitte im Review gegenpruefen.
--
-- Zusaetzlicher BEFUND: `shred:anschlussnutzer` ist bereits als
-- `PolicyAction` (policy-decision-port.ts) UND als Fachaktion in ADR-0008
-- §14 ("shred:endkunde|anschlussnutzer, Art. 17") vorgesehen, aber es
-- existiert (a) KEIN `ANSCHLUSSNUTZER_GESCHREDDERT`-Code in
-- `STAMMDATEN_EVENT_CODES` und (b) KEINE Shredding-Route in
-- `anschlussnutzer.controller.ts` (nur `anlegen`/`lesen` implementiert).
-- Diese Migration seedet daher NICHTS fuer Anschlussnutzer-Shredding --
-- das ist kein Versehen dieser Migration, sondern spiegelt den Ist-Stand
-- des Codes. Sobald `api-developer`/`backend-lead` die Route + den Code
-- nachziehen, braucht es eine WEITERE `/add-audit-event`-Migration (V0007+).
--
-- =====================================================================
-- Ist-Stand-Abgleich (Code-Review vor dieser Migration, s. finale Antwort)
-- =====================================================================
--
-- Alle neun Stammdaten-Controller (`src/backend/src/stammdaten/*/*.
-- controller.ts`) wurden gegen ihre `@AuditAction<...>({...})`-Decorators
-- geprueft (`objektRefExtractor`, `kontextExtractors`) -- die
-- `erlaubte_kontext_keys` unten sind NICHT geraten, sondern 1:1 aus dem
-- bereits geschriebenen Decorator-Code abgelesen:
--
--   - `endkunde.controller.ts` (anlegen/aendern/sperren/kryptoShredding) UND
--     `anschlussnutzer.controller.ts` (anlegen): alle fuenf Routen tragen
--     `@UseInterceptors(SyntheticOnlyInterceptor)` +
--     `kontextExtractors: { synthetic: ({ request }) => request.synthetic }`
--     -- `kontext.synthetic` ist PFLICHT-Kontext-Key auf JEDER PII-
--     Schreibroute (ADR-0008 §22/D10, `SyntheticOnlyInterceptor` setzt
--     `request.synthetic = true`, boolean-Skalar, Seal-Trigger-kompatibel).
--   - `system.controller.ts`, `zaehler.controller.ts`,
--     `messkanal.controller.ts`/`messkanal-unter-zaehler.controller.ts`,
--     `nutzungsverhaeltnis.controller.ts`: KEIN `SyntheticOnlyInterceptor`,
--     KEINE `kontextExtractors` -- diese Ressourcen leben in `energy.*`
--     (ADR-0004 §13.2, physisch von `identity.*`/PII getrennter Namensraum,
--     M5-Data-Residency-Trennbarkeit) und sind NICHT PII. `erlaubte_
--     kontext_keys='{}'` fuer alle acht Codes dieser Gruppe.
--   - `messkonzept.controller.ts` (anlegenVersion): EINZIGER Code mit
--     `objektRefExtractor: ({ request }) => request.params['endkundeId']`
--     (NICHT `result.id`!) UND `kontextExtractors: { version_nr: ({ result })
--     => result?.versionNr }`. s. eigener Abschnitt "BEFUND: objekt_ref bei
--     MESSKONZEPT_VERSION_ANGELEGT" unten -- bewusst dokumentierte
--     Design-Eigenheit, kein Bug.
--   - `stammdaten.verbrauch_detail.einsicht`: KEIN Decorator, KEIN
--     Controller, KEIN Emitter irgendwo im Repo gefunden (grep ueber
--     `src/backend/src` liefert nur die Konstanten-Definition + PDP-/Break-
--     glass-Bausteine, s. u.). ADR-0008 §16: "In v1 existiert KEIN Endpoint,
--     der Verbrauchs-Detailinhalt liefert ... erster realer Konsument =
--     Verbrauchs-/Lastgang-Endpoint (ADR-0005)". Katalog-Eintrag hier
--     TROTZDEM angelegt (Auftrag ausdruecklich: "kein v1-Konsument, aber
--     Katalog-Eintrag jetzt"), analog zu `authz.zugriff.verweigert` in V0004
--     (Katalog vorhanden, Emitter folgt separat) bzw. `audit.ddl.gemeldet`
--     in V0003.
--
-- =====================================================================
-- GROUNDING fuer `stammdaten.verbrauch_detail.einsicht` (kein Raten)
-- =====================================================================
--
-- ADR-0008 §16 (D4) legt die Katalog-Metadaten fuer diesen Code WOERTLICH
-- fest -- diese Migration UEBERNIMMT sie unveraendert, statt eigene Kontext-
-- Keys zu entwerfen:
--   "Auch der permit-Fall wird auditiert (neues Fach-Event
--   `stammdaten.verbrauch_detail.einsicht`,
--   `erlaubte_kontext_keys=['zweck_code','zaehler_ref','fenster_tage']`,
--   `rolle_erfassen=true`, ueber `/add-audit-event` in Phase 4)."
-- Ergaenzend abgeglichen gegen die bereits VORHANDENE PDP-/Break-glass-
-- Implementierung (`src/backend/src/auth/policy/in-code-policy.adapter.ts`,
-- `break-glass.constants.ts`, `policy-decision-port.ts`): `ResourceAttributes.
-- zugriffszweck = { zweckCode, zaehlerId, vonTs, bisTs }`,
-- `BREAK_GLASS_ZWECK_WHITELIST=['stoerungsdiagnose']` (provisorisch,
-- `MAX_FENSTER_TAGE=7`, ebenfalls provisorisch bis security-lead/compliance-
-- director-Bestaetigung, s. Kommentar dort). Decision-Reasons
-- (`PolicyDenyReason`/`PolicyPermitReason`): `break_glass_erforderlich` |
-- `zweck_fehlt` | `break_glass_grenzen_verletzt` | `break_glass_permit` --
-- WICHTIG: diese vier Werte werden NICHT als eigener `grund`-Kontext-Key
-- gefuehrt (anders als bei `authz.zugriff.verweigert`, s. V0004) -- die ADR
-- benennt explizit NUR die drei o.g. Keys. Diese Migration haelt sich
-- STRIKT an die ADR-Vorgabe (GROUNDED, nicht spekulativ) -- s. "Offener
-- Punkt" unten zu dieser bewussten Luecke.
--
-- =====================================================================
-- BEFUND: objekt_ref bei MESSKONZEPT_VERSION_ANGELEGT (dokumentierte
-- Design-Eigenheit, KEIN Bug -- bitte im Review bestaetigen)
-- =====================================================================
--
-- `messkonzept.controller.ts` liefert `objektRefExtractor: ({ request }) =>
-- request.params['endkundeId']` -- `objekt_ref` traegt bei diesem Code also
-- die ENDKUNDE-UUID, NICHT eine eigene Messkonzept-Identitaet (Messkonzept-
-- Versionen haben laut Datenmodell KEINE eigene UUID -- natuerlicher
-- Schluessel ist `(endkundeId, versionNr)`, `versionNr` ist ein `int`,
-- separat via `kontext.version_nr` erfasst).
--
-- Diese Migration setzt `objekt_typ='messkonzept'` (fachliche Praezision,
-- passend zum Code-Segment `messkonzept.version.*` und der vom
-- Arbeitsauftrag vorgegebenen Objekt-Typ-Liste). KONSEQUENZ (bewusst in
-- Kauf genommen, zur Aufmerksamkeit von access-control-engineer/
-- compliance-director): `audit.ix_event_objekt` ist auf
-- `(objekt_typ, objekt_ref, ts)` indiziert -- eine Abfrage "vollstaendige
-- Audit-Historie von Endkunde X" (`objekt_typ='endkunde' AND objekt_ref=X`)
-- findet `messkonzept.version.angelegt`-Zeilen NICHT automatisch mit,
-- obwohl `objekt_ref` bei diesen Zeilen dieselbe Endkunde-UUID traegt. Ein
-- Consumer, der eine vollstaendige Endkunden-Historie inkl. Messkonzept-
-- Versionen braucht, muss BEIDE `objekt_typ`-Werte separat abfragen
-- (UNION) -- Alternative waere `objekt_typ='endkunde'` fuer diesen Code
-- gewesen (dann automatisch Teil der Endkunden-Historie, aber semantisch
-- weniger praezise, "Objekt der Handlung" waere dann nicht mehr das
-- Messkonzept). Diese Migration entscheidet sich fuer die fachlich
-- praezisere Variante (`messkonzept`) und dokumentiert den Abfrage-
-- Kompromiss explizit, statt ihn stillschweigend zu treffen. **Offener
-- Punkt fuer Freigabe:** falls der User/compliance-director die
-- Endkunden-History-Vollstaendigkeit hoeher gewichtet, ist `objekt_typ=
-- 'endkunde'` die einzeilige Alternative (nur diese eine Zeile betroffen).
--
-- =====================================================================
-- ENTSCHEIDUNG: `pflichtereignis` -- durchgaengig false (Praezedenzfall-
-- Uebernahme aus V0003/V0004, EIN dokumentierter Zweifelsfall)
-- =====================================================================
--
-- `pflichtereignis` referenziert laut Mermaid-Skizze (schemas/database/
-- adr-0003-audit-log.md Z.94) "M5" -- ADR-0003s EIGENES M5
-- ("Nachweisbare Decorator-Abdeckung", Lint-/Testmechanismus gegen fehlende
-- `@AuditAction`-Decorators). In der bisherigen, ausschliesslich verfuegbaren
-- Praxis (V0003: die fuenf audit-schema-EIGENEN STRIDE-Ereignisse = true;
-- V0004: alle vier AuthN-Codes UND sogar der als "unmittelbar
-- ermittlungsrelevant" eingestufte `authz.zugriff.verweigert`-Fallback =
-- false) ist `pflichtereignis=true` bislang AUSSCHLIESSLICH fuer Ereignisse
-- reserviert, die das Audit-Subsystem fuer seine EIGENE STRIDE-Selbstpruefung
-- braucht -- NICHT fuer "diese Aktion ist fachlich/regulatorisch wichtig".
-- Diese Migration UEBERNIMMT diese Konvention und setzt `pflichtereignis=
-- false` fuer ALLE 17 Stammdaten-Codes (auch `stammdaten.verbrauch_detail.
-- einsicht`).
--
-- ZWEIFELSFALL, EXPLIZIT AN compliance-director/audit-trail-engineer
-- WEITERGEGEBEN: ADR-0008 §16 fordert fuer `stammdaten.verbrauch_detail.
-- einsicht` woertlich ein "Echtzeit-Alert an DSB/Security bei jedem `permit`"
-- und "periodischer Audit-Review als Pflichtprozess" -- eine Formulierung,
-- die INHALTLICH stark nach "Pflichtereignis" klingt, auch wenn sie nicht
-- deckungsgleich mit der bisherigen schmalen Katalog-Verwendung ist. Diese
-- Migration entscheidet sich GEGEN eine Praezedenz-abweichende Ad-hoc-
-- Ausweitung von `pflichtereignis=true` auf einen einzelnen Fach-Code (das
-- waere eine stille Neudefinition der Spalten-Semantik durch eine einzelne
-- Zeile) und haelt stattdessen fest: falls `pflichtereignis` kuenftig auch
-- "regulatorisch/fachlich zwingende Ereignisse" abdecken soll, ist das eine
-- SEMANTIK-Klaerung fuer ADR-0003 (alle bisherigen neun Zeilen betreffend),
-- keine Einzelfall-Entscheidung dieser Migration. Empfehlung: gesonderter
-- Klaerungs-Auftrag an audit-trail-engineer/compliance-director VOR Merge.
--
-- =====================================================================
-- ENTSCHEIDUNG: `rolle_erfassen` -- default false, ZWEI begruendete
-- Ausnahmen (analog V0004s einziger Ausnahme `authz.zugriff.verweigert`)
-- =====================================================================
--
-- (1) `endkunde.stammdaten.geschreddert` (Krypto-Shredding, Art. 17,
--     IRREVERSIBEL): `rolle_erfassen=true`. Begruendung, GROUNDED in
--     ADR-0008 (nicht spekulativ): §21 "Finding B" (access-control-engineer)
--     haelt fest, `shred:*` brauche "erhoehte Kontrolle" -- "das irreversible
--     Krypto-Shredding laeuft NICHT allein ueber `@Roles('betrieb')`, sondern
--     bekommt eine eigene, strengere ABAC-Regel (Vier-Augen-/
--     Freigabe-Prinzip)" -- als Phase-3/4-Folgepunkt (§30 OP-Liste C) NOCH
--     NICHT umgesetzt (Ist-Stand: `endkunde.controller.ts::kryptoShredding`
--     traegt aktuell NUR `@Roles('betrieb')` + `@Fachaktion('shred:endkunde')`,
--     KEINE zusaetzliche ABAC-Vier-Augen-Pruefung). Solange diese Haertung
--     aussteht, ist die zum Ausfuehrungszeitpunkt geltende Rolle die EINZIGE
--     nachtraeglich rekonstruierbare Kontrollspur fuer eine irreversible
--     Operation -- unmittelbar ermittlungsrelevant (Datensparsamkeit Art.
--     5(1)(c) DSGVO tritt hier hinter Rechenschaftspflicht Art. 5(2)/Art. 32
--     fuer einen seltenen, hochfolgenreichen Vorgang zurueck, exakt die
--     gleiche Abwaegung wie V0004 fuer `authz.zugriff.verweigert`).
-- (2) `stammdaten.verbrauch_detail.einsicht`: `rolle_erfassen=true` --
--     WOERTLICH aus ADR-0008 §16 uebernommen (s. Zitat oben), nicht
--     eigenstaendig hergeleitet.
-- ALLE UEBRIGEN 15 Codes: `rolle_erfassen=false` (Datensparsamkeit,
-- Normalfall reversibler CRUD-Operationen auf Stammdaten -- analog den vier
-- reinen AuthN-Codes in V0004).
--
-- =====================================================================
-- ENTSCHEIDUNG: Bootstrap-Ausnahme (`audit.katalog.geaendert`) -- GILT
-- FORT, aber NEU HERGELEITET, nicht automatisch uebernommen
-- =====================================================================
--
-- V0004s Migrations-Kopf haelt ausdruecklich fest: "diese Bootstrap-Ausnahme
-- gilt EINMALIG fuer V0003 und diese Migration (V0004); danach nicht mehr
-- automatisch" -- d. h. eine kuenftige `/add-audit-event`-Migration darf sich
-- NICHT blind auf denselben Freibrief berufen, sondern muss den
-- Live-Zustand des Systems zum ZEITPUNKT DIESER Migration EIGENSTAENDIG
-- pruefen.
--
-- PRUEFUNG (diese Migration, unabhaengig von V0004 hergeleitet):
--   1. `docs/adr/ADR-0008-stammdaten-betriebs-ui.md` §0 ("Gate-
--      Klarstellung"): "Das ADR-0004-Ingest-Gate (§6/§7.1) ist WEITER ZU:
--      kein produktiver PII-/Verbrauchsdaten-Ingest ... Fazit: v1 =
--      synthetic-only, gebaut & getestet, aber nicht produktiv real-PII
--      geschaltet." -- WOERTLICHER Beleg, dass das Gesamtsystem zum
--      Zeitpunkt dieser Migration weiterhin PRE-GO-LIVE ist.
--   2. Jede der 17 hier geseedeten Stammdaten-Mutationen laeuft
--      ausschliesslich hinter `EDMS_SYNTHETIC_ONLY`-Gate (fuer die fuenf
--      PII-Routen explizit via `SyntheticOnlyInterceptor`, fail-closed bei
--      `EDMS_SYNTHETIC_ONLY=false`) -- es gibt also strukturell (noch) KEINE
--      Moeglichkeit, dass ein `audit.event` dieser Codes reale
--      Personendaten/reale Betriebsvorgaenge traegt.
--   3. Der REIN MECHANISCHE Grund aus V0003/V0004 gilt unveraendert: ein
--      SQL-Migrationsskript kann keinen validierten `actor_*`-Principal
--      herstellen (rote Linie 1) -- eine `audit.append_event('audit.katalog.
--      geaendert', ...)`-Zeile DURCH diese Migration selbst waere immer ein
--      Systemartefakt mit erfundenem Akteur, unabhaengig vom Go-Live-Status.
--
-- ENTSCHEIDUNG: Diese Migration emittiert -- wie V0003/V0004 -- KEINE Zeile
-- in `audit.event` fuer sich selbst. Das ist AUSDRUECKLICH KEINE
-- automatische Fortschreibung der V0004-Formulierung, sondern eine fuer
-- V0006 NEU getroffene Feststellung, die (zufaellig) zum gleichen Ergebnis
-- kommt, weil die Vorbedingung (Punkt 1/2 oben) WEITERHIN erfuellt ist.
-- VERBINDLICHER HINWEIS FUER V0007+: diese Pruefung ist bei JEDER
-- kuenftigen `/add-audit-event`-Migration ERNEUT vorzunehmen -- sobald das
-- ADR-0004-Gate geoeffnet wird (reale PII/Verbrauchsdaten), MUSS die dann
-- naechste Katalog-Erweiterung von einer echten, durch einen Menschen/
-- Prozess (NICHT die Migration) ausgefuehrten `audit.append_event('audit.
-- katalog.geaendert', ...)`-Zeile begleitet werden.
--
-- =====================================================================
-- Abgleich gegen `seed-stammdaten-audit-catalog.ts` (TEST-ONLY, gefunden)
-- =====================================================================
--
-- `src/backend/src/stammdaten/test-support/seed-stammdaten-audit-catalog.ts`
-- EXISTIERT (im Auftrag als "im security-lead-Review erwaehnt, im audit-
-- Ordner nicht sichtbar" angekuendigt -- liegt tatsaechlich unter
-- `stammdaten/test-support/`, nicht `stammdaten/audit/`). Sie seedet ALLE
-- 17 Codes aus `STAMMDATEN_EVENT_CODES` in eine Testcontainer-DB, aber MIT
-- EINEM GROBEN, FUER JEDEN CODE IDENTISCHEN Katalog-Eintrag:
--   `objekt_typ='stammdaten_test_objekt'`, `aktion_kategorie='aendern'`,
--   `erlaubte_kontext_keys=ARRAY['synthetic','version_nr']` (Vereinigung der
--   beiden tatsaechlich vorkommenden Kontext-Keys, grob ueber alle Codes
--   hinweg), `rolle_erfassen=false`, `pflichtereignis=false`.
-- Das ist BEWUSST grob (Kommentar dort: "TEST-ONLY ... kleine, feste
-- Codeliste") und reicht aus, um die FK-/Whitelist-Pruefung des Seal-
-- Triggers in Tests nicht scheitern zu lassen -- es ist KEIN Abbild des
-- echten Katalogs und wird von dieser Migration NICHT uebernommen
-- (abweichende, praezisere `objekt_typ`/`aktion_kategorie`/Kontext-Keys je
-- Code, s. oben). KEIN Widerspruch, aber FOLGEEMPFEHLUNG (nicht Teil dieser
-- Migration, kein `src/`-Schreibzugriff hier): sobald diese Migration
-- gemergt ist, sollte `test-engineer`/`audit-trail-engineer` pruefen, ob
-- `seedStammdatenAuditCatalog()` durch echte, aus dieser Migration
-- abgeleitete Zeilen ersetzt werden sollte (Drift-Schutz: verhindert, dass
-- Tests gegen einen anderen Katalog laufen als Prod).
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- Header (dieser Kommentar) -> event_typ-Header-Zeilen (17x) ->
-- event_typ_version-Zeilen (17x, je Code kommentiert, Reihenfolge = Definitionsreihenfolge
-- in STAMMDATEN_EVENT_CODES: Endkunde -> System -> Zaehler -> Messkanal ->
-- Messkonzept -> Anschlussnutzer -> Nutzungsverhaeltnis -> Verbrauch-Detail).

-- =====================================================================
-- Seed: 17 Stammdaten-Fach-Event-Codes (ADR-0008 §17/§16/§22). Governance-/
-- Konfigurationsdaten, KEIN Ingest, KEINE personenbezogenen Daten (reine
-- Vokabular-/Whitelist-Metadaten, analog V0003/V0004).
-- =====================================================================

INSERT INTO audit.event_typ (code) VALUES
    ('endkunde.stammdaten.angelegt'),
    ('endkunde.stammdaten.geaendert'),
    ('endkunde.stammdaten.gesperrt'),
    ('endkunde.stammdaten.geschreddert'),
    ('system.stammdaten.angelegt'),
    ('system.stammdaten.geaendert'),
    ('zaehler.stammdaten.angelegt'),
    ('zaehler.stammdaten.geaendert'),
    ('zaehler.stammdaten.stillgelegt'),
    ('messkanal.stammdaten.angelegt'),
    ('messkanal.stammdaten.geaendert'),
    ('messkanal.stammdaten.stillgelegt'),
    ('messkonzept.version.angelegt'),
    ('anschlussnutzer.stammdaten.angelegt'),
    ('nutzungsverhaeltnis.angelegt'),
    ('nutzungsverhaeltnis.beendet'),
    ('stammdaten.verbrauch_detail.einsicht');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    -- (1) Endkunde anlegen. PII-Schreibroute (identity.endkunde_pii +
    -- energy.endkunde, ADR-0008 §20 D8-Domaenen-Contract) hinter
    -- SyntheticOnlyInterceptor. objekt_ref=result.id (Endkunde-UUID).
    -- kontext.synthetic PFLICHT (ADR-0008 §22/D10, security-lead-Votum 12).
    -- actor_typ=benutzer (validierter SecurityContext.sub, JwtAuthGuard vor
    -- PolicyInterceptor/AuditActionInterceptor). ergebnis=ok bei Erfolg,
    -- denied bei PDP-Ablehnung (@Roles('betrieb') + Fachaktion
    -- 'create:endkunde'), error sonst -- derselbe Code traegt alle drei
    -- (Konvention aus V0004, keine Katalog-Aenderung noetig).
    (gen_random_uuid(), 'endkunde.stammdaten.angelegt', 'endkunde', 'anlegen',
     ARRAY['synthetic'], false, false, true,
     'Endkunde-Stammdatensatz angelegt (EndkundeController.anlegen, PII-Schreibpfad hinter SyntheticOnlyInterceptor, ADR-0008 §22). objekt_ref=Endkunde-UUID, kontext.synthetic Pflicht-Tag.',
     now()),

    -- (2) Endkunde aendern. Wie (1), analoge Begruendung.
    (gen_random_uuid(), 'endkunde.stammdaten.geaendert', 'endkunde', 'aendern',
     ARRAY['synthetic'], false, false, true,
     'Endkunde-Stammdatensatz geaendert (EndkundeController.aendern, PII-Schreibpfad hinter SyntheticOnlyInterceptor, ADR-0008 §22). objekt_ref=Endkunde-UUID, kontext.synthetic Pflicht-Tag.',
     now()),

    -- (3) Endkunde sperren. "Loeschen" = Sperre (Art. 18 DSGVO, kein
    -- Hard-Delete, ADR-0008 §11 Design-Prinzip 3/§20). rolle_erfassen=false:
    -- reversible Verarbeitungseinschraenkung, nicht mit dem irreversiblen
    -- Schreddern (4) gleichzusetzen.
    (gen_random_uuid(), 'endkunde.stammdaten.gesperrt', 'endkunde', 'sperren',
     ARRAY['synthetic'], false, false, true,
     'Endkunde gesperrt = Verarbeitungseinschraenkung Art. 18 DSGVO, KEIN Hard-Delete (EndkundeController.sperren, ADR-0008 §11/§20). objekt_ref=Endkunde-UUID, kontext.synthetic Pflicht-Tag.',
     now()),

    -- (4) Endkunde kryptoschreddern. Art. 17 DSGVO, IRREVERSIBEL
    -- (KryptoShreddingService.shred -> wrapped_dek vernichtet, kein Unwrap
    -- mehr moeglich). rolle_erfassen=true (einzige Abweichung neben (17),
    -- s. Migrations-Kopf "ENTSCHEIDUNG rolle_erfassen"): ADR-0008 §21
    -- Finding B (access-control-engineer) verlangt fuer shred:* eigentlich
    -- eine strengere Vier-Augen-ABAC-Regel, die noch NICHT umgesetzt ist
    -- (Ist-Stand: nur @Roles('betrieb')) -- die zum Ausfuehrungszeitpunkt
    -- geltende Rolle ist bis dahin die einzige nachtraeglich
    -- rekonstruierbare Kontrollspur fuer diese hochfolgenreiche Operation.
    (gen_random_uuid(), 'endkunde.stammdaten.geschreddert', 'endkunde', 'schreddern',
     ARRAY['synthetic'], true, false, true,
     'Endkunde krypto-geschreddert = Art. 17 DSGVO, IRREVERSIBEL (EndkundeController.kryptoShredding -> KryptoShreddingService.shred, ADR-0008 §19/§20). objekt_ref=Endkunde-UUID, kontext.synthetic Pflicht-Tag. rolle_erfassen=true: Vier-Augen-ABAC-Haertung (ADR-0008 §21 Finding B) noch offen, Rolle zum Ausfuehrungszeitpunkt ist bis dahin einzige Kompensationsspur.',
     now()),

    -- (5) System anlegen. energy.system (ADR-0004 §13.2), NICHT PII, kein
    -- SyntheticOnlyInterceptor/kontextExtractors im Controller -> kein
    -- Kontext-Key.
    (gen_random_uuid(), 'system.stammdaten.angelegt', 'system', 'anlegen',
     '{}', false, false, true,
     'System/Messstelle angelegt (SystemController.anlegen). Nicht-PII (energy.system, ADR-0004 §13.2). objekt_ref=System-UUID, kein Kontext.',
     now()),

    -- (6) System aendern.
    (gen_random_uuid(), 'system.stammdaten.geaendert', 'system', 'aendern',
     '{}', false, false, true,
     'System/Messstelle geaendert (SystemController.aendern). Nicht-PII. objekt_ref=System-UUID, kein Kontext.',
     now()),

    -- (7) Zaehler anlegen. energy.zaehler, nicht PII.
    (gen_random_uuid(), 'zaehler.stammdaten.angelegt', 'zaehler', 'anlegen',
     '{}', false, false, true,
     'Zaehler angelegt (ZaehlerController.anlegen). Nicht-PII (energy.zaehler). objekt_ref=Zaehler-UUID, kein Kontext.',
     now()),

    -- (8) Zaehler aendern.
    (gen_random_uuid(), 'zaehler.stammdaten.geaendert', 'zaehler', 'aendern',
     '{}', false, false, true,
     'Zaehler geaendert (ZaehlerController.aendern). objekt_ref=Zaehler-UUID, kein Kontext.',
     now()),

    -- (9) Zaehler stilllegen. status='stillgelegt', kein Hard-Delete;
    -- DELETE-Route ist idempotent (api-contracts.md).
    (gen_random_uuid(), 'zaehler.stammdaten.stillgelegt', 'zaehler', 'stilllegen',
     '{}', false, false, true,
     'Zaehler stillgelegt = status-Wechsel, KEIN Hard-Delete (ZaehlerController.stilllegen, idempotent). objekt_ref=Zaehler-UUID, kein Kontext.',
     now()),

    -- (10) Messkanal anlegen. Sub-Ressource unter Zaehler
    -- (/stammdaten/zaehler/:zaehlerId/messkanaele), objektRefExtractor
    -- liefert HIER (anders als bei (13)) result.id = Messkanal-EIGENE UUID.
    (gen_random_uuid(), 'messkanal.stammdaten.angelegt', 'messkanal', 'anlegen',
     '{}', false, false, true,
     'Messkanal angelegt (MesskanalUnterZaehlerController.anlegen, Sub-Ressource unter Zaehler). objekt_ref=Messkanal-UUID (eigene Entitaets-ID, nicht Zaehler-ID), kein Kontext.',
     now()),

    -- (11) Messkanal aendern.
    (gen_random_uuid(), 'messkanal.stammdaten.geaendert', 'messkanal', 'aendern',
     '{}', false, false, true,
     'Messkanal geaendert (MesskanalController.aendern). objekt_ref=Messkanal-UUID, kein Kontext.',
     now()),

    -- (12) Messkanal stilllegen.
    (gen_random_uuid(), 'messkanal.stammdaten.stillgelegt', 'messkanal', 'stilllegen',
     '{}', false, false, true,
     'Messkanal stillgelegt = status-Wechsel, KEIN Hard-Delete (MesskanalController.stilllegen, idempotent). objekt_ref=Messkanal-UUID, kein Kontext.',
     now()),

    -- (13) Messkonzept-Version anlegen. BEWUSSTE DESIGN-EIGENHEIT (s.
    -- Migrations-Kopf "BEFUND objekt_ref"): objektRefExtractor liefert
    -- request.params['endkundeId'] -- objekt_ref traegt hier die
    -- ENDKUNDE-UUID (Messkonzept-Versionen haben keine eigene UUID,
    -- natuerlicher Schluessel ist (endkundeId, versionNr)). kontext.
    -- version_nr (number, aus result.versionNr) identifiziert die konkrete
    -- Version zusammen mit objekt_ref. `objekt_typ='messkonzept'` gewaehlt
    -- (fachlich praezise), NICHT 'endkunde' -- Konsequenz: Endkunden-
    -- History-Abfragen (objekt_typ='endkunde') finden diese Zeilen NICHT
    -- automatisch mit, s. Migrations-Kopf, offener Punkt fuer Freigabe.
    (gen_random_uuid(), 'messkonzept.version.angelegt', 'messkonzept', 'anlegen',
     ARRAY['version_nr'], false, false, true,
     'Messkonzept-Version angelegt (MesskonzeptController.anlegen). objekt_ref=Endkunde-UUID (Messkonzept-Versionen haben keine eigene UUID, natuerlicher Schluessel=(endkundeId,versionNr)), kontext.version_nr=neue Versionsnummer. Bewusste Design-Eigenheit, s. Migrations-Kopf.',
     now()),

    -- (14) Anschlussnutzer anlegen. PII-Schreibroute (analog Endkunde,
    -- SyntheticOnlyInterceptor + kontext.synthetic Pflicht-Tag).
    (gen_random_uuid(), 'anschlussnutzer.stammdaten.angelegt', 'anschlussnutzer', 'anlegen',
     ARRAY['synthetic'], false, false, true,
     'Anschlussnutzer angelegt (AnschlussnutzerController.anlegen, PII-Schreibpfad hinter SyntheticOnlyInterceptor, ADR-0008 §22). objekt_ref=Anschlussnutzer-UUID, kontext.synthetic Pflicht-Tag.',
     now()),

    -- (15) Nutzungsverhaeltnis anlegen. Verknuepfungsentitaet
    -- (Endkunde/Anschlussnutzer/System, ADR-0008 §12), selbst nicht-PII
    -- (nur Fremdschluessel-Referenzen).
    (gen_random_uuid(), 'nutzungsverhaeltnis.angelegt', 'nutzungsverhaeltnis', 'anlegen',
     '{}', false, false, true,
     'Nutzungsverhaeltnis angelegt (NutzungsverhaeltnisController.anlegen). objekt_ref=Nutzungsverhaeltnis-UUID, kein Kontext.',
     now()),

    -- (16) Nutzungsverhaeltnis beenden. Zustandsende, append-only-Historie
    -- (kein Hard-Delete, analog Messkonzept-Versionen).
    (gen_random_uuid(), 'nutzungsverhaeltnis.beendet', 'nutzungsverhaeltnis', 'beenden',
     '{}', false, false, true,
     'Nutzungsverhaeltnis beendet (NutzungsverhaeltnisController.beenden). objekt_ref=Nutzungsverhaeltnis-UUID, kein Kontext.',
     now()),

    -- (17) Verbrauchs-Detail-Einsicht (break-glass, ADR-0008 §16/D4).
    -- RESERVIERT: KEIN v1-Endpoint, KEIN Decorator, KEIN Emitter im Repo
    -- (Grep-Befund, s. Migrations-Kopf) -- erster realer Konsument =
    -- Verbrauchs-/Lastgang-Endpoint (ADR-0005). Katalog-Eintrag TROTZDEM
    -- angelegt (Auftrag + ADR §16 ausdruecklich). erlaubte_kontext_keys
    -- WOERTLICH aus ADR-0008 §16 uebernommen (grund NICHT enthalten -- s.
    -- Migrations-Kopf "GROUNDING"-Abschnitt, bewusste ADR-Vorgabe, keine
    -- eigene Ergaenzung). rolle_erfassen=true: WOERTLICH aus ADR-0008 §16.
    -- pflichtereignis=false: Praezedenzfall-Uebernahme, s. Migrations-Kopf
    -- Zweifelsfall-Abschnitt -- compliance-director-Bestaetigung offen.
    (gen_random_uuid(), 'stammdaten.verbrauch_detail.einsicht', 'verbrauch_detail', 'einsehen',
     ARRAY['zweck_code','zaehler_ref','fenster_tage'], true, false, true,
     'Break-glass-Einsicht in Detailverbrauch (ADR-0008 §16/D4, DS-07). RESERVIERT: kein v1-Endpoint/Emitter (erster Konsument = ADR-0005). Sowohl permit ALS AUCH deny werden ueber diesen Code auditiert (ergebnis=ok bei break_glass_permit, sonst denied). kontext.zweck_code=whitelisted Begruendungscode (z. B. stoerungsdiagnose), kontext.zaehler_ref=Zaehler-Pseudonym-Referenz, kontext.fenster_tage=angefragtes Zeitfenster in Tagen (<= MAX_FENSTER_TAGE). rolle_erfassen=true (ADR-0008 §16, woertlich).',
     now());
