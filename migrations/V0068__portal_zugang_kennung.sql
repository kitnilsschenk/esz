-- V0068__portal_zugang_kennung.sql
--
-- Die Anmeldekennung des Portal-Zugangs.
--
-- =====================================================================
-- Anlass
-- =====================================================================
-- V0066 hat den Zugangscode gebaut: einmalig, gehasht, nach dem Einloesen
-- verbraucht. Beim Verdrahten des Anmeldewegs faellt auf, dass damit die
-- ZWEITE Anmeldung nicht funktioniert — der Kunde hat dann ein Passwort, aber
-- nichts, womit er sagen koennte, WER er ist. Der Code ist weg, und die
-- `endkunde_id` ist eine UUID, die niemand abtippt.
--
-- Es braucht also eine kurze, nicht geheime Kennung, die neben dem Code im
-- Brief steht und dauerhaft bleibt.
--
-- =====================================================================
-- Warum nicht geheim
-- =====================================================================
-- Die Kennung ist ein Benutzername, kein Schluessel. Sie darf bekannt sein;
-- was schuetzt, ist das Passwort. Das ist auch der Grund, warum sie NICHT
-- gehasht wird: Der Anmeldepfad muss sie nachschlagen koennen, und ein
-- gehashter Benutzername waere ein Suchproblem ohne Sicherheitsgewinn.
--
-- Sie ist trotzdem ZUFAELLIG und nicht fortlaufend: Eine Nummernfolge
-- verriete, wie viele Endkunden es gibt und in welcher Reihenfolge sie
-- angelegt wurden, und sie liesse sich durchprobieren, um gueltige Kennungen
-- zu sammeln. Beides ist unnoetig; Zufall kostet hier nichts.
--
-- Format `EK-XXXXXX` aus einem Alphabet ohne verwechselbare Zeichen (kein
-- 0/O, kein 1/I/L) — sie wird von Papier abgetippt, und ein Zeichendreher
-- fuehrt sonst zu einem Anmeldefehler, den niemand versteht.
--
-- =====================================================================
-- NOT NULL erst nach dem Backfill
-- =====================================================================
-- `portal.zugang` ist leer (V0066 ist von heute, es gibt keinen Zugang), der
-- Backfill unten trifft also nichts. Er steht trotzdem da: Eine Migration,
-- die sich darauf verlaesst, dass eine Tabelle leer ist, ist genau dann
-- falsch, wenn sie zum zweiten Mal irgendwo laeuft.

ALTER TABLE portal.zugang
    ADD COLUMN kennung text;

-- `gen_random_bytes` waere pgcrypto — das ist im EDMS bewusst NICHT
-- installiert (V0003-Kopf: "PG16-Core seit PG13, KEIN pgcrypto"). `md5` ueber
-- eine zufaellige UUID reicht hier: Der Backfill trifft heute keine Zeile,
-- und die eigentliche Erzeugung passiert im Anwendungscode mit
-- `crypto.randomInt`. `translate` bildet die beiden Hex-Ziffern ab, die das
-- Alphabet nicht kennt (0 und 1 sind mit O und I verwechselbar).
UPDATE portal.zugang
   SET kennung = 'EK-' || upper(translate(substr(md5(gen_random_uuid()::text), 1, 6), '01', 'pq'))
 WHERE kennung IS NULL;

ALTER TABLE portal.zugang
    ALTER COLUMN kennung SET NOT NULL,
    ADD CONSTRAINT ux_portal_zugang_kennung UNIQUE (kennung),
    ADD CONSTRAINT ck_portal_zugang_kennung_form CHECK (kennung ~ '^EK-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$');

COMMENT ON COLUMN portal.zugang.kennung IS
  'pii=indirekt; NICHT GEHEIME Anmeldekennung, steht neben dem Zugangscode im Brief. Ein Benutzername, kein Schluessel -- geschuetzt wird durch das Passwort. Bewusst ZUFAELLIG statt fortlaufend: eine Nummernfolge verriete die Zahl der Endkunden und liesse sich durchprobieren. Alphabet ohne verwechselbare Zeichen (kein 0/O/1/I/L), weil sie von Papier abgetippt wird.';
