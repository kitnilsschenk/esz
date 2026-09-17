-- V0067__audit_portal_events.sql
--
-- Audit-Ereignisse des Nutzerportals — und ein neuer Akteurstyp `endkunde`.
--
-- =====================================================================
-- WARUM EIN NEUER AKTEURSTYP
-- =====================================================================
-- `audit.event.actor_typ` kennt bisher `benutzer` (menschlicher Login des
-- BETRIEBS ueber Keycloak), `dienstkonto` (Client-Credentials) und `system`
-- (interner Emitter ohne Prinzipal).
--
-- Ein Endkunde, der sich am Portal anmeldet, ist keiner davon. Ihn unter
-- `benutzer` zu fuehren waere bequem und falsch: Das Audit-Log beantwortet
-- die Frage „wer hat das getan?", und die Antwort „ein Benutzer" waere dann
-- mehrdeutig zwischen einem Mitarbeiter mit Rollen und einer betroffenen
-- Person, die ihre eigenen Daten ansieht. Das sind rechtlich zwei
-- verschiedene Vorgaenge — der eine ist Verarbeitung durch den
-- Verantwortlichen, der andere die Wahrnehmung eines Betroffenenrechts.
--
-- `actor_sub` traegt fuer Endkunden die `portal.zugang.id`, NICHT die
-- `energy.endkunde.id`: Der Zugang ist die Kennung, unter der die Anmeldung
-- stattfand, und er kann gesperrt und neu ausgegeben werden, ohne dass der
-- Endkunde ein anderer wird. Die Aufloesung auf den Endkunden bleibt eine
-- Abfrage, kein Log-Inhalt.
--
-- Die Hash-Kette bleibt unberuehrt: `audit.lp(p_actor_typ)` haengt am WERT,
-- nicht an der erlaubten Wertemenge; bestehende Zeilen aendern sich nicht.
--
-- =====================================================================
-- Die vier Ereignisse
-- =====================================================================
--   portal.zugang.ausgegeben   -- BETRIEB gibt einen Zugangscode aus. Der
--       Vorgang, mit dem ein Kunde ueberhaupt erst Zugang bekommt; wer ihn
--       ausloest, ist nachtraeglich die entscheidende Frage.
--   portal.zugang.eingeloest   -- KUNDE loest den Code ein und setzt sein
--       Passwort. Ab hier ist der Code verbraucht.
--   portal.anmeldung           -- KUNDE meldet sich an. Mit `ergebnis` ok
--       ODER error -- der Fehlschlag ist der interessantere Fall (Raten).
--   portal.abmeldung           -- Sitzungsende.
--
-- KEIN Ereignis fuer das blosse Ansehen der eigenen Daten. Das waere ein
-- Ereignis je Seitenaufruf, und es traegt nichts bei: Dass ein angemeldeter
-- Kunde seine eigenen Werte sieht, ist der Zweck des Portals und keine
-- berichtenswerte Verarbeitung. Dieselbe Linie wie bei den Leserouten des
-- Betriebs.
--
-- NIRGENDS im Kontext: Endkunden-Kennung, Verbrauchswert, Zugangscode.
-- Die ersten beiden sind ueber `objekt_ref`/`actor_sub` aufloesbar, der
-- dritte darf nirgends stehen (er existiert genau einmal, im Brief).

ALTER TABLE audit.event
    DROP CONSTRAINT ck_event_actor_typ;

ALTER TABLE audit.event
    ADD CONSTRAINT ck_event_actor_typ CHECK (
        actor_typ IN ('benutzer', 'dienstkonto', 'system', 'endkunde')
    );

COMMENT ON CONSTRAINT ck_event_actor_typ ON audit.event IS
  'ADR-0003 §13.1. benutzer=menschlicher Login des Betriebs (Keycloak), dienstkonto=Client-Credentials, system=interner Emitter ohne Prinzipal, endkunde=Endkunde am Nutzerportal (V0067, actor_sub=portal.zugang.id). Der vierte Wert ist bewusst NICHT unter benutzer subsumiert: ein Mitarbeiter, der Daten verarbeitet, und eine betroffene Person, die ihre eigenen ansieht, sind rechtlich zwei verschiedene Vorgaenge.';

