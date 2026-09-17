-- V0016__korrektur_geraet_zuordnung_katalog_beschreibung.sql
--
--
-- Anlass: Phase-5-DSGVO-Review, Finding DS-1 (Rechenschaft, Art. 5 Abs. 2
-- DSGVO). Vom User zur Umsetzung freigegeben, Arbeitsauftrag an database-lead
-- (dieser Migrationsentwurf).
--
-- =====================================================================
-- BEFUND (DS-1) -- was genau ist veraltet, und WO (nicht nur im
-- Migrations-Kommentar, sondern in den GESPEICHERTEN Katalog-Daten selbst)
-- =====================================================================
--
-- `migrations/V0015__seed_geraet_zuordnung_events.sql` (Commit 1d1a7c2,
-- 2026-07-17) seedet die vier `geraet_zuordnung.*`-Codes und behauptet dabei
-- an MEHREREN Stellen, alle vier seien "RESERVIERT" (kein Emitter im Repo,
-- Grep-Befund 2026-07-16):
--   - Datei-Kopf Zeile 54: "ALLE RESERVIERT (kein Emitter im Repo, ...)".
--   - Zeile 237/243/251/259 (Code-Kommentare je Ereignis).
--   - **Zeile 240/246/254/262: die Aussage steht WOERTLICH in der
--     `beschreibung`-SPALTE der vier `audit.event_typ_version`-Zeilen selbst**
--     -- das ist KEIN Migrations-Datei-Kommentar, sondern gespeicherte,
--     ueber SQL abfragbare Katalog-Metadatendaten (z. B. fuer Audit-Reports,
--     `/audit-report`, ein kuenftiges Art.-30-Tooling). Diese Zeile ist der
--     eigentliche Kern von DS-1: nicht nur ein Kommentar ist veraltet,
--     sondern eine im System gespeicherte, abfragbare Tatsachenbehauptung
--     ist falsch.
--   - Zeilen 192-217 ("BOOTSTRAP-AUSNAHME"): Bedingung (2) der dortigen
--     Pruefung ("KEINER der vier ... Codes hat einen Emitter im Repo --
--     strukturell (noch) keine Moeglichkeit, dass ein `audit.event` dieser
--     Codes reale Geraete-/Personendaten traegt") ist ebenfalls durch die
--     Phase-4-Implementierung ueberholt. Das ENDERGEBNIS von V0015 (keine
--     `audit.katalog.geaendert`-Selbst-Emission durch die Migration) bleibt
--     dennoch weiterhin richtig -- s. Abschnitt "ENTSCHEIDUNG (b)" unten:
--     Bedingung (1) (ADR-0005 v1 bleibt synthetic-only, ADR-0004-Gate ZU,
--     ADR-0005-Kopf Zeile 3/§0 -- unveraendert gegengeprueft) UND Bedingung
--     (3) (rote Linie 1: ein SQL-Skript kann keinen validierten
--     `actor_*`-Principal herstellen) tragen die Entscheidung UNABHAENGIG
--     von Bedingung (2) weiterhin.
--
-- TATSAECHLICHER STAND (verifiziert, dieser Migrationsentwurf, 2026-07-21):
-- alle vier Codes sind seit Commit e392dcf (2026-07-17, NACH 1d1a7c2/V0015
-- desselben Tages) vollstaendig verdrahtet:
--   (1) `geraet_zuordnung.stammdaten.provisioniert` -- `@AuditAction` auf
--       `GeraetZuordnungUnterZaehlerController`
--       (src/backend/src/stammdaten/geraet-zuordnung/
--       geraet-zuordnung-unter-zaehler.controller.ts, Zeile 26 Klasse,
--       Zeile 32-33 `eventTyp: STAMMDATEN_EVENT_CODES.
--       GERAET_ZUORDNUNG_PROVISIONIERT`).
--   (2) `geraet_zuordnung.stammdaten.aktualisiert` -- `@AuditAction` auf
--       `DeviceGeraetZuordnungController.aendern()`
--       (src/backend/src/stammdaten/geraet-zuordnung/
--       device-geraet-zuordnung.controller.ts, Zeile 32 Klasse, Zeile 38-58
--       Methode, Zeile 41-42 `eventTyp`).
--   (3) `geraet_zuordnung.stammdaten.geschreddert` -- MANUELLER
--       `AuditService.append(...)`-Aufruf (KEIN Decorator, da kein eigener
--       HTTP-Endpoint) in `DeviceKryptoShreddingService.shred()`
--       (src/backend/src/stammdaten/crypto/device-krypto-shredding.
--       service.ts, Zeile 61 Klasse, Zeile 68 Methode, Zeile 83-90 der
--       `auditService.append(...)`-Aufruf) -- begleitender Schritt
--       INNERHALB `EndkundeService.shred()`/`ShredAntragService.
--       freigebenInTx()` (ADR-0005 §26.5, ADR-0009).
--   (4) `geraet_zuordnung.stammdaten.reverse_aufgeloest` -- `@AuditAction`
--       auf `DeviceGeraetZuordnungController.reverseAufloesen()` (dieselbe
--       Datei wie (2), Zeile 75-100, Zeile 78-79 `eventTyp`), Fachlogik in
--       `DeviceReverseAufloesungService.reverseAufloesen()`
--       (device-reverse-aufloesung.service.ts).
-- Zusaetzlicher, unabhaengiger Beleg: `src/backend/src/stammdaten/audit/
-- stammdaten-audit-events.ts` (Zeile 59-77) dokumentiert im
-- Quellcode-Kommentar selbst bereits woertlich: "ALLE VIER Codes sind
-- vollstaendig verdrahtet (kein RESERVIERT-Zustand mehr)" -- das Backend
-- WEISS also bereits um die Ueberholung; nur der DB-Katalog (V0015-Zeilen)
-- wurde nie nachgezogen.
--
-- V0015 SELBST BLEIBT UNVERAENDERT (append-only, .claude/rules/
-- database-migrations.md: "Korrektur = neue Migration"). Die Korrektur
-- geschieht AUSSCHLIESSLICH hier, ueber den fuer genau diesen Zweck
-- vorgesehenen Mechanismus: `audit.event_typ_version` ist explizit SCD2/
-- append-only-versioniert ("Aenderung = neue Zeile; Vorgaenger bekommt
-- gueltig_bis", V0003-Kopf Zeile 244-247) und steht NICHT unter `REVOKE
-- UPDATE, DELETE` (V0003-Kopf, dokumentierte Abweichung (f) -- governte
-- Konfiguration, aenderbar ueber `/add-audit-event`-Migrationen). Ein rohes
-- `UPDATE ... SET beschreibung = ...` waere zwar TECHNISCH ebenfalls
-- moeglich (kein REVOKE davor), widerspraeche aber dem Tabellendesign: die
-- Tabelle hat bewusst KEIN `updated_at` (V0003-Kopf, Abweichung (d): "append-
-- only/immutable bzw. governte Versions-Historie") -- ein In-Place-`UPDATE`
-- der `beschreibung`-Spalte wuerde die Historie ("was stand hier wann")
-- unwiderruflich ueberschreiben, OHNE dass irgendein Zeitstempel diese
-- Aenderung festhaelt. Die SCD2-Fortschreibung (alte Version schliessen,
-- neue mit `gueltig_ab = now()` eroeffnen) ist der einzige Mechanismus, der
-- die Korrektur selbst nachvollziehbar/datiert macht -- exaktes Vorbild:
-- `migrations/V0009__seed_shred_workflow_events.sql` Teil (A) (dort:
-- Korrektur einer falschen ADR-Paragraph-Referenz in der `beschreibung` von
-- `endkunde.stammdaten.geschreddert`, per SCD2-Neuversion, OHNE die
-- V0006-Zeile selbst zu editieren).
--
-- Technisch/fachlich UNVERAENDERT gegenueber V0015 (NUR `beschreibung`
-- korrigiert): `objekt_typ`, `aktion_kategorie`, `erlaubte_kontext_keys`
-- (weiterhin RL-2-konform, KEIN `deveui`/`deveui_blind_index`),
-- `rolle_erfassen`, `pflichtereignis`, `aktiv`. Diese Migration ist
-- ausdruecklich KEIN fachlicher Neuentwurf der vier Ereignistypen.
--
-- =====================================================================
-- ENTSCHEIDUNG (a): Migration korrigiert NUR die Katalog-`beschreibung`
-- (SCD2) -- das ist echte, legitime Migrations-Arbeit (governte
-- Konfigurationsdaten, kein Beweismittel)
-- =====================================================================
--
-- Ist eine Migration ueberhaupt das richtige Vehikel? JA, fuer GENAU DIESEN
-- Teil: `audit.event_typ_version` ist -- anders als `audit.event` -- keine
-- Beweismittel-Tabelle, sondern governte Konfiguration (V0003-Kopf,
-- "REVOKE-Geltungsbereich"-Abschnitt). Die Korrektur einer falschen
-- Tatsachenbehauptung IN dieser Konfiguration ist exakt die Art von
-- Aenderung, fuer die `/add-audit-event`-Migrationen und die
-- SCD2-Versionierung gebaut wurden -- keine Scheinloesung, sondern der
-- vorgesehene Pfad.
--
-- =====================================================================
-- ENTSCHEIDUNG (b): KEINE `audit.append_event('audit.katalog.geaendert',
-- ...)`-Selbst-Emission durch diese Migration -- Runbook-Schritt stattdessen
-- (s. finale Antwort database-lead)
-- =====================================================================
--
-- `audit.katalog.geaendert` ist laut V0003-Seed (Zeile 292-295) genau fuer
-- diesen Fall vorgesehen ("macht einen stillen Whitelist-Umbau
-- nachweisbar") und `pflichtereignis=true`. TROTZDEM emittiert diese
-- Migration -- wie V0003/V0004/V0006/V0007/V0009/V0015 vor ihr -- KEINE
-- eigene Zeile in `audit.event`. Neu (fuer V0016) hergeleitet, nicht
-- automatisch von V0015 uebernommen:
--   1. ADR-0005 traegt weiterhin den Status "accepted (v1 synthetic-only)"
--      (ADR-Kopf Zeile 3, §0 Zeile 50: "Das ADR-0004-Ingest-Gate ... ist
--      weiter ZU" -- gegengeprueft 2026-07-21, unveraendert).
--   2. ANDERS als bei V0015: die vier Codes haben JETZT einen Emitter im
--      Repo (s. oben) -- Bedingung (2) der urspruenglichen
--      Bootstrap-Ausnahme ist also NICHT mehr gegeben. Das aendert am
--      Ergebnis dieser Migration NICHTS, weil Bedingung (3) unveraendert
--      und UNABHAENGIG von Emitter-Existenz UND Go-Live-Status gilt:
--   3. Der REIN MECHANISCHE Grund aus V0003/V0004/V0006/V0007/V0009/V0015
--      bleibt bestehen: ein SQL-Migrationsskript kann keinen validierten
--      `actor_*`-Principal herstellen (rote Linie 1). Eine
--      `audit.append_event(...)`-Zeile DURCH diese Migration waere IMMER
--      ein Systemartefakt mit erfundenem Akteur -- unabhaengig davon, ob
--      ein Emitter existiert oder ob das System live ist. Genau DAS waere
--      die Scheinloesung, vor der der Arbeitsauftrag ausdruecklich warnt:
--      ein Audit-Event soll eine tatsaechliche, von einem Menschen/Prozess
--      ausgefuehrte Handlung belegen, keine automatisch von einer Migration
--      geschriebene Zeile mit einem Platzhalter-`actor_sub`.
-- ENTSCHEIDUNG: keine `audit.katalog.geaendert`-Selbst-Emission durch diese
-- Migration. Stattdessen: Runbook-Schritt (Betriebsprozess, ausserhalb
-- dieser Migration, s. finale Antwort) -- EIN Mensch mit einer ECHTEN,
-- authentifizierten Identitaet (`actor_sub`) fuehrt NACH Anwendung dieser
-- Migration VIER `SELECT audit.append_event('audit.katalog.geaendert', ...)`
-- -Aufrufe aus (einer je korrigiertem Code, `kontext.version_id` = die von
-- dieser Migration neu erzeugte `event_typ_version.id`). VERBINDLICHER
-- HINWEIS FUER V0017+ (Fortschreibung der Kette V0004/V0006/V0007/V0009/
-- V0015): diese Pruefung bei JEDER kuenftigen Katalog-Migration ERNEUT
-- vornehmen -- Bedingung (3)/rote Linie 1 gilt bei JEDER Konstellation, auch
-- nach Oeffnung des ADR-0004-Gates; eine Migration darf NIEMALS
-- `audit.append_event(...)` selbst aufrufen, unabhaengig vom
-- Go-Live-Status.
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- Vier Bloecke (Reihenfolge = V0015-Reihenfolge: Provisioning-Create ->
-- Provisioning-Update -> Shred-Kopplung -> Reverse-Read), je Block: EIN
-- `UPDATE` (aktuelle Version schliessen, `gueltig_bis = now()`) + EIN
-- `INSERT` (neue Version, `gueltig_ab = now()`, korrigierte
-- `beschreibung`, sonst unveraendert). `now()` ist innerhalb DIESER
-- Transaktion (eine Migrationsdatei = eine Transaktion, Standard-Verhalten
-- des Migrations-Runners, s. V0009-Kopf "LAST-BEARING ANNAHME") stabil --
-- UPDATE und nachfolgendes INSERT erhalten denselben Wert, wodurch
-- `alte_version.gueltig_bis = neue_version.gueltig_ab` (bitwertgleich) gilt.
-- Die zugehoerige Down-Datei nutzt genau diese Gleichheit, um die vier neuen
-- Versionen deterministisch von ihren Vorgaengern zu unterscheiden.

-- =====================================================================
-- (1) geraet_zuordnung.stammdaten.provisioniert
-- =====================================================================

UPDATE audit.event_typ_version
   SET gueltig_bis = now()
 WHERE code = 'geraet_zuordnung.stammdaten.provisioniert'
   AND gueltig_bis IS NULL;

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'geraet_zuordnung.stammdaten.provisioniert', 'geraet_zuordnung', 'provisionieren',
     ARRAY['synthetic','zaehler_id','pepper_version'], false, false, true,
     'Geraete-Zuordnung provisioniert = DevEUI<->Zaehler-Erstanlage, O4-Kernkorrelation (PolicyAction create:geraet_zuordnung, Akteur betrieb, ADR-0005 §26.4). AKTIV SEIT Commit e392dcf (2026-07-17): Emitter ist GeraetZuordnungUnterZaehlerController (@AuditAction, src/backend/src/stammdaten/geraet-zuordnung/geraet-zuordnung-unter-zaehler.controller.ts). Katalog-Korrektur V0016 (database-lead, DSGVO-Phase-5-Finding DS-1, 2026-07-21): V0015 (Commit 1d1a7c2, ebenfalls 2026-07-17, aber VOR e392dcf desselben Tages) beschrieb diesen Code faelschlich als "RESERVIERT: kein v1-Endpoint/Emitter im Repo" -- zum V0015-Commit-Zeitpunkt zutreffend (Grep-Befund 2026-07-16), aber binnen desselben Tages durch e392dcf ueberholt und nie nachgezogen. V0015 selbst bleibt unveraendert (append-only); die Korrektur erfolgt ausschliesslich hier, als neue SCD2-Version. Uebrige Angaben UNVERAENDERT: objekt_ref=device.geraet_zuordnung.id (eigene Entitaets-UUID, analog messkanal.stammdaten.angelegt V0006), NICHT zaehler_id. kontext.synthetic Pflicht-Tag (ADR-0005 §19 Punkt 3/§26.6), kontext.zaehler_id=Pseudonym-Referenz auf energy.zaehler.id (LOGISCHER Verweis, kein FK), kontext.pepper_version=Pepper-Rotations-Version zum Provisionierungszeitpunkt (ADR-0005 §26.3). KEIN DevEUI-Klartext/deveui_blind_index im Kontext (rote Linie RL-2, ADR-0005 §22/§26). rolle_erfassen=false: reversible Stammdaten-Mutation. ADR-0005 v1 bleibt synthetic-only (ADR-0004-Gate weiterhin ZU) -- diese Korrektur aendert NICHTS an Whitelist/Kategorie/Rollen-Erfassung, NUR an der beschreibenden Metadaten-Aussage.',
     now());

-- =====================================================================
-- (2) geraet_zuordnung.stammdaten.aktualisiert
-- =====================================================================

UPDATE audit.event_typ_version
   SET gueltig_bis = now()
 WHERE code = 'geraet_zuordnung.stammdaten.aktualisiert'
   AND gueltig_bis IS NULL;

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'geraet_zuordnung.stammdaten.aktualisiert', 'geraet_zuordnung', 'aktualisieren',
     ARRAY['synthetic','zaehler_id'], false, false, true,
     'Geraete-Zuordnung aktualisiert = z. B. Geraete-Tausch am selben Zaehler (PolicyAction update:geraet_zuordnung, Akteur betrieb, ADR-0005 §26.4). AKTIV SEIT Commit e392dcf (2026-07-17): Emitter ist DeviceGeraetZuordnungController.aendern() (@AuditAction, src/backend/src/stammdaten/geraet-zuordnung/device-geraet-zuordnung.controller.ts). Katalog-Korrektur V0016 (database-lead, DSGVO-Phase-5-Finding DS-1, 2026-07-21): V0015 (Commit 1d1a7c2, ebenfalls 2026-07-17, aber VOR e392dcf desselben Tages) beschrieb diesen Code faelschlich als "RESERVIERT: kein v1-Endpoint/Emitter im Repo" -- zum V0015-Commit-Zeitpunkt zutreffend, aber binnen desselben Tages ueberholt und nie nachgezogen. V0015 selbst bleibt unveraendert; die Korrektur erfolgt ausschliesslich hier, als neue SCD2-Version. Uebrige Angaben UNVERAENDERT: objekt_ref=device.geraet_zuordnung.id, NICHT zaehler_id. kontext.synthetic Pflicht-Tag, kontext.zaehler_id=Pseudonym-Referenz auf energy.zaehler.id. KEIN kontext.pepper_version (bewusst schmalere Whitelist als provisioniert -- Aktualisierung aendert den urspruenglichen Blind-Index-Pepper i. d. R. nicht). KEIN DevEUI-Klartext/deveui_blind_index im Kontext (RL-2). rolle_erfassen=false: reversible Stammdaten-Mutation. ADR-0005 v1 bleibt synthetic-only (ADR-0004-Gate weiterhin ZU) -- diese Korrektur aendert NICHTS an Whitelist/Kategorie/Rollen-Erfassung, NUR an der beschreibenden Metadaten-Aussage.',
     now());

-- =====================================================================
-- (3) geraet_zuordnung.stammdaten.geschreddert
-- =====================================================================

UPDATE audit.event_typ_version
   SET gueltig_bis = now()
 WHERE code = 'geraet_zuordnung.stammdaten.geschreddert'
   AND gueltig_bis IS NULL;

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'geraet_zuordnung.stammdaten.geschreddert', 'geraet_zuordnung', 'schreddern',
     ARRAY['synthetic','zaehler_id','antrag_id'], true, false, true,
     'Geraete-Zuordnung krypto-geschreddert = Art. 17 DSGVO, IRREVERSIBEL (DeviceKryptoShreddingService.shred, begleitender Schritt innerhalb EndkundeService.shred(), ADR-0005 §26.5). device.schluessel.wrapped_dek vernichtet; die Zeile bekommt in derselben Operation status=geschreddert+gueltig_bis (D-KANON) UND deveui_blind_index genullt (GB-C/D-GB, V0010). AKTIV SEIT Commit e392dcf (2026-07-17): Emitter ist ein MANUELLER AuditService.append(...)-Aufruf (KEIN @AuditAction-Decorator, da kein eigener HTTP-Endpoint) in DeviceKryptoShreddingService.shred() (src/backend/src/stammdaten/crypto/device-krypto-shredding.service.ts), aufgerufen innerhalb der ShredAntragService.freigebenInTx()-Vier-Augen-Transaktion (ADR-0009). Katalog-Korrektur V0016 (database-lead, DSGVO-Phase-5-Finding DS-1, 2026-07-21): V0015 (Commit 1d1a7c2, ebenfalls 2026-07-17, aber VOR e392dcf desselben Tages) beschrieb diesen Code faelschlich als "RESERVIERT: kein v1-Endpoint/Emitter im Repo" -- zum V0015-Commit-Zeitpunkt zutreffend, aber binnen desselben Tages ueberholt und nie nachgezogen. V0015 selbst bleibt unveraendert; die Korrektur erfolgt ausschliesslich hier, als neue SCD2-Version. Uebrige Angaben UNVERAENDERT: objekt_ref=device.geraet_zuordnung.id. kontext.synthetic Pflicht-Tag, kontext.zaehler_id=Pseudonym-Referenz (bleibt nach Blind-Index-Nullung als Audit-Spur erhalten, ADR-0005 §26.5 GB-C), kontext.antrag_id=energy.endkunde_shred_antrag.id (verkettet mit dem uebergeordneten Vier-Augen-Antrag des Endkunden, wortgleiches Muster wie endkunde.stammdaten.geschreddert seit V0009 Teil 2 und den drei shred_*-Workflow-Codes, V0009 Teil 1). KEIN DevEUI-Klartext/deveui_blind_index im Kontext (RL-2). rolle_erfassen=true: Teil derselben Vier-Augen-Kontrollspur wie endkunde.stammdaten.geschreddert/shred_beantragt/shred_freigegeben/shred_abgelehnt (V0006/V0009). ADR-0005 v1 bleibt synthetic-only (ADR-0004-Gate weiterhin ZU) -- diese Korrektur aendert NICHTS an Whitelist/Kategorie/Rollen-Erfassung, NUR an der beschreibenden Metadaten-Aussage.',
     now());

-- =====================================================================
-- (4) geraet_zuordnung.stammdaten.reverse_aufgeloest
-- =====================================================================

UPDATE audit.event_typ_version
   SET gueltig_bis = now()
 WHERE code = 'geraet_zuordnung.stammdaten.reverse_aufgeloest'
   AND gueltig_bis IS NULL;

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'geraet_zuordnung.stammdaten.reverse_aufgeloest', 'geraet_zuordnung', 'aufloesen',
     ARRAY['synthetic','zaehler_id','zweck','ticket_ref'], true, false, true,
     'break-glass Reverse-Auflösung einer Geraete-Zuordnung = Zeile -> Klartext-DevEUI (PolicyAction read:geraet_zuordnung, EIGENSTAENDIGE Haertung: eigene Rolle geraete-support, Ticket-Pflicht, eigene Zweck-Whitelist, Punkt- statt Zeitraum-Aufloesung, ADR-0005 §26.4 SEC-5). JEDE Aufloesung wird auditiert, AUCH permit (analog stammdaten.verbrauch_detail.einsicht, V0006). AKTIV SEIT Commit e392dcf (2026-07-17): Emitter ist DeviceGeraetZuordnungController.reverseAufloesen() (@AuditAction, src/backend/src/stammdaten/geraet-zuordnung/device-geraet-zuordnung.controller.ts), Fachlogik in DeviceReverseAufloesungService.reverseAufloesen(). Katalog-Korrektur V0016 (database-lead, DSGVO-Phase-5-Finding DS-1, 2026-07-21): V0015 (Commit 1d1a7c2, ebenfalls 2026-07-17, aber VOR e392dcf desselben Tages) beschrieb diesen Code faelschlich als "RESERVIERT: kein v1-Endpoint/Emitter im Repo" -- zum V0015-Commit-Zeitpunkt zutreffend, aber binnen desselben Tages ueberholt und nie nachgezogen. V0015 selbst bleibt unveraendert; die Korrektur erfolgt ausschliesslich hier, als neue SCD2-Version. Uebrige Angaben UNVERAENDERT: objekt_ref=device.geraet_zuordnung.id. kontext.synthetic Pflicht-Tag, kontext.zaehler_id=Pseudonym-Referenz, kontext.zweck=whitelisted Begruendungscode (eigene, von BREAK_GLASS_ZWECK_WHITELIST unabhaengige Whitelist, ADR-0005 §26.4 SEC-5 Punkt 3 -- DB prueft nur den Schluessel-Namen, nicht den Wert), kontext.ticket_ref=strukturierter Vorgangs-Verweis (SEC-5 Punkt 2, kein Freitext). KEIN DevEUI-Klartext/deveui_blind_index im Kontext (RL-2). rolle_erfassen=true: woertlich aus ADR-0005 §26.4 SEC-5 Punkt 5 (Echtzeit-Alert bei jedem permit + periodischer Audit-Review als Pflichtprozess), analog stammdaten.verbrauch_detail.einsicht (V0006). ADR-0005 v1 bleibt synthetic-only (ADR-0004-Gate weiterhin ZU) -- diese Korrektur aendert NICHTS an Whitelist/Kategorie/Rollen-Erfassung, NUR an der beschreibenden Metadaten-Aussage.',
     now());
