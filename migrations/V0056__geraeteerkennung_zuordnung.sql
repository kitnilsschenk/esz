-- V0056 — Geräte- und Anlagengruppen-Erkennung (TB-05, [Q3] Kap. 5).
--
-- WORTLAUT DER AUFLAGE:
--   „Das Messsystem muss in der Lage sein, einen gewissen Anteil des
--    Gesamtenergieverbrauchs des jeweiligen Energieträgers bei dem
--    entsprechenden Endkunden bestimmten Geräte- oder Anlagengruppen
--    zuzuordnen."
--
--   Projektjahr 1: 20 %   2: 25 %   3: 30 %   4: 35 %   5: 40 %
--
--   „Der Antragssteller hat […] anzugeben, […] ob es sich um eine
--    Direktmessung, eine Algorithmen-Erkennung, ein Vorschaltgerät oder eine
--    sonstige Erhebungsmethode handelt und mit welcher Genauigkeit diese
--    Zuordnung erfolgen soll."
--
--   „In Fällen, in denen eine Geräteerkennung nicht sinnvoll ist,
--    beispielsweise bei Systemen, die nur ein Gerät umfassen, gelten die für
--    Geräteerkennung genannten Anforderungen pauschal als erfüllt."
--
--   „Die Erkennungsraten sind nicht kumulativ, in Jahr 5 sind insgesamt nicht
--    100 sondern mindestens 40 Prozent des Energieverbrauchs Geräten
--    zuzuordnen."
--
-- WARUM DIE BESTEHENDEN TABELLEN FORTGESCHRIEBEN WERDEN
-- -----------------------------------------------------
-- `energy.geraetegruppe` und `energy.geraetegruppe_kanal` existieren seit
-- V0002 als „TB-05-Vorbereitung" — und sind seither von KEINER Zeile Code
-- benutzt worden und leer. Sie bekommen jetzt, was der Auflagentext verlangt,
-- statt daneben eine zweite, fast gleiche Tabelle zu stellen. Zwei Orte fuer
-- dieselbe Zuordnung waeren die naechste Falle; dieselbe Begruendung, mit der
-- V0047 die Spalte `verweigerbar` von `consent.zweck` entfernt hat.
--
-- WAS DER VORBEREITUNG GEFEHLT HAT, UM DIE QUOTE RECHNEN ZU KOENNEN
-- -----------------------------------------------------------------
-- 1. **Die Methode.** Kap. 5 verlangt ihre Angabe ausdruecklich. Ohne sie ist
--    eine gemessene Zuordnung von einer geschaetzten nicht zu unterscheiden —
--    und der Unterschied ist genau das, was die Behoerde wissen will.
-- 2. **Die Genauigkeit.** Ebenfalls ausdruecklich verlangt. Pflicht, sobald
--    NICHT direkt gemessen wird: Bei einer Direktmessung ist die Genauigkeit
--    die des Messgeraets und steht am Zaehler; bei einer Schaetzung ist sie
--    eine eigene Aussage, die jemand treffen muss.
-- 3. **Die Topologie.** Misst der Kanal eine UNTERMESSUNG (sein Verbrauch
--    steckt schon in der Hauptmessung) oder einen eigenen Zaehler daneben?
--    Ohne diese Angabe ist die Quote nicht rechenbar, sondern geraten:
--    Summiert man Haupt- und Untermessung, zaehlt man denselben Strom
--    zweimal.
-- 4. **Die Gueltigkeit.** Eine Zuordnung endet, wenn ein Zaehler umgeklemmt
--    wird. Die alte Tabelle war append-only OHNE Zeitraum — eine Zuordnung
--    liess sich anlegen, aber nie beenden, und die Quote haette rueckwirkend
--    fuer alle Zeiten gegolten.
--
-- DER CONSTRAINT, DER DIE QUOTE ERST BELASTBAR MACHT
-- --------------------------------------------------
-- `ex_geraetegruppe_kanal_ein_kanal_eine_gruppe`: Ein Messkanal darf zu einem
-- Zeitpunkt hoechstens EINER Gruppe zugeordnet sein. Ohne ihn liesse sich
-- derselbe Kanal zwei Gruppen zuordnen, und sein Verbrauch ginge doppelt in
-- den Zaehler der Quote — eine Zuordnungsquote von 140 % waere schreibbar.
--
-- **Damit ist die Algorithmen-Erkennung, die EINEN Kanal auf MEHRERE Gruppen
-- aufteilt, in diesem Modell noch nicht abbildbar.** Das ist bewusst so: Eine
-- Aufteilung braucht eine Summenpruefung ueber alle Anteile eines Kanals, und
-- die ist keine Spalte, sondern eine eigene Entscheidung
-- (`device-recognition-engineer` + `database-lead`). Gebaut ist der Fall, den
-- das Merkblatt zuerst nennt und der ohne Forschung tragfaehig ist:
-- Direktmessung und Vorschaltgeraet. `methode='algorithmus'` ist zugelassen,
-- solange die Zuordnung EINEN Kanal EINER Gruppe zuweist.
--
-- Review-Bedarf: `device-recognition-engineer` (Fachlichkeit),
-- `database-lead` (Constraints), `bafa-export-engineer` (Quoten-Nachweis).