INSERT INTO audit.event_typ (code) VALUES
    ('portal.zugang.ausgegeben'),
    ('portal.zugang.eingeloest'),
    ('portal.anmeldung'),
    ('portal.abmeldung');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'portal.zugang.ausgegeben', 'portal_zugang', 'erzeugen',
     ARRAY['synthetic','erneut','gueltig_bis'],
     true, true, true,
     'Der Betrieb hat einen Zugangscode fuer das Nutzerportal ausgegeben ([Q3] Kap. 6). objekt_ref=portal.zugang.id, actor=Mitarbeiter. kontext.erneut=true, wenn ein bestehender Zugang einen NEUEN Code bekommt (der alte wird dabei ungueltig) -- die Unterscheidung ist der eigentliche Wert: Ein wiederholtes Ausgeben kann ein verlorener Brief sein oder ein Versuch, sich Zugang zu fremden Daten zu verschaffen. kontext traegt WEDER den Code (er existiert genau einmal, im Brief) NOCH die Endkunden-Kennung (ueber objekt_ref aufloesbar). pflichtereignis=true -- der Vorgang eroeffnet den Zugriff auf personenbezogene Verbrauchsdaten.',
     now()),
    (gen_random_uuid(), 'portal.zugang.eingeloest', 'portal_zugang', 'aendern',
     ARRAY['synthetic'],
     false, true, true,
     'Der Endkunde hat seinen Zugangscode eingeloest und ein Passwort gesetzt. objekt_ref=portal.zugang.id, actor_typ=endkunde, actor_sub=portal.zugang.id. Ab hier ist der Code verbraucht. rolle_erfassen=false -- ein Endkunde hat keine Betriebsrolle, und ein leeres Rollenfeld waere aussagekraeftiger als ein erfundenes. pflichtereignis=true: der Uebergang vom Brief zum digitalen Zugang ist der Punkt, an dem die Zuordnung Kunde<->Konto entsteht.',
     now()),
    (gen_random_uuid(), 'portal.anmeldung', 'portal_zugang', 'zugriff',
     ARRAY['synthetic','grund'],
     false, true, true,
     'Anmeldung am Nutzerportal. ergebnis=ok bei Erfolg, error bei Fehlschlag -- der FEHLSCHLAG ist der interessantere Fall: Eine Haeufung ist der einzige Hinweis darauf, dass jemand einen Zugangscode oder ein Passwort durchprobiert. kontext.grund benennt ihn ohne Details (unbekannt|passwort_falsch|gesperrt|abgelaufen) -- KEINE Angabe darueber, ob die Kennung existiert (das waere eine Auskunft an den Ratenden). objekt_ref=portal.zugang.id nur bei bekanntem Zugang, sonst NULL. pflichtereignis=true.',
     now()),
    (gen_random_uuid(), 'portal.abmeldung', 'portal_zugang', 'zugriff',
     ARRAY['synthetic','grund'],
     false, false, true,
     'Eine Portal-Sitzung wurde beendet. kontext.grund=abmeldung|abgelaufen|gesperrt. objekt_ref=portal.zugang.id. pflichtereignis=false -- das Sitzungsende beruehrt keine Rechtsposition; es steht im Log, damit eine Sitzungsdauer nachvollziehbar bleibt.',
     now());

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration gefordert)
-- =====================================================================
-- Keine eigene `audit.katalog.geaendert`-Zeile: Ein SQL-Migrationsskript kann
-- keinen validierten `actor_*`-Principal herstellen (rote Linie 1). Der
-- Eintrag ist VERSCHOBEN, nicht erledigt -- mit echtem Principal
-- nachzutragen, spaetestens bei Oeffnung des ADR-0004-Gates, GEMEINSAM mit
-- V0032, V0033, V0036, V0038, V0043, V0045, V0048, V0053, V0055, V0057,
-- V0060, V0062, V0064 und V0067.
