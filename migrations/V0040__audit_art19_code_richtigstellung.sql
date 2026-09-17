-- V0040__audit_art19_code_richtigstellung.sql
--
-- ADR-Bezug: ADR-0007 A18/A11.12. Richtigstellung eines Namensfehlers aus
-- V0038.
--
-- =====================================================================
-- Was falsch war
-- =====================================================================
-- V0038 hat den Event-Typ als `nachweis.einreichung.art19_mitgeteilt`
-- angelegt. Die Konvention dieses Katalogs ist aber ENTITAET-ZUERST, und das
-- erste Segment entspricht `objekt_typ`:
--
--   einreichung.nachweis.vermerkt      (objekt_typ=einreichung)
--   einreichung.nachweis.korrigiert    (objekt_typ=einreichung)
--   endkunde.stammdaten.gesperrt       (objekt_typ=endkunde)
--   anschlussnutzer.stammdaten.gesperrt(objekt_typ=anschlussnutzer)
--
-- V0038 setzte `objekt_typ='einreichung'` (richtig), waehlte aber den Code mit
-- VERTAUSCHTEN Segmenten. Er war damit der einzige Eintrag im gesamten
-- Katalog, dessen Praefix nicht zu seinem `objekt_typ` passt -- und genau
-- diese Entsprechung ist es, die den Katalog durchsuchbar macht ("alle
-- Ereignisse zu einer Einreichung").
--
-- Korrekt: `einreichung.nachweis.art19_mitgeteilt`.
--
-- =====================================================================
-- Warum LOESCHEN und nicht SCD2-schliessen
-- =====================================================================
-- Ein Codewechsel ist keine neue VERSION desselben Eintrags, sondern ein
-- anderer Eintrag -- `audit.event_typ.code` ist die Identitaet. Die Frage ist
-- daher nicht "welche Version gilt", sondern "darf der falsche Code weg".
--
-- Er darf: es existiert KEINE `audit.event`-Zeile unter ihm (gegen die Dev-DB
-- geprueft; der Emitter ist erst mit demselben Commit entstanden, und die
-- Integrationstests laufen gegen Wegwerf-Container). Ein nie benutzter,
-- falsch benannter Code, der fuer immer im Katalog stehen bleibt, waere die
-- schlechtere Hinterlassenschaft -- er wuerde bei jeder kuenftigen Suche
-- mitgefunden und muesste jedes Mal neu erklaert werden.
--
-- Der DO-Block prueft das VOR dem Loeschen und bricht ab, statt Historie zu
-- zerstoeren, falls die Annahme in einer anderen Umgebung nicht gilt.

INSERT INTO audit.event_typ (code) VALUES
    ('einreichung.nachweis.art19_mitgeteilt');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'einreichung.nachweis.art19_mitgeteilt', 'einreichung', 'mitteilen',
     ARRAY['synthetic','kanal','anlass'], true, false, true,
     'Empfaenger nach Art. 19 DSGVO ueber eine Einschraenkung (Art. 18) oder Loeschung (Art. 17) unterrichtet, die eine BEREITS ERFOLGTE Einreichung betrifft (ADR-0007 A18/A11.12). objekt_ref=nachweis.einreichung.id, kontext.synthetic Pflicht-Tag, kontext.kanal=geschlossener Code (postalisch|elektronisch|telefonisch|persoenlich, V0037), kontext.anlass=einschraenkung_art18|loeschung_art17. Die Unverhaeltnismaessigkeits-Ausnahme des Art. 19 greift hier NICHT: es gibt genau einen Empfaenger, er ist aktenkundig (nachweis.einreichung.empfaenger), und die Zuordnung Person->Einreichung ist eine Abfrage ueber einsparlauf_bindung. BEWUSST OHNE einschraenkung_grund_code -- der differenzierte Art.-18-Grund verlaesst das System nicht (C4 Punkt 6); wer ihn braucht, findet ihn am ausloesenden Ereignis. rolle_erfassen=true: die Erfuellung einer Mitteilungspflicht gegenueber einer Behoerde ist ein Vorgang, bei dem der Ausfuehrende Teil des Nachweises ist. NICHT enthalten: die Ausfuehrung als Korrektur-Einreichung (A18) -- sie ist laut betroffenenrechte.md ohnehin nur die Ausfuehrungsform, wenn sich ein ausgewiesener WERT aendert; die Art.-18-Einschraenkung faellt unter die schlichte Mitteilung. [Ersetzt den mit V0038 falsch benannten Code nachweis.einreichung.art19_mitgeteilt -- vertauschte Segmente, siehe V0040-Kopf.]',
     now());

DO $$
DECLARE
    v_alt        text := 'nachweis.einreichung.art19_mitgeteilt';
    v_referenced boolean;
BEGIN
    SELECT EXISTS (SELECT 1 FROM audit.event WHERE event_typ = v_alt) INTO v_referenced;

    IF v_referenced THEN
        -- Sollte hier nicht eintreten. Falls doch, wird NICHT geloescht: eine
        -- Ereigniszeile ohne aufloesbaren Katalog-Eintrag waere schlimmer als
        -- ein falsch benannter Eintrag. Stattdessen SCD2-schliessen und
        -- lautstark melden.
        UPDATE audit.event_typ_version
           SET aktiv = false, gueltig_bis = now()
         WHERE code = v_alt AND gueltig_bis IS NULL;
        RAISE WARNING 'audit: der falsch benannte Code % wird bereits von audit.event referenziert -- KEIN Hard-Delete. Katalog-Version geschlossen/deaktiviert; die Ereigniszeilen bleiben aufloesbar. Bereinigung erfordert compliance-director-/database-lead-Review.', v_alt;
    ELSE
        DELETE FROM audit.event_typ_version WHERE code = v_alt;
        DELETE FROM audit.event_typ WHERE code = v_alt;
    END IF;
END
$$;

-- =====================================================================
-- BOOTSTRAP-AUSNAHME
-- =====================================================================
-- Keine eigene `audit.event`-Zeile: unveraendert die Begruendung aus
-- V0032/V0033/V0036/V0038 -- ein SQL-Migrationsskript kann keinen validierten
-- `actor_*`-Principal herstellen (rote Linie 1). A11.5 verlangt
-- `audit.katalog.geaendert`; das ist VERSCHOBEN, nicht erledigt, und mit
-- V0032/V0033/V0036/V0038 GEMEINSAM nachzutragen -- diese Migration gehoert
-- ab jetzt zu derselben Gruppe.
