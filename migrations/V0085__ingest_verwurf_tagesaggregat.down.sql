-- Down zu V0085 (Auflage C-6).
--
-- ACHTUNG, was hier verloren geht: Mit der Tabelle verschwindet die
-- Verwurf-Zaehlung. Anders als bei einem Fach-Datenverlust gibt es dafuer
-- KEINE zweite Quelle — der Verwurf schreibt bewusst weder eine
-- Quarantaene-Zeile noch ein Audit-Ereignis (A12-13), und der
-- In-Prozess-Zaehler ueberlebt keinen Neustart. Wer diese Tabelle
-- zurueckbaut, nachdem das Gate scharf war, loescht den einzigen Beleg
-- darueber, wie oft es gegriffen hat.
--
-- In einer Installation mit scharfgeschaltetem Gate gehoert dieser Rueckbau
-- deshalb nicht in einen beilaeufigen Rollback. Er ist fuer den Fall
-- gedacht, dass die Migration in einer Umgebung zurueckgenommen wird, in der
-- nie ein Uplink verworfen wurde.

DROP TABLE IF EXISTS ingest.verwurf_tagesaggregat;

-- `GRANT USAGE ON SCHEMA ingest` bleibt: Der Worker hielt es schon vor
-- dieser Migration (V0011 legt das Schema und seine Betriebstabellen an).
-- Es hier zu entziehen, naehme ihm Rechte, die nicht aus dieser Migration
-- stammen -- ein Rueckbau, der mehr abraeumt als er gebaut hat, ist der
-- Fehler, den `.claude/rules/database-migrations.md` mit der
-- Paarungs-Pflicht verhindern will.