-- =====================================================================
-- energy.geraetegruppe_kanal — die Zuordnung, jetzt mit allem, was sie braucht
-- =====================================================================
ALTER TABLE energy.geraetegruppe_kanal
    ADD COLUMN methode                      text          NOT NULL DEFAULT 'direktmessung',
    ADD COLUMN genauigkeit_pct              numeric(5,2),
    ADD COLUMN im_gesamtverbrauch_enthalten boolean       NOT NULL DEFAULT true,
    ADD COLUMN gueltig_von                  date          NOT NULL DEFAULT '2000-01-01',
    ADD COLUMN gueltig_bis                  date,
    ADD COLUMN beendet_grund                text;

-- Die DEFAULTs oben existieren nur, damit `ADD COLUMN NOT NULL` auf einer
-- (leeren) Tabelle zulaessig ist. Sie werden sofort wieder entfernt: Eine
-- Methode, eine Topologie und ein Gueltigkeitsbeginn sind Angaben, die
-- jemand TREFFEN muss — ein stiller Default waere genau die Vorbelegung, die
-- niemand mehr sieht (DS-02-Gedanke, hier auf Fachdaten angewandt).
ALTER TABLE energy.geraetegruppe_kanal
    ALTER COLUMN methode                      DROP DEFAULT,
    ALTER COLUMN im_gesamtverbrauch_enthalten DROP DEFAULT,
    ALTER COLUMN gueltig_von                  DROP DEFAULT;

-- `anteil_prozent` bekommt eine verbindliche Bedeutung statt einer vagen.
UPDATE energy.geraetegruppe_kanal SET anteil_prozent = 100 WHERE anteil_prozent IS NULL;
ALTER TABLE energy.geraetegruppe_kanal
    ALTER COLUMN anteil_prozent TYPE numeric(5,2),
    ALTER COLUMN anteil_prozent SET NOT NULL,
    ALTER COLUMN anteil_prozent SET DEFAULT 100;

ALTER TABLE energy.geraetegruppe_kanal
    ADD CONSTRAINT ck_geraetegruppe_kanal_methode CHECK (
        methode IN ('direktmessung', 'algorithmus', 'vorschaltgeraet', 'sonstige')
    ),
    -- Kap. 5 verlangt die Angabe der Genauigkeit. Pflicht ueberall dort, wo
    -- NICHT direkt gemessen wird: Bei einer Direktmessung ist sie die des
    -- Messgeraets, bei einer Schaetzung eine eigene Aussage.
    ADD CONSTRAINT ck_geraetegruppe_kanal_genauigkeit CHECK (
        (methode = 'direktmessung' OR genauigkeit_pct IS NOT NULL)
        AND (genauigkeit_pct IS NULL OR (genauigkeit_pct > 0 AND genauigkeit_pct <= 100))
    ),
    ADD CONSTRAINT ck_geraetegruppe_kanal_anteil CHECK (anteil_prozent > 0 AND anteil_prozent <= 100),
    ADD CONSTRAINT ck_geraetegruppe_kanal_gueltigkeit CHECK (gueltig_bis IS NULL OR gueltig_bis > gueltig_von),
    -- Ein Grund gehoert zum Ende, nicht daneben.
    ADD CONSTRAINT ck_geraetegruppe_kanal_beendet_grund CHECK (
        (gueltig_bis IS NULL AND beendet_grund IS NULL) OR (gueltig_bis IS NOT NULL AND beendet_grund IS NOT NULL)
    );

-- Der Primaerschluessel traegt jetzt die Historie: Derselbe Kanal kann
-- derselben Gruppe spaeter erneut zugeordnet werden.
ALTER TABLE energy.geraetegruppe_kanal DROP CONSTRAINT geraetegruppe_kanal_pkey;
ALTER TABLE energy.geraetegruppe_kanal
    ADD CONSTRAINT geraetegruppe_kanal_pkey PRIMARY KEY (geraetegruppe_id, messkanal_id, gueltig_von);

-- EIN KANAL, EINE GRUPPE, ZU EINEM ZEITPUNKT.
-- Der Constraint, ohne den eine Quote von 140 % schreibbar waere.
ALTER TABLE energy.geraetegruppe_kanal
    ADD CONSTRAINT ex_geraetegruppe_kanal_ein_kanal_eine_gruppe
    EXCLUDE USING gist (
        messkanal_id WITH =,
        daterange(gueltig_von, gueltig_bis, '[)') WITH &&
    );

