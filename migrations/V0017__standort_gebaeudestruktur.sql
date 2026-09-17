-- V0017__standort_gebaeudestruktur.sql
--
-- ADR-Bezug: docs/adr/ADR-0010-standort-gebaeudestruktur.md (Status:
-- PROPOSED, User-Freigabe zum Zeitpunkt dieses Entwurfs AUSSTEHEND -- s.
-- Hinweis unten). Abschnitt 3 (Entscheidungen D1-D6), Abschnitt 4
-- (Schema-Skizze, DDL-nah). Design-Owner: technical-director. Migrations-
-- Entwurf: database-lead (direkter Arbeitsauftrag, "Skizze zu einer
-- korrekten, getesteten Migration machen").
--
-- STATUS-HINWEIS (wichtig): Diese Datei ist ein ENTWURF. ADR-0010 selbst
-- traegt den Status "proposed" (User-Freigabe steht noch aus, ADR-Kopf
-- Zeile 7). Diese Migration wird NICHT gegen die Dev-Instanz (Port 5437)
-- angewendet und NICHT committet -- ausschliesslich gegen einen
-- Wegwerf-Testcontainer verifiziert (Arbeitsauftrag). Vor echtem Merge:
-- ADR-0010-Freigabe durch den User + Review database-lead (dieser
-- Entwurf) + compliance-director (PII-Spalten identity.standort_pii,
-- .claude/rules/database-migrations.md) + access-control-engineer (D5,
-- separat).
--
-- =====================================================================
-- Rote Linien (ADR-0010 Abschnitt 2, unveraendert uebernommen)
-- =====================================================================
-- RL-1: energy.standort ist VOLLSTAENDIG PII-frei -- keine Bezeichnung,
--   keine Adresse, kein Freitext, auch kein "unverfaengliches" Label.
-- RL-2: KEIN geteilter Standort-Record ueber Endkundengrenzen -- ein
--   Gebaeude, das mehreren Endkunden dient, wird als ZWEI Standort-
--   Datensaetze modelliert (je Mandant einer).
-- RL-3: Standort-PII erscheint nicht in Exporten/Logs/Suchindex (App-Scope,
--   nicht Teil dieser Migration, aber Grund fuer die strikte
--   energy/identity-Trennung unten).
--
-- =====================================================================
-- D2.1 -- Mandantentreue DEKLARATIV, OHNE Trigger (bitte im Review pruefen)
-- =====================================================================
-- `UNIQUE (id, endkunde_id)` auf energy.standort macht das Paar
-- (id, endkunde_id) selbst zu einem gueltigen FK-Ziel. Der zusammengesetzte
-- Self-FK `FOREIGN KEY (parent_id, endkunde_id) REFERENCES
-- energy.standort (id, endkunde_id)` verlangt dann: es MUSS eine Zeile mit
-- id = parent_id UND endkunde_id = <der eigene endkunde_id-Wert> existieren.
-- Es gibt aber nur EINE Zeile mit id = parent_id ueberhaupt (id ist PK) --
-- und deren endkunde_id-Spalte hat einen FESTEN, bereits gespeicherten
-- Wert. Ein Kind kann also NUR dann erfolgreich eingefuegt werden, wenn
-- sein eigener endkunde_id-Wert MIT dem endkunde_id-Wert der Parent-Zeile
-- uebereinstimmt -- jeder Versuch, ein Kind unter einen Standort eines
-- ANDEREN Endkunden zu haengen, hat zwangslaeufig ein abweichendes
-- endkunde_id-Feld und findet damit KEINE passende (id, endkunde_id)-Zeile
-- zum Referenzieren -> FK-Verletzung, strukturell durch die PostgreSQL-
-- Fremdschluessel-Maschinerie selbst erzwungen, OHNE dass irgendein Trigger
-- oder Anwendungscode das jemals pruefen muss. Der Preis ist die
-- Redundanz von endkunde_id auf jedem Knoten (D2.1, ADR) -- die zugleich
-- der ABAC-Filter ist (ADR §D5).
-- Der Pfad-Trigger (unten) verlaesst sich bewusst NICHT zusaetzlich auf
-- eine eigene endkunde_id-Gleichheitspruefung -- das waere doppelt
-- gemoppelt, der FK deckt diesen Fall bereits vollstaendig und
-- deklarativ ab (kein Wettlauf zwischen Trigger-Logik und FK denkbar, da
-- der FK IMMER, unabhaengig vom Trigger, am Ende der Anweisung greift).
--
-- =====================================================================
-- Namensraum- und Datenklassen-Trennung (RL-1, analog V0002 rote Linie 1/5)
-- =====================================================================
-- energy.standort / energy.zaehler_standort: PII-frei, Fachdaten.
-- identity.standort_pii: Label/Adresse, feldverschluesselt. Verbindung
-- AUSSCHLIESSLICH ueber `pseudonym_id` (KEIN DB-FK, wie identity.
-- endkunde_pii.pseudonym_id/energy.endkunde.id seit V0002) -- identity
-- bleibt physisch abtrennbar. `energy.set_updated_at()`/`identity.
-- set_updated_at()` (beide bereits seit V0002 vorhanden) werden INNERHALB
-- ihres jeweiligen Schemas wiederverwendet (Punkt 5 des Auftrags) -- KEIN
-- Cross-Schema-Aufruf (rote Linie 5 bleibt gewahrt: energy ruft NIE eine
-- identity-Funktion, identity NIE eine energy-Funktion; Wiederverwendung
-- INNERHALB desselben Schemas ist davon unberuehrt).
--
-- =====================================================================
-- D4/A2 -- identity.standort_pii.crypto_key_id BEWUSST OHNE UNIQUE
-- (Abweichung vom endkunde_pii/anschlussnutzer_pii-Muster, V0002)
-- =====================================================================
-- identity.endkunde_pii/identity.anschlussnutzer_pii (V0002) tragen je ein
-- `UNIQUE(crypto_key_id)` -- Garantie "1 DEK je Subjekt". identity.
-- standort_pii tut das NICHT: ein Standort ist KEIN eigenes Datensubjekt,
-- sondern ein Attribut des Subjekts "Endkunde" (ADR-0010 D4) -- ALLE
-- Standorte eines Endkunden teilen sich denselben, bereits bei
-- identity.endkunde_pii vorhandenen crypto_key_id (1 Endkunden-DEK :
-- n Standorte). Ein zusaetzliches UNIQUE wuerde das strukturell verhindern
-- (zweiter Standort desselben Endkunden koennte den DEK nicht mehr
-- referenzieren). Die Invariante "Standort-DEK == Endkunden-DEK dieses
-- Standorts" ist NICHT per Cross-Namensraum-FK pruefbar (rote Linie 1/5 --
-- identity kennt energy.endkunde_id nicht) und bleibt daher, wie im ADR
-- ausdruecklich benannt, eine SERVICE-SEITIGE Pruefpflicht (kein DB-
-- Constraint dieser Migration deckt sie ab -- offener Punkt fuer die
-- Implementierung, s. Datei-Ende).
--
-- AAD-Pflicht (ADR-0010 D4, zentrale Sicherheitsauflage): das
-- Anwendungsverschluesselungslayout MUSS `standort_id` in die AAD
-- (Additional Authenticated Data) einbeziehen -- sonst liesse sich bei
-- gemeinsamem DEK ein Chiffrat unbemerkt zwischen zwei Standorten
-- desselben Endkunden umhaengen. Diese Migration selbst kann das nicht
-- erzwingen (AAD ist ein Laufzeit-/App-Layer-Konzept, kein DB-Constraint)
-- -- dokumentiert in den Spalten-Kommentaren unten als verbindliche Vorgabe
-- fuer den FieldCipherService-Aufrufer.
--
-- =====================================================================
-- Entscheidungen UEBER die woertliche ADR-Skizze hinaus (Kennzeichnungspflicht)
-- =====================================================================
--
-- (E1) energy.standort.status bekommt ein ECHTES CHECK-Constraint
--   (`ck_standort_status`), OBWOHL die ADR-Skizze (Abschnitt 4) dafuer nur
--   einen Kommentar zeigt (analog energy.zaehler.status/energy.messkanal.
--   status aus V0002, dort ebenfalls nur Kommentar-Konvention). Begruendung:
--   energy.standort ist -- anders als zaehler/messkanal -- eine NEUE Tabelle
--   in DIESER Migration; database-lead hat bereits fuer device.
--   geraet_zuordnung (V0010, ebenfalls eine neue Tabelle) ein echtes CHECK
--   auf status gesetzt. Fuer neu entworfene Tabellen ist die strengere
--   DB-seitige Durchsetzung die etabliertere Linie (s. auch V0005-
--   Nachtrag fuer energy.system.status) -- keine rueckwirkende Aenderung
--   bestehender Migrationen, nur eine Entscheidung fuer dieses NEUE Objekt.
--
-- (E2) energy.standort.pfad/ebene bekommen harmlose DEFAULTs
--   (`'{}'::uuid[]` bzw. `0`), OBWOHL die ADR-Skizze keine zeigt. Beide
--   Spalten werden IMMER vom Trigger ueberschrieben (s. u.) -- der Default
--   ist reine INSERT-Ergonomie (Aufrufer muss pfad/ebene nicht explizit
--   auf einen Platzhalter setzen, um die NOT-NULL-Spalte zu befriedigen),
--   AENDERT NICHTS an der Semantik "ausschliesslich Trigger-gepflegt".
--
-- (E3) identity.standort_pii bekommt einen zusaetzlichen Index auf
--   crypto_key_id (`ix_standort_pii_crypto_key`), den weder die ADR-Skizze
--   noch der Arbeitsauftrag woertlich nennen. Begruendung: KEIN
--   spekulativer Index -- ADR-0010 D4 beschreibt explizit den
--   Zugriffspfad "Shred-Report muss die Anzahl neutralisierter
--   Standort-PII-Zeilen belegen" (EndkundeService.shred(), neue
--   Shred-Dimension "Standort-PII"). Ohne Index auf crypto_key_id waere
--   dieser Lookup ("alle standort_pii-Zeilen mit crypto_key_id = X") ein
--   Sequential Scan -- bei wachsender Standort-Anzahl je Endkunde nicht
--   mehr trivial. Da crypto_key_id bewusst NICHT unique ist (s. o.), gibt
--   es -- anders als bei endkunde_pii/anschlussnutzer_pii, wo die
--   UNIQUE-Constraint automatisch einen Index mitliefert -- hier KEINEN
--   impliziten Index; dieser wird explizit ergaenzt.
--
-- (E4) identity.standort_pii.pii_status bekommt BEWUSST KEIN
--   CHECK-Constraint (anders als E1 fuer energy.standort.status) --
--   1:1-Uebernahme der identity.endkunde_pii/anschlussnutzer_pii-Konvention
--   (V0002, dort ebenfalls nur Kommentar "aktiv|gesperrt|geloescht", kein
--   CHECK). Diese Tabelle ist die woertlich vom ADR benannte Analogie zu
--   endkunde_pii -- ein Vokabular-Alleingang (z. B. zusaetzlich
--   "geschreddert") waere hier eine eigene, nicht ADR-gedeckte Entscheidung.
--   Die tatsaechliche pii_status-Uebergangs-Semantik nach einem
--   Endkunden-DEK-Shredding ist ausdruecklich App-Layer-Scope (ADR-0010 O7,
--   EndkundeService.shred()-Erweiterung) -- OFFENER PUNKT, nicht Teil
--   dieser Migration.
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- energy.standort (Tabelle + CHECKs + Self-FK + Indizes) -> Pfad-Trigger
-- (Funktion + Trigger) -> updated_at-Trigger (Wiederverwendung V0002) ->
-- energy.zaehler_standort (Tabelle + EXCLUDE + Index + updated_at-Trigger)
-- -> identity.standort_pii (Tabelle + Index + PII-Kommentare +
-- updated_at-Trigger).

