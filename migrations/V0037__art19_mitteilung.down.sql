-- V0037__art19_mitteilung.down.sql
--
-- Rollback: Tabelle samt Indizes und Grants entfernen.
--
-- HINWEIS (Bestandsschutz): `nachweis.art19_mitteilung` ist der Nachweis, dass
-- der Empfaenger nach Art. 19 DSGVO unterrichtet wurde. Enthaelt sie Zeilen,
-- geht mit diesem Rollback der Beleg verloren -- und die zugehoerige
-- Arbeitsliste meldet die Pflicht danach wieder als offen (fail-closed, also
-- nicht gefaehrlich, aber irrefuehrend: sie war erfuellt). Die Audit-Zeilen
-- (V0038) bleiben bestehen und tragen den Vorgang weiter.
--
-- In einer Umgebung mit echten Einreichungen daher NICHT ohne vorherige
-- Sicherung anwenden (Freigabe database-lead/compliance-director).

DROP TABLE IF EXISTS nachweis.art19_mitteilung;