COMMENT ON TABLE energy.geraetegruppe_kanal IS
  'Zuordnung eines Messkanals zu einer Geraete-/Anlagengruppe (TB-05, [Q3] Kap. 5). pii=false. Traegt Methode und Genauigkeit, weil das Merkblatt beides ausdruecklich verlangt, sowie die Topologie (Untermessung?) und den Gueltigkeitszeitraum, ohne die die Zuordnungsquote nicht rechenbar waere.';
COMMENT ON COLUMN energy.geraetegruppe_kanal.methode IS
  'direktmessung|algorithmus|vorschaltgeraet|sonstige ([Q3] Kap. 5, woertlich). Eine gemessene Zuordnung ist etwas anderes als eine geschaetzte, und der Unterschied ist genau das, was die Bewilligungsbehoerde wissen will.';
COMMENT ON COLUMN energy.geraetegruppe_kanal.genauigkeit_pct IS
  'Erwartete Genauigkeit der Zuordnung in Prozent ([Q3] Kap. 5). Pflicht, sobald NICHT direkt gemessen wird: bei Direktmessung ist die Genauigkeit die des Messgeraets und steht am Zaehler, bei einer Schaetzung ist sie eine eigene Aussage.';
COMMENT ON COLUMN energy.geraetegruppe_kanal.im_gesamtverbrauch_enthalten IS
  'true = Untermessung (der Verbrauch steckt bereits in der Hauptmessung und darf im NENNER der Quote nicht zusaetzlich gezaehlt werden). false = eigener Zaehler neben der Hauptmessung (zaehlt in Zaehler UND Nenner). Ohne diese Angabe ist die Quote nicht rechenbar, sondern geraten.';
COMMENT ON COLUMN energy.geraetegruppe_kanal.anteil_prozent IS
  'Anteil des Kanalverbrauchs, der dieser Gruppe zuzurechnen ist. Bei Direktmessung 100. Eine Aufteilung EINES Kanals auf MEHRERE Gruppen ist in diesem Modell nicht abbildbar (s. Exclusion-Constraint) — sie braucht eine Summenpruefung und damit eine eigene Entscheidung.';

-- =====================================================================
-- Die Ausnahme aus Kap. 5 — „gelten pauschal als erfuellt"
-- =====================================================================
-- Sie steht am SYSTEM, weil das Merkblatt sie dort verortet („bei Systemen,
-- die nur ein Gerät umfassen"). Ein Grund ist Pflicht: „pauschal erfuellt"
-- ohne Begruendung ist gegenueber der Behoerde keine Feststellung, sondern
-- eine Behauptung.
--
-- WICHTIG: Die Ausnahme veraendert die berechnete Quote NICHT. Sie wird der
-- Auskunft danebengestellt, damit ein Mensch die Wuerdigung vornimmt. Eine
-- Quote, die sich durch ein Haekchen von 12 % auf „erfuellt" hebt, waere
-- genau die Zahl, der niemand mehr trauen kann.
ALTER TABLE energy.system
    ADD COLUMN geraeteerkennung_entbehrlich       boolean NOT NULL DEFAULT false,
    ADD COLUMN geraeteerkennung_entbehrlich_grund text,
    ADD CONSTRAINT ck_system_geraeteerkennung_entbehrlich CHECK (
        (NOT geraeteerkennung_entbehrlich AND geraeteerkennung_entbehrlich_grund IS NULL)
     OR (geraeteerkennung_entbehrlich AND length(btrim(geraeteerkennung_entbehrlich_grund)) > 0)
    );

COMMENT ON COLUMN energy.system.geraeteerkennung_entbehrlich IS
  'pii=false; Feststellung nach [Q3] Kap. 5: Wo eine Geraeteerkennung nicht sinnvoll ist (z. B. ein System mit nur einem Geraet), gelten die Anforderungen pauschal als erfuellt. Veraendert die BERECHNETE Quote NICHT — sie wird der Auskunft danebengestellt, die Wuerdigung trifft ein Mensch.';
COMMENT ON COLUMN energy.system.geraeteerkennung_entbehrlich_grund IS
  'Pflicht, sobald die Entbehrlichkeit vermerkt ist. „Pauschal erfuellt" ohne Begruendung ist gegenueber der Bewilligungsbehoerde keine Feststellung, sondern eine Behauptung.';

-- =====================================================================
-- Grants
-- =====================================================================
-- `edms_app` hat auf `energy.*` bereits die noetigen Rechte (V0002); die
-- neuen Spalten sind davon erfasst. Kein neuer Grant noetig — einer, den
-- niemand braucht, ist nur ein Risiko.