-- =====================================================================
-- energy.standort -- PII-FREI (RL-1)
-- =====================================================================

CREATE TABLE energy.standort (
    id            uuid        PRIMARY KEY,             -- App: UUIDv7, KEIN DB-DEFAULT (Konvention V0002 S4)
    endkunde_id   uuid        NOT NULL REFERENCES energy.endkunde(id),
    parent_id     uuid,                                 -- NULL = Wurzel
    typ           text        NOT NULL,                  -- liegenschaft|gebaeude|bauteil|etage|einheit|raum
    pfad          uuid[]      NOT NULL DEFAULT '{}'::uuid[],  -- Vorfahren inkl. self; AUSSCHLIESSLICH Trigger-gepflegt (E2: Default = reine Ergonomie)
    ebene         int         NOT NULL DEFAULT 0,        -- AUSSCHLIESSLICH Trigger-gepflegt (E2)
    sortierung    int         NOT NULL DEFAULT 0,        -- Geschwisterreihenfolge (Label-Sortierung entfaellt, RL-1)
    klimareferenz text,                                  -- grobkoernige Stations-ID (D4, O2 -- compliance-director-Bestaetigung AUSSTEHEND)
    status        text        NOT NULL DEFAULT 'aktiv',  -- aktiv|stillgelegt -- NIE hart loeschen (D2.6), Ausnahme s. ck unten
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ux_standort_id_endkunde
        UNIQUE (id, endkunde_id),                        -- D2.1: FK-Ziel fuer den Self-FK unten

    CONSTRAINT fk_standort_parent_mandant
        FOREIGN KEY (parent_id, endkunde_id)
        REFERENCES energy.standort (id, endkunde_id),    -- D2.1: deklarative Mandantentreue, s. Datei-Kopf

    CONSTRAINT ck_standort_typ
        CHECK (typ IN ('liegenschaft', 'gebaeude', 'bauteil', 'etage', 'einheit', 'raum')),

    CONSTRAINT ck_standort_wurzel_typ
        CHECK (parent_id IS NOT NULL OR typ IN ('liegenschaft', 'gebaeude')),  -- D2.4

    CONSTRAINT ck_standort_ebene
        CHECK (ebene BETWEEN 0 AND 9),                   -- D2.3: hartes Tiefenlimit

    CONSTRAINT ck_standort_kein_selbst_parent
        CHECK (parent_id <> id),

    CONSTRAINT ck_standort_status
        CHECK (status IN ('aktiv', 'stillgelegt'))       -- E1
);

