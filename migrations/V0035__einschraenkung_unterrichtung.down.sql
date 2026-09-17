-- V0035__einschraenkung_unterrichtung.down.sql
--
-- Rollback: Tabelle samt Indizes und Grants entfernen.
--
-- HINWEIS (Bestandsschutz): `energy.einschraenkung_unterrichtung` ist der
-- Nachweis nach Art. 18 Abs. 3 -- enthaelt sie Zeilen, geht mit diesem
-- Rollback der Beleg verloren, dass vor einer Aufhebung unterrichtet wurde.
-- Die zugehoerigen Audit-Zeilen (V0036) bleiben zwar bestehen und tragen den
-- Vorgang weiter, der steuerungsrelevante Zustand aber nicht. In einer
-- Umgebung mit echten Betroffenen ist dieser DOWN-Pfad daher NICHT ohne
-- vorherige Sicherung anzuwenden (Freigabe database-lead/compliance-director).

DROP TABLE IF EXISTS energy.einschraenkung_unterrichtung;
