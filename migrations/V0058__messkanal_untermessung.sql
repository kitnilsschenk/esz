-- V0058 — Die Untermessung wird eine Eigenschaft des MESSKANALS.
--
-- DER FEHLER, DEN DIESE MIGRATION BEHEBT
-- --------------------------------------
-- Die Einsparberechnung summiert ALLE aktiven Messkanaele der Zaehler eines
-- Systems (`analytics-messwert-monat.repository.ts`). Misst ein Kanal eine
-- Untermessung — also einen TEIL dessen, was die Hauptmessung ohnehin schon
-- erfasst —, zaehlt sie denselben Strom mehrfach.
--
-- Sichtbar wurde das beim ersten Lauf des Demo-Datengenerators: Ein Bestand
-- mit einer Hauptmessung und zwei Untermessungen wies trotz 12 Prozent
-- WENIGER Verbrauch eine Einsparung von MINUS 18 154 kWh aus. Die Zahl, die
-- gegenueber der Bewilligungsbehoerde die Foerderung traegt, war damit falsch —
-- und zwar in beide Richtungen, je nachdem ob die Untermessungen im Baseline-
-- oder im Nachweisjahr hinzukamen.
--
-- WARUM DIE INFORMATION BISHER AN DER FALSCHEN STELLE STAND
-- ---------------------------------------------------------
-- Es gab sie schon: `energy.geraetegruppe_kanal.im_gesamtverbrauch_enthalten`
-- (V0056, TB-05). Sie hing aber an der ZUORDNUNG eines Kanals zu einer
-- Geraetegruppe — und die ist optional. Ein Unterzaehler, den niemand einer
-- Gruppe zugeordnet hat, war fuer die Berechnung von einer Hauptmessung nicht
-- zu unterscheiden. Die Einsparzahl haette damit davon abgehangen, ob jemand
-- die Geraeteerkennung gepflegt hat: zwei fachlich verschiedene Dinge.
--
-- Ob ein Zaehler eine Teilmenge eines anderen misst, ist eine Eigenschaft der
-- MESSSTELLEN-TOPOLOGIE. Sie steht beim Einbau fest, lange bevor jemand ueber
-- Geraetegruppen nachdenkt. Deshalb gehoert sie an den Messkanal.
--
-- EINE WAHRHEIT, NICHT ZWEI
-- -------------------------
-- `im_gesamtverbrauch_enthalten` entfaellt ersatzlos. Zwei Spalten mit
-- derselben Aussage divergieren, sobald eine von beiden geaendert wird — und
-- welche dann gilt, koennte hinterher niemand mehr sagen. Die
-- Zuordnungsquote (TB-05) liest die Topologie ab jetzt vom Kanal; die API
-- nimmt sie beim Zuordnen nicht mehr entgegen, sondern leitet sie ab.
--
-- BESTANDSDATEN
-- -------------
-- Der Default `false` bedeutet: Jeder heute vorhandene Kanal gilt als
-- Hauptmessung — das ist genau das bisherige Verhalten, also keine stille
-- Aenderung an bereits gerechneten Zahlen. Wo eine Zuordnung den Kanal
-- bereits als Untermessung gefuehrt hat, wird das uebernommen (UPDATE unten):
-- Diese Angabe hat ein Mensch getroffen, und sie geht nicht verloren.
--
-- Bereits gerechnete `analytics.berechnungslauf`-Zeilen bleiben unveraendert.
-- Sie sind append-only und tragen die Zahlen, die zum Zeitpunkt ihrer
-- Erstellung galten; ein neuer Lauf rechnet richtig, und der Unterschied ist
-- ueber `ersetzt_lauf_id` nachvollziehbar.
--
-- Review-Bedarf: `database-lead`, `savings-engineer` (Einsparlogik),
-- `device-recognition-engineer` (TB-05-Quote).

-- =====================================================================
-- energy.messkanal — die Topologie
-- =====================================================================
ALTER TABLE energy.messkanal
    ADD COLUMN ist_untermessung boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN energy.messkanal.ist_untermessung IS
  'pii=false; true = dieser Kanal misst eine TEILMENGE dessen, was ein anderer Kanal desselben Systems bereits erfasst (Untermessung). Die Einsparberechnung laesst solche Kanaele aus, sonst zaehlte sie denselben Verbrauch mehrfach; die Zuordnungsquote (TB-05) nimmt sie in den ZAEHLER, aber nicht in den NENNER. false = eigene Messstelle, deren Verbrauch nirgends sonst enthalten ist.';

-- Die bereits getroffene fachliche Angabe aus V0056 uebernehmen, bevor die
-- Spalte dort verschwindet. `bool_or`: Sobald EINE Zuordnung den Kanal als
-- Untermessung gefuehrt hat, ist er eine — die Topologie ist eine Eigenschaft
-- des Kanals, nicht des Zeitraums.
UPDATE energy.messkanal mk
   SET ist_untermessung = true
 WHERE EXISTS (
       SELECT 1
         FROM energy.geraetegruppe_kanal k
        WHERE k.messkanal_id = mk.id
          AND k.im_gesamtverbrauch_enthalten
 );

-- =====================================================================
-- energy.geraetegruppe_kanal — die doppelte Aussage entfaellt
-- =====================================================================
ALTER TABLE energy.geraetegruppe_kanal
    DROP COLUMN im_gesamtverbrauch_enthalten;

COMMENT ON TABLE energy.geraetegruppe_kanal IS
  'Zuordnung eines Messkanals zu einer Geraete-/Anlagengruppe (TB-05, [Q3] Kap. 5). pii=false. Traegt Methode und Genauigkeit, weil das Merkblatt beides ausdruecklich verlangt, sowie den Gueltigkeitszeitraum. Die Messstellen-Topologie (Untermessung?) steht seit V0058 am Messkanal selbst — sie ist eine Eigenschaft der Messstelle, nicht der Zuordnung, und die Einsparberechnung braucht sie unabhaengig davon, ob eine Gruppe gepflegt wurde.';