-- Index-Begruendungen (Auftrag: "Indizes mit Begruendung, keine
-- spekulativen Indizes") -- alle drei woertlich aus ADR-0010 Abschnitt 4:
--
-- GIN auf pfad: traegt die Kern-Query jeder spaeteren Auswertung
-- ("alle Zaehler/Messwerte unterhalb Knoten X", ADR D6) --
-- `pfad @> ARRAY[:knoten_id]` ist ein Containment-Praedikat, das OHNE
-- GIN-Index einen Sequential Scan mit Array-Vergleich je Zeile erzwaenge.
CREATE INDEX ix_standort_pfad ON energy.standort USING gin (pfad);

-- Partieller Index auf endkunde_id WHERE status='aktiv': ABAC-Hot-Path
-- (analog energy.nutzungsverhaeltnis/device.geraet_zuordnung, V0002/V0010)
-- -- "alle aktiven Standorte eines Endkunden" ist der Basis-Baumaufbau-Query
-- der Betriebs-UI (ADR-0010 §5 GET .../standorte); stillgelegte Knoten
-- muessen dafuer nicht mitgescannt werden.
CREATE INDEX ix_standort_endkunde ON energy.standort (endkunde_id) WHERE status = 'aktiv';

-- parent_id (nicht partiell): direkte Kind-Navigation ("Kinder von Knoten
-- X", z. B. Baum-UI-Lazy-Load pro Ebene) UND Performance-Unterstuetzung
-- fuer den Self-FK selbst (Postgres legt fuer FK-Spalten KEINEN Index
-- automatisch an -- ohne diesen Index waere jede Reparent-/Loesch-Pruefung
-- des FK ein Sequential Scan ueber die gesamte Tabelle).
CREATE INDEX ix_standort_parent ON energy.standort (parent_id);

-- =====================================================================
-- Pfad-Trigger energy.standort_pfad_pflegen() -- das Herzstueck (D6/O4)
-- =====================================================================
--
-- Custom-GUC `edms.standort_reparent_intern` (transaktionslokal, s. u.):
-- signalisiert dem Trigger, dass eine UPDATE-Anweisung aus SEINEM EIGENEN
-- rekursiven Nachfahren-Update stammt (Reparent-Zweig, Schritt 4) -- ohne
-- dieses Signal wuerde der "parent_id unveraendert"-Zweig (s. u.) die dort
-- bewusst berechneten neuen pfad/ebene-Werte SOFORT wieder auf OLD
-- zuruecksetzen, weil bei den Nachfahren-Zeilen selbst parent_id NICHT
-- geaendert wird (nur pfad/ebene). Custom-GUCs mit Punkt im Namen
-- benoetigen KEINE Server-Konfiguration/keine Superuser-Rechte (PostgreSQL
-- >= 9.2, "Customized Options") -- jede Rolle kann sie per set_config()
-- setzen/lesen.
CREATE FUNCTION energy.standort_pfad_pflegen() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
    v_eltern_pfad            uuid[];
    v_eltern_ebene           int;
    v_alter_praefix_laenge   int;
    v_ebene_delta            int;
    v_max_nachfahren_relativ int;
BEGIN
    -- Interner Rekursions-Schritt (s. Schritt 4 unten): pfad/ebene sind
    -- bereits vorausberechnet -- unveraendert durchreichen, keine erneute
    -- Ableitung/Pruefung/Rekursion.
    IF TG_OP = 'UPDATE' AND current_setting('edms.standort_reparent_intern', true) = 'on' THEN
        RETURN NEW;
    END IF;

    -- =================================================================
    -- INSERT: pfad/ebene VOLLSTAENDIG aus dem Parent ableiten. Vom
    -- Aufrufer mitgeschickte pfad/ebene-Werte werden IMMER verworfen --
    -- diese Spalten sind ausschliesslich trigger-gepflegt (D6).
    -- =================================================================
    IF TG_OP = 'INSERT' THEN
        IF NEW.parent_id IS NULL THEN
            NEW.pfad  := ARRAY[NEW.id];
            NEW.ebene := 0;
        ELSE
            SELECT pfad, ebene INTO v_eltern_pfad, v_eltern_ebene
              FROM energy.standort
             WHERE id = NEW.parent_id AND endkunde_id = NEW.endkunde_id
             FOR SHARE;

            IF NOT FOUND THEN
                -- Der zusammengesetzte Self-FK (parent_id, endkunde_id)
                -- faengt denselben Fall ohnehin ab (NACH diesem
                -- BEFORE-Trigger) -- diese Meldung liefert nur den
                -- sprechenderen Fehler zuerst.
                RAISE EXCEPTION 'energy.standort: Parent % existiert nicht (fuer Endkunde %) -- Anlegen abgebrochen.',
                    NEW.parent_id, NEW.endkunde_id;
            END IF;

            IF v_eltern_ebene + 1 > 9 THEN
                RAISE EXCEPTION 'energy.standort: Tiefenlimit erreicht -- neuer Knoten unter % laege auf Ebene % (zulaessig: 0-9).',
                    NEW.parent_id, v_eltern_ebene + 1;
            END IF;

            NEW.pfad  := v_eltern_pfad || NEW.id;
            NEW.ebene := v_eltern_ebene + 1;
        END IF;
        RETURN NEW;
    END IF;

    -- =================================================================
    -- UPDATE, parent_id UNVERAENDERT: idempotent -- pfad/ebene bleiben
    -- EXAKT wie zuvor. Kein Rekursions-Update, keine Zyklus-/Tiefen-
    -- pruefung (Auftrag: "kein unnoetiges Rekursions-Update"). Erzwingt
    -- zugleich, dass pfad/ebene NIE ueber einen anderen Pfad als diesen
    -- Trigger veraendert werden -- ein versehentlich abweichend
    -- mitgeschickter Wert wird stillschweigend auf OLD zurueckgesetzt.
    -- =================================================================
    IF NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id THEN
        NEW.pfad  := OLD.pfad;
        NEW.ebene := OLD.ebene;
        RETURN NEW;
    END IF;

    -- =================================================================
    -- UPDATE, parent_id GEAENDERT -- Reparent. Der anspruchsvolle Fall.
    -- =================================================================

    -- (1) Neuen Pfad/Ebene aus dem NEUEN Parent ableiten (oder Wurzel).
    IF NEW.parent_id IS NULL THEN
        NEW.pfad  := ARRAY[NEW.id];
        NEW.ebene := 0;
    ELSE
        SELECT pfad, ebene INTO v_eltern_pfad, v_eltern_ebene
          FROM energy.standort
         WHERE id = NEW.parent_id AND endkunde_id = NEW.endkunde_id
         FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'energy.standort: neuer Parent % existiert nicht (fuer Endkunde %) -- Verschieben abgebrochen.',
                NEW.parent_id, NEW.endkunde_id;
        END IF;

        -- (2) Zyklus-Schutz (D2.2/D6): der neue Parent darf kein
        -- Nachfahre von NEW und nicht NEW selbst sein -- sonst haenge der
        -- Knoten unter seinen eigenen Ast. v_eltern_pfad enthaelt die
        -- GESAMTE Vorfahrenkette des neuen Parents inklusive dessen
        -- eigener id; taucht NEW.id darin auf, ist NEW Vorfahre (oder NEW
        -- selbst) des neuen Parents -> Zyklus.
        IF NEW.id = ANY (v_eltern_pfad) THEN
            RAISE EXCEPTION 'energy.standort: Verschieben von % unter % wuerde einen Zyklus erzeugen (Ziel-Parent ist Nachfahre oder der Knoten selbst).',
                NEW.id, NEW.parent_id;
        END IF;

        NEW.pfad  := v_eltern_pfad || NEW.id;
        NEW.ebene := v_eltern_ebene + 1;
    END IF;

    -- (3) Tiefenlimit VOR dem Rekursions-Update pruefen -- eine
    -- sprechende Meldung ist besser als ein nackter Constraint-Verstoss
    -- mitten in der Rekursion (Auftrag, D2.3). Relative Tiefe = groesste
    -- Ebene unter den BESTEHENDEN Nachfahren (vor dem Verschieben) minus
    -- der ALTEN Ebene des verschobenen Knotens.
    SELECT MAX(ebene) - OLD.ebene INTO v_max_nachfahren_relativ
      FROM energy.standort
     WHERE pfad @> ARRAY[NEW.id] AND id <> NEW.id;

    IF v_max_nachfahren_relativ IS NOT NULL
       AND NEW.ebene + v_max_nachfahren_relativ > 9 THEN
        RAISE EXCEPTION 'energy.standort: Verschieben abgebrochen -- mindestens ein Nachfahre von % laege auf Ebene % (zulaessig: 0-9).',
            NEW.id, NEW.ebene + v_max_nachfahren_relativ;
    END IF;

    -- (4) Rekursives Nachfahren-Update: der ALTE Praefix (OLD.pfad, Laenge
    -- OLD.ebene+1) wird durch den NEUEN Praefix (NEW.pfad) ersetzt -- der
    -- Teil UNTERHALB des verschobenen Knotens bleibt identisch, nur die
    -- Ebene verschiebt sich um das Delta. Invariante, auf der die
    -- Praefix-Slice-Arithmetik beruht: jeder Vorfahre X steht in JEDEM
    -- pfad-Array seiner Nachfahren an genau der Position X.ebene+1 (1-
    -- basiert) -- das gilt, WEIL pfad ausschliesslich durch Konkatenation
    -- (Eltern-pfad || eigene id) entsteht und NIE anders geschrieben wird.
    v_alter_praefix_laenge := OLD.ebene + 1;
    v_ebene_delta          := NEW.ebene - OLD.ebene;

    PERFORM set_config('edms.standort_reparent_intern', 'on', true);  -- true = transaktionslokal

    UPDATE energy.standort AS s
       SET pfad  = NEW.pfad || s.pfad[v_alter_praefix_laenge + 1 : array_length(s.pfad, 1)],
           ebene = s.ebene + v_ebene_delta
     WHERE s.pfad @> ARRAY[NEW.id]
       AND s.id <> NEW.id;

    PERFORM set_config('edms.standort_reparent_intern', 'off', true);

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_standort_pfad_pflegen
    BEFORE INSERT OR UPDATE ON energy.standort
    FOR EACH ROW EXECUTE FUNCTION energy.standort_pfad_pflegen();

-- Bekannte, dokumentierte Vereinfachungen (O4, Benchmark/Lock-Strategie
-- bleibt offener Punkt, s. Datei-Ende):
--   (a) Die Tiefen-Vorabpruefung (Schritt 3) haelt waehrend ihrer SELECT-
--       Abfrage KEINE Sperre auf die betroffenen Nachfahren -- ein
--       gleichzeitiges Einfuegen eines NEUEN, sehr tiefen Nachfahren
--       zwischen Vorpruefung und rekursivem UPDATE ist ein enges,
--       seltenes Zeitfenster; im schlimmsten Fall greift dafuer die harte
--       CHECK-Constraint (ck_standort_ebene) im rekursiven UPDATE selbst
--       (Transaktion rollt zurueck) -- nur mit generischer statt
--       sprechender Fehlermeldung fuer GENAU diesen Randfall.
--   (b) Keine explizite Batch-/Nachfahren-Obergrenze je Reparent-Vorgang
--       (ADR-0010 O4 nennt "Batch-Grenze" als offenen Punkt) -- diese
--       Migration erzwingt keine harte Obergrenze; das Tiefenlimit (max.
--       9 Ebenen) begrenzt die Nachfahren-Menge bereits strukturell,
--       ersetzt aber keinen echten Lastbenchmark bei ~10^4 Knoten/Endkunde
--       (ADR-0010 O4, database-lead, AUSSTEHEND -- diese Migration liefert
--       die Implementierung, nicht den Benchmark).
--   (c) Deadlock-Risiko bei sich ueberschneidenden, GLEICHZEITIGEN
--       Reparent-Operationen auf verschraenkten Teilbaeumen ist nicht
--       durch eine explizite Lock-Reihenfolge (z. B. globaler
--       Advisory-Lock je Endkunde) abgesichert -- vertretbar, da
--       Reparenting laut ADR "selten und explizit auditiert" ist; s. O4.

CREATE TRIGGER trg_standort_updated_at BEFORE UPDATE ON energy.standort
    FOR EACH ROW EXECUTE FUNCTION energy.set_updated_at();  -- Wiederverwendung V0002, Punkt 5 des Auftrags

-- =====================================================================
-- energy.zaehler_standort -- temporale Verortung (D3)
-- =====================================================================

CREATE TABLE energy.zaehler_standort (
    id          uuid        PRIMARY KEY,             -- App: UUIDv7, KEIN DB-DEFAULT
    zaehler_id  uuid        NOT NULL REFERENCES energy.zaehler(id),
    standort_id uuid        NOT NULL REFERENCES energy.standort(id),
    gueltig_von timestamptz NOT NULL,
    gueltig_bis timestamptz,                          -- NULL = aktuell
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    -- Verhindert zwei zeitlich UEBERLAPPENDE Verortungen desselben
    -- Zaehlers (ein physischer Zaehler steht zu einem Zeitpunkt an genau
    -- einem Ort) -- strukturell identisches Muster wie energy.
    -- nutzungsverhaeltnis (V0002) und device.geraet_zuordnung (V0010).
    -- btree_gist seit V0001 vorhanden. Kein CHECK auf
    -- "gueltig_bis > gueltig_von" noetig: der tstzrange()-Konstruktor
    -- selbst lehnt eine invertierte Reihenfolge (lower > upper) bereits
    -- zur Laufzeit ab (Postgres-Core-Verhalten), analog nutzungsverhaeltnis/
    -- geraet_zuordnung, die aus demselben Grund kein eigenes CHECK tragen.
    CONSTRAINT ex_zaehler_standort_no_overlap EXCLUDE USING gist (
        zaehler_id WITH =,
        tstzrange(gueltig_von, gueltig_bis) WITH &&
    )
);

-- Partieller Index auf standort_id WHERE gueltig_bis IS NULL (ADR-0010
-- Abschnitt 4, woertlich): Hot-Path "welche Zaehler sind AKTUELL an
-- Standort X verortet" (Kern-Query der Baum-Auswertung, s. u.) --
-- historische, bereits beendete Verortungen muessen dafuer nicht
-- mitgescannt werden. KEIN separater Index auf zaehler_id: die
-- EXCLUDE-Constraint oben legt bereits einen GiST-Index auf
-- (zaehler_id, tstzrange(...)) an, der Gleichheits-Lookups auf zaehler_id
-- mitbedient (analog device.geraet_zuordnung/energy.nutzungsverhaeltnis,
-- die aus demselben Grund ebenfalls keinen zusaetzlichen Index tragen).
CREATE INDEX ix_zaehler_standort_aktiv ON energy.zaehler_standort (standort_id)
    WHERE gueltig_bis IS NULL;

CREATE TRIGGER trg_zaehler_standort_updated_at BEFORE UPDATE ON energy.zaehler_standort
    FOR EACH ROW EXECUTE FUNCTION energy.set_updated_at();  -- Wiederverwendung V0002

-- =====================================================================
-- identity.standort_pii -- PII, feldverschluesselt, KEIN FK nach energy
-- (rote Linie 1/5, D4)
-- =====================================================================

CREATE TABLE identity.standort_pii (
    id              uuid        PRIMARY KEY,           -- App: UUIDv7, KEIN DB-DEFAULT
    pseudonym_id    uuid        NOT NULL UNIQUE,        -- = energy.standort.id, LOGISCHER Link, KEIN FK (D4)
    crypto_key_id   uuid        NOT NULL                -- BEWUSST OHNE UNIQUE (D4/A2, s. Datei-Kopf): 1 Endkunden-DEK : n Standorte
                    REFERENCES identity.subjekt_schluessel(id),
    bezeichnung_enc bytea       NOT NULL,                -- Label (D4: der PII-kritischere der beiden Werte), AAD MUSS standort_id enthalten
    anschrift_enc   bytea,                               -- NULL zulaessig unterhalb von liegenschaft/gebaeude (D4)
    geo_enc         bytea,
    pii_status      text        NOT NULL DEFAULT 'aktiv',  -- aktiv|gesperrt|geloescht (E4: Vokabular 1:1 aus identity.endkunde_pii, V0002)
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN identity.standort_pii.bezeichnung_enc IS
  'pii=true; grundlage=Art.6(1)(b); retention=an Endkunde gebunden; Loeschung=Krypto-Shredding des Endkunden-DEK (ADR-0010 D4, neue Shred-Dimension "Standort-PII" analog ADR-0005 §26 GB-C); Layout=nonce||ciphertext||tag (AES-256-GCM, FieldCipherService, analog V0002/V0010); AAD MUSS standort_id (=pseudonym_id) enthalten -- sonst waere ein Chiffrat-Umhaengen zwischen zwei Standorten DESSELBEN Endkunden (gemeinsamer DEK) kryptografisch nicht erkennbar (ADR-0010 D4, zentrale Sicherheitsauflage); ADR-0010 Abschnitt 4';
COMMENT ON COLUMN identity.standort_pii.anschrift_enc IS
  'pii=true; grundlage=Art.6(1)(b); retention=an Endkunde gebunden; Loeschung=Krypto-Shredding des Endkunden-DEK (ADR-0010 D4); NULL zulaessig ausser auf Wurzelknoten (liegenschaft/gebaeude ohne Parent) -- dort Pflichtfeld (App-Layer-Validierung, kein DB-CHECK: der Wurzel-Typ selbst ist ausschliesslich in energy.standort bekannt, KEIN Cross-Schema-Constraint moeglich, rote Linie 1/5); Layout/AAD wie bezeichnung_enc; ADR-0010 Abschnitt 4';
COMMENT ON COLUMN identity.standort_pii.geo_enc IS
  'pii=true; grundlage=Art.6(1)(b); retention=an Endkunde gebunden; Loeschung=Krypto-Shredding des Endkunden-DEK (ADR-0010 D4); optionale Geo-Koordinate, NIEMALS nach energy gespiegelt (RL-1/RL-3); Layout/AAD wie bezeichnung_enc; ADR-0010 Abschnitt 4';

-- (E3, s. Datei-Kopf) Shred-Report-Enumerationspfad: "alle standort_pii-
-- Zeilen mit diesem crypto_key_id" (EndkundeService.shred(), neue
-- Shred-Dimension "Standort-PII", ADR-0010 D4).
CREATE INDEX ix_standort_pii_crypto_key ON identity.standort_pii (crypto_key_id);

CREATE TRIGGER trg_standort_pii_updated_at BEFORE UPDATE ON identity.standort_pii
    FOR EACH ROW EXECUTE FUNCTION identity.set_updated_at();  -- Wiederverwendung V0002

-- =====================================================================
-- Offene Punkte (NICHT Teil dieser Migration, s. ADR-0010 Abschnitt 6)
-- =====================================================================
-- O2 (compliance-director): Bestaetigung, dass energy.standort.
--   klimareferenz grobkoernig genug ist (Stationseinzugsgebiet >=
--   Kreisebene) -- AUSSTEHEND. Sollte die Bestaetigung ausbleiben, ist
--   die Spalte vor Merge aus DIESER (noch nicht gemergten) Migration zu
--   entfernen -- append-only gilt erst NACH Merge.
-- O4 (database-lead): Lastbenchmark Reparent-Trigger bei ~10^4 Knoten je
--   Endkunde -- AUSSTEHEND, s. "Bekannte, dokumentierte Vereinfachungen"
--   oben. Diese Migration liefert die funktionale Implementierung; der
--   Benchmark selbst ist ausserhalb des Wegwerf-Container-Verifikations-
--   scopes dieses Auftrags.
-- Service-seitige Pruefung "Standort-DEK == Endkunden-DEK dieses
--   Standorts" (D4/A2) -- kein DB-Constraint moeglich (rote Linie 1/5),
--   Implementierungs-Scope des Standort-Moduls.
-- EndkundeService.shred()-Erweiterung um die Standort-PII-Dimension
--   inkl. Shred-Report-Nachweis (ADR-0010 D4/O7) -- Implementierungs-Scope.
