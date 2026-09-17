-- Down zu V0058 (Untermessung am Messkanal).
--
-- Der Rueckbau stellt `energy.geraetegruppe_kanal.im_gesamtverbrauch_enthalten`
-- wieder her und fuellt sie aus der Kanal-Eigenschaft. Das ist verlustfrei in
-- der einen Richtung, in der es darauf ankommt: Vor V0058 war die Angabe je
-- ZUORDNUNG moeglich, danach je KANAL — mehrere Zuordnungen desselben Kanals
-- tragen nach dem Rueckbau denselben Wert.
--
-- Ein Unterschied zwischen ihnen kann nach V0058 nicht mehr entstanden sein
-- (die Spalte gab es nicht), und ein VOR V0058 vorhandener Unterschied ist
-- durch die Uebernahme im Up-Skript ohnehin schon zu einem Kanal-Wert
-- verschmolzen. Der Rueckbau kann diesen Unterschied also nicht
-- wiederherstellen — er hat ihn nicht verloren, er war bereits fort.
--
-- WAS DER RUECKBAU BEDEUTET: Die Einsparberechnung zaehlt danach wieder
-- Haupt- und Untermessungen zusammen und weist damit fuer Bestaende mit
-- Untermessungen falsche Einsparungen aus. Wer zurueckbaut, sollte wissen,
-- warum.

ALTER TABLE energy.geraetegruppe_kanal
    ADD COLUMN im_gesamtverbrauch_enthalten boolean NOT NULL DEFAULT true;

UPDATE energy.geraetegruppe_kanal k
   SET im_gesamtverbrauch_enthalten = mk.ist_untermessung
  FROM energy.messkanal mk
 WHERE mk.id = k.messkanal_id;

ALTER TABLE energy.geraetegruppe_kanal
    ALTER COLUMN im_gesamtverbrauch_enthalten DROP DEFAULT;

COMMENT ON COLUMN energy.geraetegruppe_kanal.im_gesamtverbrauch_enthalten IS
  'true = Untermessung (der Verbrauch steckt bereits in der Hauptmessung und darf im NENNER der Quote nicht zusaetzlich gezaehlt werden). false = eigener Zaehler neben der Hauptmessung (zaehlt in Zaehler UND Nenner). Ohne diese Angabe ist die Quote nicht rechenbar, sondern geraten.';

COMMENT ON TABLE energy.geraetegruppe_kanal IS
  'Zuordnung eines Messkanals zu einer Geraete-/Anlagengruppe (TB-05, [Q3] Kap. 5). pii=false. Traegt Methode und Genauigkeit, weil das Merkblatt beides ausdruecklich verlangt, sowie die Topologie (Untermessung?) und den Gueltigkeitszeitraum, ohne die die Zuordnungsquote nicht rechenbar waere.';

ALTER TABLE energy.messkanal
    DROP COLUMN ist_untermessung;
