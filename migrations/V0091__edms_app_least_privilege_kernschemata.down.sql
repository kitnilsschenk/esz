-- Down zu V0091.
--
-- Nimmt `edms_app` die Rechte auf den Kernschemata wieder ab.
--
-- ACHTUNG, was das bedeutet: Danach kann die Anwendung unter ihrer eigenen
-- Laufzeitrolle nicht mehr arbeiten -- praktisch jede Fach-Route scheitert
-- mit "permission denied". Sie laeuft dann nur noch, solange sie als
-- Eigentuemer- oder Superuser-Rolle verbindet, also in dem Zustand, den
-- V0091 gerade beendet hat.
--
-- Das ist KEIN Grund, den Rueckbau zu scheuen: Er stellt exakt den Stand vor
-- V0091 wieder her, und der war ueber Monate der normale Betriebszustand.
-- Wer zurueckbaut, sollte nur wissen, dass er damit auch die Testbarkeit des
-- Rollenmodells zurueckbaut.
--
-- Die Schema-USAGE auf `identity`/`measurement` geht mit zurueck. Damit sind
-- die aus V0044/V0048/V0019 stammenden Tabellenrechte wieder unausuebbar --
-- genau wie vor V0091. Der Zustand ist unsinnig, aber er ist der
-- dokumentierte Vorzustand, und eine Down-Migration stellt ihn her, statt
-- ihn zu verbessern.

-- =====================================================================
-- (1) Tabellenrechte
-- =====================================================================
REVOKE ALL ON energy.endkunde                                  FROM edms_app;
REVOKE ALL ON energy.anschlussnutzer                           FROM edms_app;
REVOKE ALL ON energy.system                                    FROM edms_app;
REVOKE ALL ON energy.zaehler                                   FROM edms_app;
REVOKE ALL ON energy.messkanal                                 FROM edms_app;
REVOKE ALL ON energy.nutzungsverhaeltnis                       FROM edms_app;
REVOKE ALL ON energy.zaehler_standort                          FROM edms_app;
REVOKE ALL ON energy.messkonzept_version                       FROM edms_app;
REVOKE ALL ON energy.messkonzept_version_energietraeger        FROM edms_app;
REVOKE ALL ON energy.geraetegruppe_kanal                       FROM edms_app;
REVOKE ALL ON energy.endkunde_shred_antrag                     FROM edms_app;
REVOKE ALL ON energy.messkonzept                               FROM edms_app;
REVOKE ALL ON energy.geraetegruppe                             FROM edms_app;
REVOKE ALL ON energy.einschraenkung_unterrichtung              FROM edms_app;
REVOKE ALL ON energy.standort                                  FROM edms_app;
REVOKE ALL ON energy.baseline_periode                          FROM edms_app;

-- Hier NICHT `ALL`: `messkonzept_version_energietraeger_system` trug schon
-- vor V0091 `SELECT, INSERT` (aus V0068). V0091 hat nur `DELETE` ergaenzt --
-- also geht auch nur `DELETE` zurueck. Ein `REVOKE ALL` wuerde zwei fremde
-- Grants mitnehmen und den Vorzustand VERFEHLEN.
REVOKE DELETE ON energy.messkonzept_version_energietraeger_system FROM edms_app;

REVOKE ALL ON identity.endkunde_pii        FROM edms_app;
REVOKE ALL ON identity.anschlussnutzer_pii FROM edms_app;
REVOKE ALL ON identity.subjekt_schluessel  FROM edms_app;
REVOKE ALL ON identity.standort_pii        FROM edms_app;
-- `identity.einwilligung_beleg` und `identity.widerspruch_beleg` bleiben
-- unberuehrt: Ihre Rechte stammen aus V0044/V0048, nicht aus V0091.

REVOKE ALL ON device.geraet_zuordnung FROM edms_app;
REVOKE ALL ON device.schluessel       FROM edms_app;

REVOKE SELECT ON measurement.messwert FROM edms_app;
-- `measurement.messwert_tag` bleibt unberuehrt (V0019).

-- =====================================================================
-- (2) Schema-USAGE
-- =====================================================================
-- `energy` NICHT anfassen -- die USAGE dort stammt aus V0023.
REVOKE USAGE ON SCHEMA identity    FROM edms_app;
REVOKE USAGE ON SCHEMA device      FROM edms_app;
REVOKE USAGE ON SCHEMA measurement FROM edms_app;

COMMENT ON SCHEMA identity IS
  'PII-Namensraum (ADR-0004 §12), physisch separierbar, kein Cross-Schema-FK.';
