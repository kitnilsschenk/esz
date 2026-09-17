-- V0009__seed_shred_workflow_events.sql   
--
--
-- ADR-Bezug: docs/adr/ADR-0009-vier-augen-krypto-shredding.md (Status:
-- proposed, User-Freigabe fuer Grundmodell/Freigeber-Modell/Endpoint-Entfernung/
-- v1-Tiefe liegt vor, 2026-07-15) §2.3 ("Audit-Katalog") + §2.6 ("Migrationen")
-- + Folgeauftrag im Abschnitt "Folgeaufgaben" ("audit-trail-engineer: Audit-
-- Katalog-Migration V0009 ... optional Fehlreferenz §21 in V0006-Kommentaren
-- korrigieren"). Nummerierung V0008 (Tabelle energy.endkunde_shred_antrag,
-- separate Migration, NICHT Teil dieses Entwurfs) / V0009 (dieser Katalog-Seed)
-- ist laut ADR §2.3/§2.6/§6 ein VORSCHLAG, keine verbindliche Zuteilung -- s.
-- Abschnitt "NUMMERIERUNG" unten fuer die Bestaetigung im Rahmen dieses
-- Entwurfs.
--
-- Vorlage/Muster: migrations/V0006__seed_stammdaten_event_typen.sql (Seed-
-- Konventionen: event_typ-Header + event_typ_version, gen_random_uuid() fuer
-- Migrations-Seed-Zeilen, Bootstrap-Ausnahme-Kopf) und
-- migrations/V0007__seed_system_stillgelegt_event.sql (schlanke Variante fuer
-- einen einzelnen Nachtrags-Code). SCD2-Semantik (gueltig_ab/gueltig_bis,
-- EXCLUDE-Constraint gegen Range-Ueberlappung, aktiv-Flag, Seal-Trigger-
-- Kontext-Key-Whitelist-Pruefung) aus migrations/V0003__audit_log_schema.sql
-- (Tabellen-DDL Zeilen 248-264, Trigger audit.event_seal() Schritt (3) Zeilen
-- 690-695).
--
-- Design-Owner: audit-trail-engineer. Reviewer (VOR Merge zwingend):
-- database-lead (.claude/rules/database-migrations.md), compliance-director
-- (ADR-0009 §5: A.5.3-Erstaufnahme + DSFA-Bezug), access-control-engineer
-- (Konsistenz zu den PDP-Aktionen shred:endkunde:freigeben/:ablehnen, ADR-0009
-- §2.2), technical-director (P3-Fund, s. Teil 2 unten).
--
-- =====================================================================
-- NUMMERIERUNG (V0009 nach V0008 bestaetigt)
-- =====================================================================
--
-- `migrations/` enthaelt zum Zeitpunkt dieses Entwurfs (2026-07-15) lueckenlos
-- V0001..V0007 (hoechste vorhandene Datei: V0007__seed_system_stillgelegt_event.sql).
-- V0008 EXISTIERT NOCH NICHT als Datei -- ADR-0009 §2.1/§2.6 sieht V0008 fuer
-- die NEUE Tabelle `energy.endkunde_shred_antrag` (+ Constraints +
-- updated_at-Trigger) vor, die dieser Katalog-Seed NICHT anlegt und NICHT
-- voraussetzt (die drei neuen Codes in Teil 1 unten referenzieren `antrag_id`
-- nur als Kontext-SCHLUESSEL/Whitelist-Eintrag in `audit.event_typ_version`,
-- KEIN FK auf `energy.endkunde_shred_antrag.id` -- Kontext-Werte in
-- `audit.event.kontext` sind grundsaetzlich FK-frei, ADR-0003 Zeile 406 "KEIN
-- FK (Linie 2)"). Diese Migration ist damit UNABHAENGIG von V0008 anwendbar
-- (reine Katalog-/Vokabular-Erweiterung, kein Bezug auf die neue Tabelle
-- selbst). Nummerierung V0009 wird HIER bestaetigt UNTER DER ANNAHME, dass
-- V0008 (Tabellen-Migration) vor diesem Entwurf reserviert/gemergt wird --
-- sollte V0008 anderweitig vergeben werden, ist dieser Entwurf unter der dann
-- naechsten freien Nummer neu einzureihen (reine Umbenennung, kein inhaltlicher
-- Unterschied).
--
-- =====================================================================
-- TEIL 1: drei neue Fach-Event-Codes (Antrag/Freigabe/Ablehnung, ADR-0009 §2.3)
-- =====================================================================
--
-- Alle drei Codes sind zum Zeitpunkt dieses Entwurfs RESERVIERT (analog
-- `stammdaten.verbrauch_detail.einsicht` in V0006, Zeilen 469-481): KEIN
-- Emitter existiert noch. Grep-Befund (2026-07-15): weder
-- `stammdaten-audit-events.ts` (STAMMDATEN_EVENT_CODES) noch
-- `endkunde.controller.ts` (traegt weiterhin NUR die zu entfernende Route
-- `POST /stammdaten/endkunden/:endkundeId/kryptoshredding`, ADR-0009 §1
-- "Ist-Zustand") kennen `shred_beantragt`/`shred_freigegeben`/
-- `shred_abgelehnt` -- die Implementierung der neuen Routen
-- (`.../shred-antraege`, `.../shred-antraege/:antragId/freigeben`,
-- `.../shred-antraege/:antragId/ablehnen`, ADR-0009 §2.4) UND der
-- `STAMMDATEN_EVENT_CODES`-Ergaenzung sind Folgearbeiten (Backend-Lead/
-- api-developer), die nach dieser Migration erfolgen. Katalog-Eintrag
-- TROTZDEM jetzt angelegt (Auftrag ausdruecklich, gleiche Begruendung wie
-- V0006 fuer `verbrauch_detail.einsicht`: Katalog steht bereit, damit die
-- Implementierung ohne weitere Schema-Migration auskommt).
--
-- objekt_typ='endkunde' fuer ALLE DREI Codes (nicht nur beim ersten explizit
-- benannt): ADR-0009 §2.3, woertlich, "objekt_ref = Endkunde-UUID
-- (konsistent mit den uebrigen endkunde.*-Codes)" -- gilt fuer den gesamten
-- Antrag/Freigabe/Ablehnung/Ausfuehrung-Fluss, nicht nur fuer den Antrag.
--
-- rolle_erfassen=true fuer alle drei (Auftrag): Begruendung analog
-- `authz.zugriff.verweigert` (V0004) und der bereits bestehenden Ausnahme bei
-- `endkunde.stammdaten.geschreddert` (V0006) -- diese drei Ereignisse bilden
-- ZUSAMMEN die einzige Kontrollspur des Vier-Augen-Verfahrens (wer hat
-- beantragt, wer hat freigegeben/abgelehnt); ohne `actor_rolle` waere nach
-- einem spaeteren Rollenwechsel (z. B. `betrieb`-Entzug) nicht mehr
-- rekonstruierbar, dass beide Personen zum Zeitpunkt der Handlung tatsaechlich
-- `betrieb` waren -- governance-/sicherheitsrelevant, Rechenschaft (Art. 5(2))
-- ueberwiegt Datensparsamkeit (Art. 5(1)(c)) fuer diesen seltenen,
-- hochfolgenreichen Vorgang (identische Abwaegung wie bei `geschreddert`
-- selbst).
--
-- pflichtereignis=false fuer alle drei: Praezedenzfall-Uebernahme aus V0003/
-- V0004/V0006 (`pflichtereignis=true` bleibt ausschliesslich fuer die
-- STRIDE-Selbstpruef-Ereignisse des Audit-Subsystems reserviert, s. V0006-Kopf
-- "ENTSCHEIDUNG pflichtereignis" -- unveraendert gueltig, kein neuer
-- Praezedenzfall in diesem Entwurf).
--
-- kontext.antrag_id (alle drei) verlinkt Antrag/Freigabe/Ablehnung/Ausfuehrung
-- ueber den Zwei-Akteure-Fluss (ADR-0009 §2.3, analog kontext.version_nr bei
-- `messkonzept.version.angelegt`, V0006 (13)) -- Wert ist die
-- `energy.endkunde_shred_antrag.id` (UUID als Text-Skalar, KEIN FK aus
-- `audit.event.kontext` heraus, s. NUMMERIERUNG-Abschnitt oben).
--
-- kontext.ablehnungsgrund (NUR bei shred_abgelehnt) ist "whitelisted" NUR auf
-- APP-Ebene (ADR-0009 §6: konkrete Enum-Werte noch offen, final durch
-- access-control-engineer/compliance-director) -- die DB-seitige
-- Kontext-Whitelist in `erlaubte_kontext_keys` prueft NUR den SCHLUESSEL-Namen
-- (Trigger-Schritt (3), V0003 Zeilen 690-695), NICHT den konkreten Wert
-- (analog `kontext.zweck_code` bei `verbrauch_detail.einsicht`, V0006 Zeile
-- 124-133 "GROUNDING"-Abschnitt).

INSERT INTO audit.event_typ (code) VALUES
    ('endkunde.stammdaten.shred_beantragt'),
    ('endkunde.stammdaten.shred_freigegeben'),
    ('endkunde.stammdaten.shred_abgelehnt');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    -- (1) Antrag stellen. Unveraendertes RBAC/ABAC-Gate (@Roles('betrieb') +
    -- Fachaktion 'shred:endkunde', ADR-0009 §2.4) -- NUR der Zielendpoint
    -- aendert sich (POST .../shred-antraege statt .../kryptoshredding).
    (gen_random_uuid(), 'endkunde.stammdaten.shred_beantragt', 'endkunde', 'beantragen',
     ARRAY['synthetic','antrag_id'], true, false, true,
     'Antrag auf Krypto-Shredding eines Endkunden gestellt (Vier-Augen-Workflow, ADR-0009 §2.1/§2.3/§2.4, RESERVIERT -- Endpoint/Emitter noch nicht implementiert). objekt_ref=Endkunde-UUID, kontext.synthetic Pflicht-Tag, kontext.antrag_id=energy.endkunde_shred_antrag.id. rolle_erfassen=true: Teil der Vier-Augen-Kontrollspur (wer hat beantragt), analog authz.zugriff.verweigert (V0004) und geschreddert (V0006).',
     now()),

    -- (2) Antrag freigeben (zweite Person, sub muss != beantragt_von_sub sein,
    -- ADR-0009 §2.2 PDP-Regel 3 "vier_augen_selbstfreigabe_verboten"). Kann je
    -- nach Impl.-Entscheidung (ADR-0009 §2.1, offener Punkt) im selben Request
    -- die Ausfuehrung (geschreddert) mitausloesen -- s. Teil 2 unten
    -- ("kontext.antrag_id" bei geschreddert) UND ADR-0009 §2.3 offener
    -- Impl.-Punkt "ein eventTyp pro Route".
    (gen_random_uuid(), 'endkunde.stammdaten.shred_freigegeben', 'endkunde', 'freigeben',
     ARRAY['synthetic','antrag_id'], true, false, true,
     'Antrag auf Krypto-Shredding freigegeben (zweite betrieb-Person, ADR-0009 §2.2/§2.3, RESERVIERT -- Endpoint/Emitter noch nicht implementiert). objekt_ref=Endkunde-UUID, kontext.synthetic Pflicht-Tag, kontext.antrag_id=energy.endkunde_shred_antrag.id. rolle_erfassen=true: Teil der Vier-Augen-Kontrollspur (wer hat freigegeben, insbesondere Nachweis sub != Antragsteller-sub), analog geschreddert (V0006).',
     now()),

    -- (3) Antrag ablehnen (terminal, Antragsteller kann erneut beantragen,
    -- ADR-0009 §2.1 Zustandsuebergaenge). shred:endkunde:ablehnen ist laut
    -- ADR-0009 §2.2/§6 ein VORSCHLAG des Spezialisten (Symmetrie zu
    -- Freigeben), keine explizite User-Einzelentscheidung -- Katalog-Eintrag
    -- hier dennoch bereits angelegt (Konsistenz-Vorgriff, analog
    -- verbrauch_detail.einsicht in V0006 fuer einen noch offenen Punkt).
    (gen_random_uuid(), 'endkunde.stammdaten.shred_abgelehnt', 'endkunde', 'ablehnen',
     ARRAY['synthetic','antrag_id','ablehnungsgrund'], true, false, true,
     'Antrag auf Krypto-Shredding abgelehnt (zweite betrieb-Person, terminal, ADR-0009 §2.1/§2.2/§2.3, RESERVIERT -- Endpoint/Emitter noch nicht implementiert; PolicyAction shred:endkunde:ablehnen selbst noch unbestaetigter Vorschlag, ADR-0009 §6). objekt_ref=Endkunde-UUID, kontext.synthetic Pflicht-Tag, kontext.antrag_id=energy.endkunde_shred_antrag.id, kontext.ablehnungsgrund=whitelisted Begruendungscode (konkrete Werte final durch access-control-engineer/compliance-director, ADR-0009 §6 -- DB-Whitelist prueft hier nur den Schluessel-Namen, nicht den Wert, analog zweck_code bei verbrauch_detail.einsicht). rolle_erfassen=true: Teil der Vier-Augen-Kontrollspur (wer hat abgelehnt).',
     now());

-- =====================================================================
-- TEIL 2 (technical-director P3, KRITISCH): SCD2-Erweiterung von
-- `endkunde.stammdaten.geschreddert` -- erlaubte_kontext_keys um `antrag_id`
-- ergaenzt
-- =====================================================================
--
-- BEFUND: Der bestehende Katalog-Eintrag (V0006, Zeilen 374-377) hat
-- `erlaubte_kontext_keys = ARRAY['synthetic']` -- OHNE `antrag_id`. Sobald
-- die Ausfuehrung (Krypto-Shredding selbst) kuenftig aus dem Vier-Augen-
-- Freigabe-Schritt heraus erfolgt (ADR-0009 §2.1/§2.3), muesste der Emitter
-- `kontext.antrag_id` mitgeben, um die Ausfuehrung an den zugrundeliegenden
-- Antrag zu verketten -- der Seal-Trigger (V0003, Schritt (3), Zeilen
-- 690-695) wuerde das mit "kontext-key(s) nicht in Whitelist" FAIL-CLOSED
-- ablehnen, WEIL `geschreddert` bislang nur `synthetic` erlaubt. Diese
-- Aenderung ist daher eine VORAUSSETZUNG, nicht nur eine Ergaenzung, fuer den
-- in ADR-0009 §2.3 vorgesehenen Fluss.
--
-- SCD2 statt In-Place-UPDATE: `audit.event_typ_version` ist append-only
-- versioniert (V0003-Migrations-Kopf, "Katalog append-only versioniert");
-- eine Aenderung der Whitelist ist eine NEUE Version, KEIN Edit der
-- bestehenden Zeile (die bestehende Zeile bleibt unveraendert liegen und
-- bleibt damit auch fuer die ruecknachtraegliche Aufloesung bereits
-- bestehender `audit.event`-Zeilen fuer diesen Code korrekt gueltig, V0003
-- Trigger Schritt (2): "Gueltige Katalog-Version zum ts aufloesen").
--
-- WICHTIG (Auftrag, woertlich uebernommen): die Vorgaenger-Version wird NUR
-- ueber `gueltig_bis := now()` geschlossen -- OHNE `aktiv := false`. Das
-- unterscheidet sich bewusst von den DOWN-Migrationen (V0004/V0006/V0007),
-- die beim RUECKBAU/DER DEPRECATION eines gesamten Codes `aktiv=false` UND
-- `gueltig_bis=now()` zusammen setzen ("dieser Code ist komplett zurueckgezogen").
-- Hier wird der Code NICHT zurueckgezogen, sondern lediglich auf eine neuere
-- Version desselben weiterhin vollgueltigen Konzepts angehoben -- die
-- Vorgaenger-Zeile bleibt `aktiv=true` als korrekt gueltig-GEWESENE
-- historische Version (kein Widerspruch: `aktiv` + geschlossenes
-- `gueltig_bis` bedeutet "war eine legitime Katalog-Version, ist es jetzt
-- zeitlich nicht mehr" -- die EXCLUDE-Constraint (V0003 Zeile 261-263)
-- verhindert ohnehin, dass zwei Versionen desselben Codes gleichzeitig
-- ueberlappende Gueltigkeitsfenster haben, unabhaengig vom `aktiv`-Flag).
--
-- KEIN neuer `audit.event_typ`-Header: der Code `endkunde.stammdaten.
-- geschreddert` existiert bereits (V0006) -- NUR eine neue
-- `event_typ_version`-Zeile.
--
-- Beschreibungstext-Korrektur (optional laut Auftrag, hier im selben Zug
-- vorgenommen, da ohnehin eine neue Version geschrieben wird): die bisherige
-- Beschreibung (V0006 Zeile 376) referenziert "ADR-0008 §21 Finding B" --
-- FALSCH, korrekt ist §19 (ADR-0009 §1 "Grounding-Korrektur", woertlich:
-- "migrations/V0006__seed_stammdaten_event_typen.sql (Kommentare Zeilen 209,
-- 369, 376) referenzieren dieses Finding faelschlich als §21 Finding B ...
-- tatsaechlich steht der Text in §19"). Die Korrektur erfolgt HIER NUR in der
-- neuen `event_typ_version`-Zeile (Datenbank-Katalogtext) -- die urspruengliche
-- V0006-Zeile (SQL-Kommentar in der bereits gemergten Migrationsdatei) wird
-- NICHT rueckwirkend editiert (Migrationsdateien sind nach Merge unveraenderlich,
-- .claude/rules/database-migrations.md sinngemaess auf Historie uebertragen;
-- ADR-0009 §1 selbst haelt die Korrektur bereits separat, ausserhalb von V0006,
-- fest).
--
-- Neue Beschreibung haelt zusaetzlich fest, dass die eigentliche Vier-Augen-
-- DURCHSETZUNG (App-Layer-ABAC + DB-CHECK via energy.endkunde_shred_antrag,
-- ADR-0009 §2.1/§2.2/§2.7) zum Zeitpunkt DIESER Migration noch NICHT verdrahtet
-- ist (Backend-Folgearbeit, s. Teil-1-Kopf) -- die erweiterte Kontext-Whitelist
-- allein bewirkt noch keine Vier-Augen-Kontrolle, sie macht sie nur fuer den
-- Emitter ZULAESSIG, sobald er kommt.

-- LAST-BEARING ANNAHME (bitte database-lead-Review): `now()` liefert
-- innerhalb EINER Transaktion einen stabilen Wert (Transaktions-Start-Zeit,
-- kein clock_timestamp()) -- die UPDATE- und die nachfolgende INSERT-Anweisung
-- muessen daher als EINE Transaktion ausgefuehrt werden (Standard-Verhalten
-- des Migrations-Runners fuer eine einzelne SQL-Datei, wie auch sonst im
-- gesamten Repo vorausgesetzt, z. B. V0006s 17 identische gueltig_ab-Werte
-- ueber ein einzelnes Multi-Row-INSERT). Nur unter dieser Annahme gilt exakt
-- `alte_version.gueltig_bis = neue_version.gueltig_ab` (bitwertgleich) --
-- diese Gleichheit wird von der zugehoerigen Down-Datei genutzt, um die neue
-- Version deterministisch von der Vorgaenger-Version zu unterscheiden.
UPDATE audit.event_typ_version
   SET gueltig_bis = now()
 WHERE code = 'endkunde.stammdaten.geschreddert'
   AND gueltig_bis IS NULL;

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'endkunde.stammdaten.geschreddert', 'endkunde', 'schreddern',
     ARRAY['synthetic','antrag_id'], true, false, true,
     'Endkunde krypto-geschreddert = Art. 17 DSGVO, IRREVERSIBEL (EndkundeController.kryptoShredding -> KryptoShreddingService.shred, ADR-0008 §19/§20). objekt_ref=Endkunde-UUID, kontext.synthetic Pflicht-Tag, kontext.antrag_id=energy.endkunde_shred_antrag.id (NEU, optional bis Backend-Anschluss: verkettet die Ausfuehrung mit dem zugrundeliegenden Vier-Augen-Antrag/-Freigabe, ADR-0009 §2.1/§2.3). rolle_erfassen=true: Vier-Augen-Kontrolle fuer diesen hochfolgenreichen Vorgang ist mit ADR-0009 als Grundmodell entschieden (Antrag->Freigabe/Ablehnung->Ausfuehrung, App-Layer-ABAC + DB-CHECK auf energy.endkunde_shred_antrag), DURCHSETZUNG zum Zeitpunkt dieser Migration jedoch NOCH NICHT verdrahtet (Backend-Folgearbeit; DB-SECURITY-DEFINER-Gate-Funktion analog audit.retention_drop() bewusst erst spaeterer Folgeausbau, ADR-0009 §2.7) -- Rolle zum Ausfuehrungszeitpunkt bleibt bis zur vollstaendigen Verdrahtung die wichtigste Kompensationsspur. [Korrigiert ggue. V0006: vormals "ADR-0008 §21 Finding B", richtig ist §19 -- ADR-0009 §1 Grounding-Korrektur.]',
     now());

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (fuer V0009 NEU geprueft, wie bei jeder Katalog-Migration
-- gefordert, s. V0006/V0007-Kopf "VERBINDLICHER HINWEIS")
-- =====================================================================
--
-- Diese Migration emittiert -- wie V0003/V0004/V0006/V0007 -- KEINE eigene
-- Zeile in `audit.event` (weder fuer die drei neuen Codes noch fuer die
-- SCD2-Aenderung an `geschreddert`, die fachlich selbst ein
-- `audit.katalog.geaendert`-Ereignis darstellen wuerde). Pruefung, unabhaengig
-- von den Vorgaenger-Migrationen fuer DIESEN Zeitpunkt hergeleitet:
--   1. ADR-0008 §0 ("Gate-Klarstellung") bleibt unveraendert in Kraft: das
--      ADR-0004-Ingest-Gate ist weiterhin ZU -- v1 = synthetic-only,
--      pre-go-live. ADR-0009 aendert an diesem Gate NICHTS (ADR-0009 ist ein
--      ABAC-/Audit-Katalog-Entwurf fuer eine BESTEHENDE, bereits hinter
--      SyntheticOnlyInterceptor liegende PII-Route -- keine neue
--      Ingest-Oeffnung).
--   2. Weder die drei neuen Codes noch die geschreddert-Ausfuehrung selbst
--      haben zum Zeitpunkt dieser Migration einen produktiven Konsumenten
--      (Backend-Implementierung von ADR-0009 §2.4 steht noch aus, s. Teil-1-
--      Kopf) -- strukturell (noch) keine Moeglichkeit realer
--      Personendaten-/Betriebsvorgangs-Events unter diesen Katalog-Eintraegen.
--   3. Der rein mechanische Grund aus V0003/V0004/V0006/V0007 gilt
--      unveraendert: ein SQL-Migrationsskript kann keinen validierten
--      `actor_*`-Principal herstellen (rote Linie 1).
-- ENTSCHEIDUNG: keine `audit.katalog.geaendert`-Selbst-Emission durch diese
-- Migration. VERBINDLICHER HINWEIS fuer V0010+: erneut zu pruefen, sobald das
-- ADR-0004-Gate geoeffnet wird ODER sobald die Backend-Implementierung von
-- ADR-0009 §2.4 (Routen/Emitter) live geht -- dann sollte die naechste
-- Katalog-Migration bzw. ein begleitender operativer Prozess eine ECHTE,
-- menschlich ausgefuehrte `audit.append_event('audit.katalog.geaendert', ...)`
-- fuer GENAU DIESE Aenderung nachtragen (Ereignis selbst wird durch das
-- Fehlen dieser Migrations-Emission nicht rueckwirkend unmoeglich -- es kann
-- jederzeit spaeter, mit echtem Principal, nachgetragen werden).
