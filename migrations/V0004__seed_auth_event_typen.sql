-- V0004__seed_auth_event_typen.sql
--
-- ADR-Bezug: docs/adr/ADR-0002-auth-modul.md Teil B §15 ("D5 — Audit-Emitter"),
-- M1 (Deny-by-default)/M2 ("Jede abgelehnte AuthZ-Entscheidung ist auditiert").
-- Konsistent zu ADR-0003 §13.2 ("kontrolliertes Vokabular, ausschliesslich
-- ueber `/add-audit-event` erweiterbar") und dem Katalog-Mechanismus aus
-- migrations/V0003__audit_log_schema.sql (Tabellen `audit.event_typ` +
-- `audit.event_typ_version`, SCD2, append-only; s. dortiger Migrations-Kopf
-- Punkt V4 fuer die Seed-Konventionen, die diese Migration unveraendert
-- weiterfuehrt: `gen_random_uuid()` fuer `event_typ_version.id` bei
-- Migrations-Seed-Zeilen ist ausdruecklich zulaessig, App-Laufzeit-Events
-- bleiben UUIDv7).
--
-- Arbeitspaket: `/add-audit-event` fuer die vier AuthN-Event-Codes aus
-- `src/backend/src/audit/audit-event-codes.ts` (`AUTH_EVENT_CODES`,
-- Referenz-Konstanten des `api-developer`, die bislang OHNE Katalog-Eintrag
-- am DB-seitigen FK/Trigger fehlschlagen wuerden -- s. Kommentar dort) PLUS
-- eine bewusst hinzugefuegte fuenfte AuthZ-Fallback-Code (`authz.zugriff.
-- verweigert`, s. Abschnitt "ENTSCHEIDUNG" unten). Design-Owner dieser Zeile:
-- audit-trail-engineer (Fachschema Action/objekt_typ/Kontext-Whitelist/
-- rolle_erfassen je Code -- kein PII, kontrolliertes Vokabular).
--
-- Ist-Stand-Abgleich (Code-Review vor dieser Migration, s. finale Antwort):
-- `src/backend/src/auth/auth.service.ts` ruft `AuditService.append()` bereits
-- MIT diesen vier `AUTH_EVENT_CODES` auf (dokumentierte Decorator-Ausnahme
-- Login/Callback/Refresh/Logout, `backend-lead`-Votum F2) -- jeder dieser
-- Aufrufe wuerde bis zu dieser Migration am Katalog-FK von `audit.event_typ`
-- fail-closed scheitern (Bootstrap-Luecke, s. Kommentar in
-- `audit-event-codes.ts`). Die konkreten `ergebnis`/`actorTyp`/`kontext`-Werte
-- unten sind daher NICHT spekulativ, sondern 1:1 aus dem bereits
-- geschriebenen `auth.service.ts` abgelesen (`emitLoginFailure`,
-- `tryEmitRefreshSuccess`, `handleCallback`, `logout`) -- s. Detailbegruendung
-- je Zeile.
--
-- =====================================================================
-- ENTSCHEIDUNG: `authz.zugriff.verweigert` -- gebraucht, aber SCOPE-
-- EINGESCHRAENKT (offener Punkt aus dem Auftrag, hier fachlich entschieden)
-- =====================================================================
--
-- Frage: braucht es einen generischen `authz.zugriff.verweigert`-Code, ODER
-- reicht "denied/error-Faelle nutzen denselben eventTyp wie der Erfolgsfall
-- der Route" (ein Code = ein objekt_typ, so vom `api-developer` fuer den
-- generischen `@AuditAction`-Decorator-Pfad bereits implementiert, s.
-- `src/backend/src/common/interceptors/audit-action.interceptor.ts`:
-- `runWithAudit()` ruft `this.emit(metadata, 'ok'|'denied'|'error', ...)`
-- IMMER mit `metadata.eventTyp` -- also dem Code der dekorierten Methode
-- selbst, unabhaengig vom Ergebnis)?
--
-- BEFUND (Code-Review): Diese Wiederverwendung ist bereits Konvention fuer
-- JEDE `@AuditAction`-dekorierte Route (nicht auth-spezifisch) -- und
-- funktioniert dort OHNE Katalog-Aenderung, weil `event_typ_version` das
-- Feld `ergebnis` NICHT einschraenkt (der Seal-Trigger prueft nur
-- Katalog-Gueltigkeit + Kontext-Whitelist je `event_typ`, s.
-- `audit.event_seal()` Schritt (2)/(3) in V0003) -- ein Code kann also sowohl
-- 'ok' als auch 'denied'/'error'-Zeilen tragen. FUER DIESEN FALL ist KEINE
-- zusaetzliche Katalog-Zeile noetig; die Konsequenz fuer den Decorator-
-- Contract ist: "@AuditAction({eventTyp})" bleibt bewusst EIN Code pro
-- Methode, auch fuer den Denied-Pfad (api-developer-Implementierung wird
-- HIERMIT bestaetigt, keine Aenderung noetig).
--
-- ABER: `backend-nestjs.md` verlangt den `@AuditAction`-Decorator nur "auf
-- allen state-aendernden Methoden" -- NICHT auf reinen Lese-Routen. Der
-- `AuditActionInterceptor` reicht Routen OHNE Decorator-Metadaten UNVERAENDERT
-- durch (`if (metadata === undefined) return next.handle();`,
-- audit-action.interceptor.ts Z. 38-40) -- eine `ForbiddenException` aus dem
-- `PolicyInterceptor` (403, RBAC/ABAC-Ablehnung) auf einer NICHT dekorierten
-- Route (z. B. eine gaurded Lese-Route) durchlaeuft diesen Interceptor also,
-- OHNE dass irgendein Audit-Emit stattfindet -- strukturelle Luecke gegen
-- ADR-0002 M2 ("Jede abgelehnte AuthZ-Entscheidung ist auditiert ... 0 stille
-- Ablehnungen"), die NICHT durch "Route nutzt ihren eigenen Erfolgscode"
-- geschlossen werden kann, weil es dort gar keinen Emit-Pfad gibt, in den ein
-- Code eingesetzt werden koennte.
--
-- ENTSCHEIDUNG: `authz.zugriff.verweigert` WIRD seeded -- aber
-- AUSSCHLIESSLICH als schmaler FALLBACK-Code fuer AuthZ-Ablehnungen
-- AUSSERHALB eines `@AuditAction`-Kontexts (kein anderer, routen-eigener
-- Code verfuegbar). Fuer `@AuditAction`-dekorierte Routen bleibt es bei der
-- bereits implementierten Wiederverwendung des Routen-eigenen Codes (kein
-- Widerspruch, unterschiedliche Faelle). `objekt_typ='authz_entscheidung'`
-- (kein Bezug zu einer konkreten Fachressource -- das UNTERSCHEIDET diesen
-- Fallback-Code bewusst von "ein Code = ein objekt_typ" der Fachrouten:
-- hier IST "eine Autorisierungsentscheidung ohne Fachobjekt" das Objekt).
--
-- KONSEQUENZ FUER DEN DECORATOR-/EMITTER-CONTRACT (Uebergabe an backend-lead/
-- api-developer, NICHT Teil dieser Schema-Migration -- kein `src/`-Schreib-
-- zugriff in diesem Arbeitspaket): der Katalog-Eintrag allein schliesst die
-- Luecke NICHT -- es fehlt weiterhin ein Emit-Pfad. Empfehlung: entweder (a)
-- `AuditActionInterceptor` um einen Fallback-Zweig erweitern, der bei
-- `metadata === undefined` UND `error instanceof ForbiddenException` mit
-- `AUTH_EVENT_CODES` bzw. einer neuen `AUTHZ_EVENT_CODES.ZUGRIFF_VERWEIGERT`-
-- Konstante `AuditService.append({eventTyp: 'authz.zugriff.verweigert',
-- ergebnis: 'denied', ...})` aufruft, oder (b) `backend-nestjs.md` dahin
-- gehend praezisieren, dass JEDE nicht-oeffentliche Route (nicht nur
-- state-aendernde) `@AuditAction` traegt (dann waere jede Route ohnehin
-- Fall 1, dieser Fallback-Code bliebe ungenutzt/dead -- Kosten-Nutzen-
-- Abwaegung bei backend-lead). Bis eine dieser beiden Optionen umgesetzt ist,
-- ist dieser Katalog-Eintrag bewusst RESERVIERT (analog `audit.ddl.gemeldet`
-- in V0003 -- Katalog-Zeile vorhanden, Emitter folgt separat).
--
-- `rolle_erfassen=true` NUR fuer diesen Code (einzige Abweichung von den vier
-- reinen AuthN-Codes unten): die Rolle zum Zeitpunkt einer AuthZ-Ablehnung ist
-- unmittelbar ermittlungsrelevant (RBAC-Fehlkonfiguration? Rolle fehlte
-- erwartungsgemaess?) -- ein legitimer Zweck iSd Datensparsamkeit (Art.
-- 5(1)(c) DSGVO), der bei einem reinen Login-/Logout-/Refresh-"ok"-Ereignis
-- nicht gegeben ist (s. je Zeile unten). Offener technischer Punkt fuer den
-- Emitter (an backend-lead/api-developer, nicht hier loesbar): `actor_rolle`
-- ist ein einzelnes `text`-Feld, `SecurityContext.roles` ist aber
-- mutmasslich ein Array -- die Ableitung "welche Rolle wird eingetragen, wenn
-- mehrere greifen" ist beim Bau des Fallback-Emit-Pfads zu klaeren.
--
-- =====================================================================
-- ENTSCHEIDUNG: Katalog-Aenderung als Pflicht-Event (`audit.katalog.
-- geaendert`) -- Bootstrap-Ausnahme, analog V0003
-- =====================================================================
--
-- ADR-0003 (V0003-Kommentar zur Katalog-Tabelle) nennt jede Aenderung des
-- kontrollierten Vokabulars fachlich ein Pflicht-Audit-Event
-- (`audit.katalog.geaendert`). Diese Migration emittiert TROTZDEM KEINE
-- Zeile in `audit.event` fuer sich selbst -- aus denselben Gruenden, die
-- V0003 fuer die eigene Erstseed-Ausnahme dokumentiert (dortiger
-- Migrations-Kopf, Punkt V4): (1) eine echte Emission braucht App-/Job-
-- seitige `event_id`(UUIDv7)-Erzeugung UND einen `actor_*`-Kontext (wer/was
-- hat diese Migration ausgefuehrt?) -- das ist Anwendungs-/Betriebs-Kontext,
-- den ein reines SQL-Migrationsskript nicht sinnvoll/faelschungssicher selbst
-- herstellen kann (ein `INSERT INTO audit.event` durch die
-- Migrations-Runner-Rolle waere kein echter, attribuierbarer Audit-Beleg,
-- sondern ein Systemartefakt mit erfundenem Akteur -- Bruch der roten Linie
-- 1 "kein Emit ohne validierten Principal"); (2) diese Migration ist -- wie
-- V0003 selbst -- eine PRE-GO-LIVE-BOOTSTRAP-Erweiterung des Katalogs: die
-- vier `AUTH_EVENT_CODES` existieren im Code bereits (s. o.), aber JEDER
-- Versuch, sie zu verwenden, ist bislang am fehlenden Katalog-Eintrag
-- fail-closed gescheitert -- es gibt also (noch) KEINE echte Auth-Session, zu
-- der diese Katalog-Erweiterung im Nachhinein eine Aenderung waere.
--
-- WICHTIGE ABGRENZUNG (anders als bei V0003, s. finale Antwort dieses
-- Arbeitspakets): sollte diese Migration NICHT mehr vor Erst-Inbetriebnahme,
-- sondern gegen ein bereits produktiv laufendes System (mit existierenden
-- `audit.event`-Zeilen anderer Codes) angewendet werden, gilt die
-- Bootstrap-Ausnahme NICHT mehr unveraendert fort -- ab dem Moment, in dem
-- das System live ist, MUSS jede weitere `/add-audit-event`-Erweiterung
-- (V0005+) von einer echten `audit.append_event('audit.katalog.geaendert',
-- ...)`-Zeile MIT Betriebs-Akteur begleitet werden (durch den
-- ausfuehrenden Menschen/Prozess, NICHT durch die Migration selbst). Dieser
-- Migrations-Kopf haelt fest: diese Bootstrap-Ausnahme gilt EINMALIG fuer
-- V0003 und diese Migration (V0004); danach nicht mehr automatisch.

-- =====================================================================
-- Seed: vier AuthN-Codes (bereits in Verwendung, s. auth.service.ts) +
-- ein AuthZ-Fallback-Code (reserviert, s. ENTSCHEIDUNG oben). Governance-/
-- Konfigurationsdaten, KEIN Ingest, KEINE personenbezogenen Daten (reine
-- Vokabular-/Whitelist-Metadaten, analog V0003).
-- =====================================================================

INSERT INTO audit.event_typ (code) VALUES
    ('auth.anmeldung.erfolg'),
    ('auth.anmeldung.fehlschlag'),
    ('auth.token.erneuert'),
    ('auth.abmeldung.erfolg'),
    ('authz.zugriff.verweigert');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    -- (1) Login-Erfolg. `ergebnis='ok'` einzig verwendeter Wert
    -- (auth.service.ts::handleCallback). `actor_sub` = validierter
    -- ID-Token-`sub` (rote Linie 1: NUR nach vollstaendiger Token-
    -- Validierung). `rolle_erfassen=false`: Datensparsamkeit (Art. 5(1)(c)
    -- DSGVO, ADR-0002 §13.4) -- fuer ein reines Erfolgs-Ereignis ist die
    -- Rolle zum Zeitpunkt nicht ermittlungsrelevant (anders als bei einer
    -- AuthZ-Ablehnung, s. u.); `auth.service.ts` uebergibt aktuell ohnehin
    -- kein `actorRolle`. `erlaubte_kontext_keys=['client_id']`: reserviert
    -- fuer den auth-service-seitigen OIDC-Client (z. B. 'edms-bff' vs.
    -- kuenftige Service-Account-Clients) -- NICHT aktuell befuellt (aktueller
    -- `handleCallback()`-Aufruf setzt keinen `kontext`), aber als einzige
    -- absehbar noetige, PII-freie Konfigurations-ID whitelisted, statt die
    -- Whitelist spaeter per Zusatz-Migration nachziehen zu muessen.
    (gen_random_uuid(), 'auth.anmeldung.erfolg', 'auth_sitzung', 'anmelden',
     ARRAY['client_id'], false, false, true,
     'Nach vollstaendiger ID-Token-Validierung im OIDC-Callback (rote Linie 1, ADR-0002 §15). actor_typ=benutzer, actor_sub=validierter sub, ergebnis=ok.',
     now()),

    -- (2) Login-Fehlschlag. `actor_sub=NULL`, `actor_typ='system'`
    -- (auth.service.ts::emitLoginFailure -- KEIN validierter Prinzipal, daher
    -- strukturell keine Akteurs-Zuschreibung, ADR-0002 §15). `ergebnis`
    -- IMMER 'denied' in der aktuellen Implementierung (auch bei
    -- IdP-Nichterreichbarkeit) -- bewusst vereinheitlicht, s. finale Antwort
    -- fuer eine Anmerkung zur ADR-Formulierung "denied/error".
    -- `erlaubte_kontext_keys=['grund']`: Werte-Enum ist ANWENDUNGSSEITIG als
    -- TS-Union durchgesetzt (kein DB-CHECK auf konkrete Werte -- der
    -- Seal-Trigger prueft nur Key-Whitelist + Skalar + Groessen-Cap, s.
    -- V0003), aktuell exakt sieben Werte aus `auth.service.ts`:
    -- oidc_fehler_von_keycloak | state_ungueltig_oder_fehlend | code_fehlt |
    -- nonce_mismatch | id_token_ohne_sub | idp_nicht_erreichbar |
    -- code_exchange_fehlgeschlagen (s. docs/architecture/audit-events.md
    -- fuer die vollstaendige, gepflegte Enum-Liste).
    (gen_random_uuid(), 'auth.anmeldung.fehlschlag', 'auth_versuch', 'anmelden',
     ARRAY['grund'], false, false, true,
     'OIDC-Callback-Fehlschlag vor/waehrend Token-Validierung (state/nonce/code-Exchange/IdP-Fehler). actor_sub=NULL, actor_typ=system (kein validierter Prinzipal), ergebnis=denied, kontext.grund=whitelisted Fehlercode (ADR-0002 §15).',
     now()),

    -- (3) Token-Refresh. NUR 'ok' (auth.service.ts::tryEmitRefreshSuccess --
    -- Best-effort: schlaegt die `sub`-Extraktion/Verifikation des frischen
    -- Access-Tokens fehl, wird die Audit-Zeile bewusst UEBERSPRUNGEN statt
    -- mit unvalidiertem `sub` geschrieben, rote Linie 1 -- kein 'error'/
    -- 'denied'-Pfad in der aktuellen Implementierung). `rolle_erfassen=false`
    -- (Datensparsamkeit, kein Rollenwechsel-Ereignis). Kein Kontext benoetigt.
    (gen_random_uuid(), 'auth.token.erneuert', 'auth_sitzung', 'erneuern',
     '{}', false, false, true,
     'Refresh-Token-Rotation nach erneuter Access-Token-Verifikation (Best-effort sub-Attribution, ADR-0002 §15). actor_typ=benutzer, ergebnis=ok.',
     now()),

    -- (4) Logout. `actor_typ='system'`, KEIN `actor_sub` in der aktuellen
    -- Implementierung (auth.service.ts::logout uebergibt keinen actorSub --
    -- der Logout-Endpunkt loescht das Refresh-Cookie serverseitig, ohne den
    -- Access-Token/`sub` erneut zu verifizieren). Dokumentiert als
    -- IST-Zustand, nicht als Katalog-Vorgabe -- eine kuenftige
    -- `actor_sub`-Anreicherung waere eine Emitter-Aenderung, KEINE
    -- Katalog-Aenderung (die Spalte ist bereits nullable, kein
    -- Migrations-Bedarf).
    (gen_random_uuid(), 'auth.abmeldung.erfolg', 'auth_sitzung', 'abmelden',
     '{}', false, false, true,
     'Serverseitige Session-Beendigung (Refresh-Cookie-Loeschung + best-effort IdP-End-Session). actor_typ=system (aktuelle Implementierung fuehrt keine erneute sub-Verifikation durch), ergebnis=ok.',
     now()),

    -- (5) AuthZ-Fallback (s. ENTSCHEIDUNG oben). `rolle_erfassen=true`
    -- (einzige Abweichung -- Rolle zum Ablehnungszeitpunkt ist
    -- ermittlungsrelevant). `erlaubte_kontext_keys=['grund','route_muster']`:
    -- `grund` = strukturierter, whitelisted PDP-/RBAC-Ablehnungscode (ADR-0002
    -- §13, "Decision = {effect, reason: whitelisted-code}", KEIN Freitext,
    -- rote Linie 2); `route_muster` = statisches Route-Template
    -- (z. B. '/dokumente/:id'), AUSDRUECKLICH NICHT die konkrete Request-URL
    -- mit echten IDs/Query-Parametern (die gehoeren, falls vorhanden, in
    -- `objekt_ref`, nicht in `kontext`). RESERVIERT/noch ungenutzt (s.
    -- ENTSCHEIDUNG oben, Emitter-Anschluss ist ein `src/`-seitiges
    -- Arbeitspaket ausserhalb dieser Migration).
    (gen_random_uuid(), 'authz.zugriff.verweigert', 'authz_entscheidung', 'melden',
     ARRAY['grund','route_muster'], true, false, true,
     'AuthZ-Ablehnung (403) eines bereits authentisierten Prinzipals AUSSERHALB eines @AuditAction-Kontexts (Fallback fuer Routen ohne routeneigenen Audit-Code, s. Migrations-Kopf ENTSCHEIDUNG). actor_sub=opaker sub, ergebnis=denied. Reserviert: Emit-Pfad noch nicht verdrahtet (M2-Luecke fuer nicht-dekorierte Routen, an backend-lead/api-developer uebergeben).',
     now());
