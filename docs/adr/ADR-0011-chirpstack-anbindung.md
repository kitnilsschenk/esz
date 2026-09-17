# ADR-0011: Anbindung eines EXTERNEN ChirpStack (Tenant/Application/Device → Endkunde/Standort/Zähler), Herkunfts-Abgleich und Betriebssicht

- **Status:** **draft** — Entwurf zur Diskussion. Noch **keine** Fach-Reviews,
  **keine** Compliance-Prüfung, **keine** User-Freigabe. Nichts aus diesem
  Dokument ist umgesetzt außer dem, was Abschnitt 8 ausdrücklich als „bereits
  gebaut" ausweist.
- **Datum:** 2026-08-27
- **Autor:** Entwurf aus einer Analyse-Sitzung (Ingest-Pfad + realer Uplink)
- **Reviewer (vorgesehen, noch nicht erfolgt):** `iot-ingestion-engineer`,
  `technical-director` (D2), `database-lead` (D3), `security-lead` (D1),
  `compliance-director` (D1/D2/D3 — Personenbezug, Rohdaten-Vorhaltung)
- **Bezug:** ADR-0004 (Kern-Datenmodell), ADR-0005 (Messdaten-Ingestion,
  synthetic-only), ADR-0010 (Standort-/Gebäudestruktur), ADR-0008 (Betriebs-UI)

---

## 1. Anlass

Bis heute gibt es in der Oberfläche keinen Weg, einen Zähler an ein Gerät
anzubinden. Der Ingest-Pfad selbst ist gebaut (MQTT-Abo, Blind-Index-Auflösung,
Quarantäne, idempotenter Schreibpfad), aber er ist von der Plattform aus weder
bedienbar noch beobachtbar, und das Ingest-Gate steht fail-closed zu.

Zugleich ist jetzt bekannt, **wie** der produktive ChirpStack strukturiert ist —
und er liegt außerhalb des EDMS, in fremder Betriebshoheit.

## 2. Die vorgefundene Struktur

| ChirpStack | EDMS | Stand |
|---|---|---|
| Tenant | `energy.endkunde` | vorhanden |
| Application | `energy.standort`, `typ='gebaeude'` (V0017) | vorhanden |
| Device | `energy.zaehler` + `device.geraet_zuordnung` (DevEUI) | vorhanden, **ohne UI** |
| Device Profile | `zaehler.geraetetyp` → Decoder-Auswahl | vorhanden |

**Kardinalitäten (vom User bestätigt):** Ein Endkunde hat mehrere Gebäude
(Tenant → n Applications). Ein Gebäude gehört genau einem Tenant; dasselbe
physische Gebäude unter zwei Endkunden wäre in ChirpStack zwei Applications in
zwei Tenants — für das EDMS also zwei Standort-Bäume.

**Topic:** Standard-Template
`application/{{application_id}}/device/{{dev_eui}}/event/{{event}}` — deckt
sich mit der Konstante `UPLINK_TOPIC` im Code.

**Wichtig:** Der Tenant steht **nicht** im Topic. Die Hierarchie kommt
vollständig im Payload (`deviceInfo`), nicht im Topic-Pfad.

## 3. Befunde aus einem realen Uplink

Grundlage: ein Uplink vom 2026-08-27, Gerätetyp „DeZem Harvey 2", fPort 10.
Zusätzlich existieren Uplinks auf fPort 30.

### B1 — `deviceInfo` trägt die volle Hierarchie
`tenantId`, `tenantName`, `applicationId`, `applicationName`,
`deviceProfileId`, `deviceProfileName`, `deviceName`, `devEui`,
`deviceClassEnabled`, `tags`.

Der EDMS-Envelope (`envelope.types.ts`) deklariert davon **ein einziges Feld**:
`deviceInfo.devEui`. Alles andere wird beim Parsen verworfen. Der Parser
pflückt bekannte Schlüssel heraus und lehnt unbekannte nicht ab — mehr zu
lesen ist rein additiv.

### B2 — ChirpStack liefert den Payload BEREITS DEKODIERT
Neben `data` (Base64) enthält der Uplink ein `object` mit ~40 benannten
Größen. Das Device-Profil hat einen Codec hinterlegt, der auch die
Wandlerfaktoren bereits einrechnet:

```
in1_ac_raw_A: 0.003593 · in1_coeff: 7500 → in1_ac_A: 26.951
```

ADR-0005 sieht dagegen einen **eigenen** `GeraetetypDecoder` vor, der `data`
auswertet. → Entscheidung **D2**.

### B3 — fPort 10 enthält keine Energiemenge, fPort 30 sehr wohl
Sämtliche Größen sind Momentanwerte: `*_pow_act_W`, `*_pow_react_VAR`,
`*_pow_app_VA`, `*_ac_A`, `*_voltage_VAC`, `*_freq`, `*_pow_factor`, `temp_C`,
`vsys_V`. Kein kWh, kein Zählerstand, kein Zählwerk.

**fPort 30 (Beleg vom 2026-08-28) liefert die Zählwerke** und schließt damit
die Lücke:

```
in1_kWh: 2322.85 · in2_kWh: 1650.94 · in3_kWh: 2047.62
sum_in123_kWh: 6021.41          (= exakt die Summe der drei)
in_ctr_count: 16097209          (Impulszähler, einheitenlos)
in_ctr_time_elapse: "[D:186|H:7|M:26|S:49]"   (STRING, keine Zahl)
in1_cosphi / in2_cosphi / in3_cosphi          (Leistungsfaktor, dimensionslos)
```

Damit gilt für die Energiemengen `art='kumulativ_zaehlerstand'` — die
vorhandene Monotonie-Prüfung greift, und die Einsparberechnung bekommt echte
Zählerstände statt integrierter Schätzwerte. **O1 ist erledigt**; an seine
Stelle tritt **O7** (Summe oder Einzelwerte).

fPort 10 wird damit zur Diagnosegröße (Leistung, Strom, Spannung, Frequenz,
Leistungsfaktor, Temperatur) — nicht zur Verbrauchsquelle.

Zwei Nebenheiten für die Feldabbildung: `in_ctr_time_elapse` ist ein
**String** und darf einen Zahlen-Mapper nicht zum Absturz bringen;
`in_ctr_count` und `*_cosphi` sind einheitenlos und damit keine
Verbrauchsgrößen.

**Beide Ports stammen von DEMSELBEN Geräteprofil** („DeZem Harvey 2"), die
beiden Belege allerdings von zwei verschiedenen Geräten (`…70e060` „NSHV"
bzw. `…7112cd` „UV-EG-46Q1-LUEFTUNG"). Die Feldabbildung ist deshalb je
(Geräteprofil, fPort) zu führen — `RohFrame` trägt `fPort` bereits, ein
Decoder kann intern verzweigen; an der Registry ändert sich nichts.

### B4 — Ein Gerät entspricht vielen Messkanälen
Vier Eingänge (`in1`…`in4`) mit je mehreren Größen plus Summen. Die
Kanal-Auflösung im Ingest läuft über `(zaehlerId, messgroesse, obisKennzahl)`;
jeder eingespeiste Wert braucht also einen angelegten Messkanal. Das heutige
Anlegen-Formular legt **einen** Kanal je Durchlauf an — bei diesem Gerätetyp
wären das Dutzende. → Entscheidung **D6**.

### B5 — `rxInfo[].time` existiert in ChirpStack v4 nicht
`resolveZeitstempel` liest `envelope.rxInfo?.[0]?.time ?? envelope.time`.
Der reale Eintrag führt `gwTime` und `nsTime`, kein `time`. Der Zweig ist
gegen v4 also **tot**; der Fallback auf das Top-Level-`time` greift und
liefert das richtige Ergebnis. Kein Fehlverhalten, aber irreführender Code.

### B6 — `rxInfo[].location` enthält Gateway-Koordinaten
`latitude`/`longitude` des empfangenden Gateways. Der Parser liest sie nicht.
**Das soll so bleiben** — die Koordinate lokalisiert faktisch das Gebäude.

### B7 — Namensfelder sind Freitext mit Personenbezugs-Risiko
Im Beispiel: `tenantName` = „Volksbank Rhein-Lahn-Limburg eG" (juristische
Person, unkritisch), `applicationName` = „GS Lahnstein" (faktisch eine
Anschrift), `deviceName` = „NSHV", `tags.consumerName` = „NSHV". In einem
Wohnkontext stünde dort ebenso gut „Wohnung Müller". Es sind Werte, die
jemand in einem **fremden** System getippt hat — ohne Feldkatalog, ohne
Löschkonzept, ohne unsere Kontrolle. → Entscheidung **D1**.

---

## 4. Leitentscheidung

**Die EDMS-Datenbank bleibt maßgeblich.** ChirpStack liefert einen zweiten
Blickwinkel, kein zweites Register. Die Nachweiskette
(Zähler → System → Endkunde bzw. Zähler → Verortung → Standort) trägt den
BAFA-Nachweis und wird nicht durch die Konfiguration eines Netzservers
ersetzt, der außerhalb unserer Betriebshoheit liegt.

Daraus folgt die Rolle der ChirpStack-Metadaten: **Provisionierungs-Hilfe und
Abgleich — nie Quelle der Zuordnung.**

Ebenfalls verworfen (Vorschlag aus der Diskussion): **Mandantentrennung über
Topics.** Gründe: Die Zuordnung existiert bereits in der Datenbank und trägt
dort den Nachweis; ein Nutzungswechsel ist im EDMS ein Datenbank-Vorgang
(`nutzungsverhaeltnis` mit `gueltigVon`/`gueltigBis`) und darf nicht von einer
Umkonfiguration im Netzserver abhängen; ein Endkunden-Bezug im Topic stünde in
jeder Broker-Logzeile und jeder ACL-Datei, was der durchgehenden
Redaktions-Linie des Ingest-Pfads widerspricht; und eine MQTT-ACL kann das
nicht leisten, was RBAC + ABAC hier leisten (Art.-18-Sperren, Consent-Status,
Auditor-Deny-Regeln). Zudem ist „Endkunde" im EDMS **keine Mandanten-, sondern
eine Betroffenen-Rolle** — die Plattform hat genau einen Betreiber.

Topics bleiben sinnvoll für die Trennung von **Quellen** (mehrere
ChirpStack-Instanzen / Applications), nicht von Endkunden.

---

## 5. Entscheidungsvorschläge

### D1 — Herkunfts-IDs lesen, Namen nicht
`deviceInfo.tenantId`, `applicationId`, `deviceProfileId` in den Envelope
aufnehmen. `tenantName`, `applicationName`, `deviceName`, `tags` **nicht**.

Begründung: Die IDs sind opake UUIDs ohne Aussagekraft außerhalb ihres
Kontexts. Die Namen sind Freitext mit unklarem Personenbezug (B7) und werden
**nicht gebraucht** — nach dem Mapping aus D3 zeigt die Oberfläche den
EDMS-eigenen Standort-Namen an, nicht den aus ChirpStack.

Ebenfalls weiterhin nicht gelesen: `rxInfo[].location` (B6).

*Review: `security-lead`, `compliance-director`.*

### D2 — Werte aus `object`
**Beschlossen (User, 2026-08-28, Variante a), umgesetzt.** Weicht von
ADR-0005 ab — `technical-director` und `compliance-director` haben das noch
NICHT geprüft.

Verwende `object` als Wertequelle statt `data` selbst zu dekodieren.

Dafür spricht: Der Codec ist am Device-Profil gepflegt, von denen, die das
Gerät kennen; er rechnet Wandlerfaktoren ein, die in der ChirpStack-Konfiguration
stehen und nicht im EDMS (B2). Ein eigener Decoder müsste diese Konfiguration
spiegeln — und beim ersten Wandlertausch läuft die Spiegelung auseinander,
ohne dass es jemand merkt.

Ein Vertrauensargument gibt es **nicht**: `data` und `object` kommen über
denselben Kanal aus derselben Quelle. Eigenes Dekodieren schafft keine
zusätzliche Vertrauensgrenze, sondern nur **Reproduzierbarkeit**.

Diese Reproduzierbarkeit ist für den Nachweis aber wertvoll. Deshalb der
Kompromiss: Werte aus `object`, und je Messwert festhalten, **womit** er
entstanden ist (`deviceProfileId` + Codec-Kennung). Ob zusätzlich der
Rohframe `data` vorgehalten wird, ist eine eigene Abwägung
(Datenminimierung vs. Nachvollziehbarkeit) — die Export-Kategorie `rohdaten`
existiert bereits, ist aber nach Auflage A12 gesperrt.

Konsequenz für den Code: `GeraetetypDecoder.decode(rohframe)` bekommt eine
zweite Betriebsart „Feldabbildung" — eine Zuordnung `object`-Schlüssel →
`messgroesse`/`einheit`/`art` statt einer Byte-Dekodierung. Der Rest des
Flows (Kanal-Auflösung, Einheitenprüfung, Plausibilität, Monotonie,
idempotenter Upsert) bleibt unverändert.

*Review: `technical-director` (Abweichung von ADR-0005),
`compliance-director` (Rohdaten-Vorhaltung), `iot-ingestion-engineer`.*

### D3 — Herkunfts-Mapping als eigene Tabelle
Eine schmale Tabelle, zwei Spaltenpaare:

```
chirpstack_tenant_id       ↔ endkunde_id     (n:1 — ein Tenant, ein Endkunde)
chirpstack_application_id  ↔ standort_id     (1:1 — Application = Gebäude)
```

Ein Endkunde hat mehrere Gebäude, also mehrere Application-Zeilen zu einem
Tenant. Ein `applicationId` darf nur **einmal** zugeordnet sein (Unique).

Zweck:

1. **Quarantäne wird handhabbar.** Heute liefert `devEUI_unbekannt` einen
   Blind-Index und sonst nichts — damit kann niemand arbeiten. Mit dem
   Mapping steht dort „unbekanntes Gerät in *Gebäude Lahnstein*", und das
   Label kommt aus EDMS-Daten. Genau deshalb braucht es die ChirpStack-Namen
   aus D1 nicht.
2. **Anbinden wird zum Zwei-Klick-Vorgang** aus der Quarantäne heraus statt
   DevEUI-Abtippen.
3. Grundlage für D4.

*Review: `database-lead` + `compliance-director` (Bezug zu `endkunde`).*

### D4 — Herkunfts-Widerspruch ist ein Quarantänegrund
Neuer Reason-Code, etwa `herkunft_widerspruechlich`: Der Uplink kommt aus
Tenant A, die aufgelöste EDMS-Kette sagt aber Endkunde B → **Quarantäne statt
Einspeisung**.

Begründung: Wird ein Gerät im fremden ChirpStack umgehängt — versehentlich
oder bei einem Wechsel —, füllt es heute stumm die Messwerte des falschen
Endkunden. In einem System, das daraus einen Förderjahres-Nachweis rechnet,
ist das der teuerste denkbare stille Fehler. Die Prüfung kostet nach D1/D3
fast nichts und liegt auf der fail-closed-Linie des übrigen Ingest-Pfads.

### D5 — Topic konfigurierbar
`UPLINK_TOPIC` ist heute eine Konstante. Nutzt eine Instanz ein abweichendes
Template, kommt **stillschweigend nichts an** — kein Fehler, das Abo läuft ins
Leere. → `EDMS_INGEST_MQTT_TOPIC` mit dem heutigen Wert als Default.

Für die aktuelle Instanz nicht dringend (Standard-Template bestätigt), aber
die Fehlerart ist zu still, um sie stehen zu lassen.

### D6 — Messkanäle aus einem Uplink anlegen
Bei ~40 Größen je Gerät ist das Ein-Kanal-je-Formular-Muster nicht tragfähig
(B4). Vorschlag: Aus einem empfangenen Uplink die enthaltenen Größen
vorschlagen und die gewünschten in einem Durchgang als Messkanäle anlegen.
Auswahl trifft der Mensch — es werden nicht 40 Kanäle automatisch angelegt,
von denen 35 niemand braucht.

Setzt D2 voraus (ohne `object` gibt es keine benannten Größen).

### D8 — MEHRERE ChirpStacks müssen möglich bleiben
**Anforderung des Users (2026-08-28).** Noch nicht umgesetzt; hier steht,
was sie bedeutet.

Der heutige Stand geht von GENAU EINEM Netzserver aus: eine Broker-Adresse,
ein Topic, ein Worker — alles aus Umgebungsvariablen.

**Was dadurch NICHT bricht — und warum das die Zuordnung über die DevEUI
bestätigt:** Eine DevEUI ist geräteweit eindeutig (IEEE EUI-64). Die
Auflösung DevEUI → Blind-Index → Zähler funktioniert deshalb über beliebig
viele Netzserver hinweg unverändert, und ein Gerät, das von Netz A nach Netz
B umzieht, braucht im EDMS keine Änderung. Hätten wir die Zuordnung an
Topics oder Mandanten gehängt (verworfen in Abschnitt 4), wäre genau das
jetzt das Problem.

**Was bricht:**

1. **Die Verbindungskonfiguration.** Ein Satz Umgebungsvariablen muss zu N
   werden.
2. **Die Herkunft eines Uplinks ist nirgends festgehalten.** Bei einer Quelle
   ist das egal, bei mehreren nicht: Weder Quarantäne noch Betriebssicht
   können sagen, WELCHES Netz eine Nachricht geliefert hat.
3. **Die Betriebssicht aus A2 war irreführend.** Sie meldete EIN
   `letzteSchreibungAt` über alles. Liefert Netz A weiter und Netz B seit
   einem Tag nichts, sähe die Zahl frisch aus — und beruhigte über einen
   Ausfall hinweg. **Behoben mit V0039 (s. O8):** `status` weist die Quellen
   jetzt einzeln aus; die zusammengefassten Zeitpunkte bleiben daneben
   stehen, weil sie die andere Frage beantworten („kommt überhaupt etwas
   an?").

**Zuschnitt (umgesetzt, Stand V0039): EIN Worker-Prozess je Netzserver**, jeweils mit
eigener Konfiguration und einer Quellen-Kennung
(`EDMS_INGEST_QUELLE_CODE`). Gründe: Der Worker ist bereits ein
eigenständiger Prozess mit env-Konfiguration; N Deployments sind billiger als
Verbindungsverwaltung im Prozess; und ein nicht erreichbarer Broker legt
nicht die übrigen lahm. Die Alternative — ein Worker mit N Verbindungen —
zieht Verbindungslebenszyklus, Backoff je Verbindung und einen gemeinsamen
Ausfallpunkt nach sich.

**Folgen für offene Punkte:**

- **O8** (Herzschlag) — ERLEDIGT, mit Quellen-Dimension von Anfang an.
- **A2** — ERLEDIGT, die Quellen stehen einzeln in `status`.
- **Quarantäne** — ERLEDIGT mit V0041: `quelle_code`,
  `chirpstack_tenant_id`, `chirpstack_application_id`, dazu ein
  `?quelle=`-Filter. Damit trägt eine `devEUI_unbekannt`-Zeile nicht mehr
  nur einen redigierten Topic-String.
- **Der Worker verbindet weiterhin nur EINEN Broker je Prozess** — das ist
  der gewollte Zuschnitt, aber es gibt noch kein Deployment, das zwei
  Prozesse startet (**C3**).
- **B2/B3** (Herkunfts-Mapping und -Abgleich) sind ohnehin schon
  Herkunfts-Themen und wachsen natürlich mit: Ein Tenant gehört dann nicht
  nur zu einem Endkunden, sondern zu einer Quelle UND einem Endkunden.

**Nicht betroffen:** Geräte-Zuordnung (A1), Feldabbildung/Decoder (C2) und
der Gerätetyp-Katalog — sie hängen am Gerät bzw. am Gerätetyp, nicht am Netz.

### D7 — Anbindungs-Status als Feld an `ZaehlerDetail`, nicht als eigene Route
**Beschlossen (User, 2026-08-27), umgesetzt.**

Die Geräte-Zuordnung hatte drei Endpunkte und keinen davon zum Lesen; auch
`ZaehlerDetail` trug nichts dazu. Die Zähler-Detailseite konnte damit weder
anzeigen, ob ein Zähler angebunden ist, noch „Anbindung beenden" anbieten —
dafür braucht es die `geraetZuordnungId`, die es nur als Antwort auf das POST
gab und die nach einem Seitenwechsel verloren war.

Der Datenschutz-Grund für „kein Lesen" ist die DevEUI. Die steht in
`GeraetZuordnungDetail` ohnehin nicht (das Schema hält das ausdrücklich fest:
„KEIN devEui-/Blind-Index-Feld"). Ein Statuslesen gibt also nichts preis, was
das POST nicht schon zurückgibt. Die Lücke war eine Auslassung, keine
Entscheidung.

`ZaehlerDetail` bekommt ein Feld:

```
geraetAnbindung: { id, status, gueltigVon, gueltigBis, pepperVersion } | null
```

Gegen einen eigenen Lese-Endpunkt und für das Feld sprechen drei Dinge:

1. **Keine neue ABAC-Fläche.** Ein eigener Endpunkt bräuchte eine Aktion.
   `read:geraet_zuordnung` ist absichtlich break-glass-gehärtet (Rolle
   `geraete-support`, Zweck-Whitelist, strukturiertes `ticketRef`, Quota über
   den Audit-Trail). Sie für einen Statusblick heranzuziehen hieße, sie
   entweder aufzuweichen oder den Status unbenutzbar zu machen. Als Feld am
   Zähler greift die bestehende `read:stammdaten` — dieselbe Aktion, die den
   Zähler selbst freigibt, und derselbe Rollenschnitt
   (`betrieb`/`compliance-auditor`).
2. **Keine zweite Abfrage.** Die Detailseite lädt den Zähler ohnehin.
3. **Keine Migration.** `findAktivByZaehlerId(zaehlerId)` existiert im
   Repository bereits (bislang nur intern für die D-EXCL-Eindeutigkeitsprüfung
   verwendet), der Mapper ebenfalls.

`null` heißt „derzeit keine aktive Zuordnung" — auch dann, wenn früher eine
bestand. Historie wird über dieses Feld NICHT ausgegeben; abgelaufene und
geschredderte Zuordnungen bleiben unsichtbar.

**Nebenbeobachtung, nicht mitentschieden:** Das Stilllegen eines Zählers
beendet eine aktive Geräte-Zuordnung derzeit **nicht**. Ob ein stillgelegter
Zähler eine aktive Anbindung behalten darf, ist eine fachliche Frage; das
Feld macht den Zustand jetzt wenigstens sichtbar. Bewusst nicht in diesem
Zug geändert — s. O6.

---

## 5a. Feldabbildung „DeZem Harvey 2" (aus zwei realen Uplinks abgeleitet)

Grundlage: je ein Beleg auf fPort 10 (2026-08-27) und fPort 30 (2026-08-28),
beide vom Geräteprofil `DeZem Harvey 2`. **Von einem Betreiber zu bestätigen,
bevor daraus Code wird** — zwei Belege sind kein Feldkatalog.

### Verbrauchsgröße — genau eine

| Feld | fPort | `messgroesse` | `einheit` | `art` |
|---|---|---|---|---|
| `sum_in123_kWh` | 30 | Wirkarbeit | `kWh` | `kumulativ_zaehlerstand` |

Damit greift die vorhandene Monotonie-Prüfung, und die Einsparberechnung
bekommt einen echten Zählerstand.

### Ausdrücklich NICHT einzuspeisen

| Felder | Grund |
|---|---|
| `in1_kWh`, `in2_kWh`, `in3_kWh` | Phasendetail — in der Summe bereits enthalten (O7). Doppelzählung. |
| `sum_in123_pow_*`, `in*_pow_*`, `in*_ac_A`, `in*_ac_raw_A`, `in4_voltage_VAC`, `sum_in1234_ac_A` | Momentanwerte (W, VAR, VA, A, V) — keine Arbeit. Diagnose. |
| `in*_freq`, `in*_pow_factor`, `in*_cosphi` | Netzqualität, dimensionslos bzw. Hz. Diagnose. |
| `in*_coeff` | Wandlerfaktor — Gerätekonfiguration, kein Messwert. |
| `temp_C`, `vsys_V` | Gerätezustand. |
| `in_ctr_count` | Impulszähler, einheitenlos, ohne Bezug zu einer Messgröße. |
| `in_ctr_time_elapse` | **String** (`"[D:186|H:7|M:26|S:49]"`), keine Zahl. Ein Zahlen-Mapper muss ihn überspringen, nicht daran scheitern. |
| `flags` | Konfigurationsschalter des Geräts. |

### Offen zu diesem Gerät

- **Was ist `in4`?** Auf fPort 10 trägt es einen abweichenden Wandlerfaktor
  (`15.188` gegen `7500` bei in1..in3) und als einziges eine Spannung. Auf
  fPort 30 kommt kein `in4_kWh` vor — es liefert also keine Arbeit und bleibt
  Diagnose. Ob es ein vierter Wandler (N-Leiter?) oder eine Referenz ist,
  ist für die Einspeisung ohne Belang, für die Diagnose aber gut zu wissen.
- **Senden alle Geräte beide Ports?** Die zwei Belege stammen von zwei
  verschiedenen Geräten desselben Profils. Falls ein Gerät nur fPort 10
  sendet, liefert es keinen Verbrauch — das gehörte in der Betriebssicht
  sichtbar gemacht.

### D9 — Gerätetyp-Katalog: die Kanal-Vorlage kommt aus dem Decoder
**Beschlossen und umgesetzt (2026-08-28).**

`energy.messkanal.messgroesse`/`.einheit` sind Freitext, den ein Mensch beim
Anlegen abtippt — und sie müssen ZEICHENGENAU zu dem passen, was der Decoder
ausgibt. „Wirkarbeit" statt `wirkarbeit` oder „kwh" statt `kWh` erzeugt einen
Kanal, der nie befüllt wird; die Uplinks landen in der Quarantäne, bemerkbar
erst, wenn das Gerät montiert ist. Dieses Wissen stand ausschließlich im Code
des Ingest-Workers.

Jeder Decoder erklärt deshalb jetzt seine `erwarteteKanaele`, `decode()`
liest daraus, und ein Test hält fest, dass ein Decoder nur ausgibt, was er
erklärt hat. `GET /stammdaten/geraetetypen` reicht den Katalog nach außen
(`read:stammdaten`, PII-frei, keine Pagination — er kommt aus dem Code, nicht
aus der Datenbank). Die Zähler-Detailseite zeigt Soll gegen Ist und legt
fehlende Kanäle auf Knopfdruck an.

Der Katalog wird AUS der Registry gelesen, nicht aus einer danebenliegenden
Tabelle: Eine zweite Liste wäre früher oder später abgewichen, und die
Abweichung hätte niemand bemerkt, bis Messwerte ausbleiben.

Ein leerer Eintrag ist ausdrücklich zulässig — der synthetische
Referenz-Decoder liest Messgröße und Einheit aus dem Payload und legt sie
nicht fest.

**Dazu vergleicht die Registry den Gerätetyp jetzt ohne Rücksicht auf
Groß-/Kleinschreibung und Randleerzeichen.** Auch das ist ein Freitextfeld:
Vorher hätte „dezem harvey 2" jeden Uplink in die Quarantäne geschickt,
obwohl der Decoder vorhanden ist. Am laufenden Stack gegengeprüft (s. 5b).

### Folge für D6 (Kanal-Anlage aus dem Uplink)

**Weitgehend hinfällig.** D6 entstand aus der Annahme, ein Gerät brauche
Dutzende Messkanäle (B4). Bei genau einem Kanal je Gerät genügt das normale
Anlegen-Formular. Ein Zuordnungs-Assistent würde für einen einzigen Kanal
gebaut — das lohnt nicht.

Was BLEIBT, ist der Bedarf dahinter — und er ist auf zwei Wegen gedeckt:
VORHER durch die Kanal-Vorlage aus **D9** (die Detailseite sagt, was der
Gerätetyp liefern wird, und legt es an), NACHHER durch die Quarantäne-Liste
aus A2 (`kanal_unbekannt`, mit Sprung zum Zähler). Der erste Weg ist der
bessere: Er greift, bevor das Gerät montiert ist.

---

## 5b. Nachweis am laufenden Stack (2026-08-28)

Die Kette ist mit ECHTEN Uplink-Daten durchgespielt worden — Mosquitto,
Ingest-Worker, Decoder, Schreibpfad, Betriebssicht. Nur die DevEUI wurde auf
ein im Dev-Stand angebundenes Gerät geändert, alles Übrige (`object`,
`deviceInfo`, `rxInfo`, `fPort`) stammt unverändert aus den Belegen.

| Uplink | Ergebnis |
|---|---|
| fPort 30, angebundenes Gerät | Messwert geschrieben: `6021.410 kWh`, `wirkarbeit`, `kumulativ_zaehlerstand`, `qualitaet=gemessen`, `herkunft=ingest_live`, Zeitstempel aus `gwTime` |
| fPort 10, dasselbe Gerät | weder Messwert noch Quarantäne — die richtige Antwort auf eine Nachricht ohne Messwert |
| fPort 30, NICHT angebundenes Gerät | Quarantäne `devEUI_unbekannt`, Topic als `…/device/***/event/up`, Gerätekennung nirgends im Antwortkörper |

Die Betriebssicht aus A2 zeigte den frischen Schreibzeitpunkt und den
Quarantäne-Eintrag samt Handlungshinweis.

**Damit ist belegt:** Ein externer ChirpStack kann angebunden werden, seine
Uplinks landen am richtigen Zähler, und was nicht zugeordnet werden kann,
erscheint als Arbeitsvorrat statt zu verschwinden.

**Zweiter Durchlauf (D9):** Ein Zähler mit `geraetetyp = 'dezem harvey 2'`
(klein geschrieben), Kanal exakt nach Katalog-Vorlage angelegt, Gerät
angebunden — der Uplink wurde geschrieben (`6021.410 kWh`), Quarantäne blieb
leer. Ohne die schreibweise-tolerante Zuordnung wäre er als
`unbekannter_geraetetyp` liegengeblieben.

Der Ingest-Worker lief für beide Durchläufe von Hand
(`node dist/ingest-worker/worker-main.js`) — **C3 (Worker als betriebener
Dienst) bleibt offen.**

---

## 6. Stufenplan

| Stufe | Inhalt | Abhängig von | Betroffen |
|---|---|---|---|
| ~~**A1**~~ | ~~Geräte-Zuordnung im UI~~ — **gebaut** (2026-08-27), s. **D7** | — | erledigt |
| ~~**B1**~~ | ~~Herkunfts-IDs im Envelope lesen~~ — **gebaut** (2026-08-28): `deviceInfo.tenantId`/`applicationId`, NUR IDs. Landen samt `quelle_code` an der Quarantäne (V0041) und sind im Arbeitsvorrat sichtbar. | — | erledigt |
| ~~**A2**~~ | ~~Ingest-Betriebssicht~~ — **gebaut** (2026-08-28): `/monitoring/ingest`, zwei Lese-Endpunkte unter der bestehenden Aktion `read:monitoring`, Quarantäne mit Handlungshinweis je Grund. Ohne Verbindungsampel, s. **O8**. | — | erledigt |
| ~~**B2**~~ | ~~Herkunfts-Mapping (D3)~~ — **gebaut** (2026-09-05): Schema V0042, Audit-Katalog V0043, API `/monitoring/ingest/herkunft`, Pflege-Abschnitt in der Betriebssicht. Der in D3 versprochene Gebäude-NAME entfällt, s. **O12**. | B1 | erledigt |
| ~~**B3**~~ | ~~Herkunfts-Abgleich (D4)~~ — **gebaut** (2026-09-05): der Abgleich sitzt im Worker direkt nach der Korrelation, s. u. | B1, B2 | erledigt |
| ~~**C1**~~ | ~~Topic konfigurierbar~~ — **gebaut** (2026-08-28): `EDMS_INGEST_MQTT_TOPIC`, Default unveraendert. Dazu die Topic-Redaktion um eine FORM-Regel ergaenzt (jedes Segment in DevEUI-Form), weil die bisherige Positions-Regel an einem Template hing, das wir nicht mehr selbst bestimmen. | — | erledigt |
| ~~**C2**~~ | ~~Feldabbildung~~ — **gebaut** (2026-08-28): `DezemHarvey2Decoder`, ein Messwert je Uplink (`sum_in123_kWh`), fPort 10 liefert leer. Dazu `RohFrame`→`UplinkFrame` samt dekodiertem `objekt`, und die Registry vergleicht den Gerätetyp jetzt schreibweise-tolerant. | — | erledigt |
| ~~**C3**~~ | ~~Ingest-Worker als betriebener Dienst~~ — **gebaut** (2026-09-05): `deployment/docker/Dockerfile.backend` (ein Image, zwei Prozesse), Compose-Dienst unter Profil `ingest`, fehlende Login-Rolle nachgetragen, doppelter Shutdown-Pfad behoben. | — | erledigt |
| **C4** | Gate-Freigabe (`EDMS_GATE_FREIGABE_REF`) | alle | Compliance + DevOps |

**Stand 2026-09-05:** A1, A2, B1, B2, B3, C1 und C2 sind gebaut;
O1/O4/O7/O8/O10 sind beantwortet. Was bleibt, sind C3 und C4 — ein
Deployment- und ein Compliance-Vorgang, kein Code.

**Was beim Bau von B2/B3 entschieden wurde** (nicht vorab im ADR, hier
nachgetragen):

1. **Eine Tabelle, drei Invarianten — alle deklarativ.** D3 sprach von „einer
   schmalen Tabelle, zwei Spaltenpaaren"; das ist geblieben. Dazu kommen drei
   Constraints, die den Zuschnitt erst tragfaehig machen:
   *(a)* eine Application gehoert zu genau einem Standort (Unique auf der
   Application-Kennung **allein**, nicht auf dem Paar mit `quelle_code` — eine
   Application zweimal zuzuordnen ist auch ueber zwei Netzserver falsch);
   *(b)* ein Tenant gehoert zu genau einem Endkunden (EXCLUDE mit
   `endkunde_id WITH <>`, `btree_gist` — mehrere Gebaeude desselben Tenants
   bleiben erlaubt);
   *(c)* der Standort gehoert dem zugeordneten Endkunden (zusammengesetzter
   FK auf `energy.standort (id, endkunde_id)`, dasselbe Muster wie die
   Mandantentreue des Standort-Baums in V0017 D2.1).

   (b) ist keine Kosmetik: Ohne sie waere der Abgleich wertlos. Er fragt „zu
   welchem Endkunden gehoert dieser Tenant?" und braucht darauf EINE Antwort —
   zwei widersprechende Zeilen wuerden die Pruefung je nach Zeilenreihenfolge
   mal bestehen und mal nicht.

2. **Der Abgleich prueft den ENDKUNDEN, nicht den Standort.** D4 nennt den
   Endkunden-Widerspruch als teuersten stillen Fehler; genau der wird
   fail-closed behandelt. Ein Zaehler, der laut Mapping in Gebaeude X stuende,
   tatsaechlich aber an Gebaeude Y verortet ist, wird **nicht** quarantaeniert:
   Das ist ein Datenqualitaets-Hinweis innerhalb desselben Endkunden, und
   Messwerte dafuer zu verwerfen waere unverhaeltnismaessig.

3. **Ein abweichender `quelle_code` quarantaeniert ebenfalls nicht.** Kommt ein
   Uplink fuer eine Application ueber einen anderen Worker als den, der die
   Zuordnung angelegt hat, ist das auffaellig — aber es kann ebenso gut eine
   veraltete Zuordnung nach einer Umbenennung der Quelle sein. Aus einer
   Konfigurationsaenderung einen Datenverlust zu machen, waere der falsche
   Zuschnitt. Der Fall bleibt als **O11** offen.

4. **Kein Mapping ist nicht „stimmig".** Solange ein Tenant nicht zugeordnet
   ist, wird eingespeist wie bisher — die Tabelle wird nach und nach gepflegt,
   und ein leerer Zustand darf nicht den gesamten Ingest schliessen. „Ungeprueft"
   und „geprueft und in Ordnung" sind im Code trotzdem zwei verschiedene Werte,
   damit die Unterscheidung nicht verlorengeht.

5. **Spaltenscharfer Grant statt Tabellen-Grant.** Der Abgleich braucht
   `energy.system.endkunde_id`. Die Worker-Rolle bekommt dafuer
   `GRANT SELECT (id, endkunde_id)` — kein voller Tabellenzugriff, der ihr auch
   `bezeichnung` und `systembeschreibung` gaebe (RL-1, Muster aus V0010/V0023).
   Gegen die Datenbank nachgewiesen: `endkunde_id` liest sie, `bezeichnung` und
   `SELECT *` laufen in `permission denied`.

**Stand 2026-08-28:** A1, A2 und C1 sind gebaut, O1/O4/O7 beantwortet. Was
bleibt, hängt an Entscheidungen, nicht an Aufwand:

- **C2** braucht **D2** (Werte aus `object` oder eigener Decoder auf `data`).
  Das ist die letzte offene Grundsatzfrage vor der Feldabbildung und weicht
  von ADR-0005 ab — ohne sie ist nicht bestimmt, WOHER die Zahl kommt, die
  am Ende im Nachweis steht.
- **B1** allein bliebe toter Code; es trägt erst mit **B2** (Migration →
  `database-lead` + `compliance-director`) und **B3**.
- **C3/C4** sind Deployment- und Compliance-Vorgänge.

---

## 7. Offene Punkte

### O1 — Woher kommt die Energiemenge? — ERLEDIGT (2026-08-28)
fPort 30 trägt die Zählwerke (`in1_kWh`, `in2_kWh`, `in3_kWh`,
`sum_in123_kWh`), s. B3. Damit ist `kumulativ_zaehlerstand` die richtige Art,
die Monotonie-Prüfung greift, und es braucht keine Integration von
Momentanleistung — also auch keine Herabstufung auf `geschaetzt`. Die
Anschlussfrage ist O7.

### O7 — Summe oder Einzelwerte? — ERLEDIGT (2026-08-28)
**Betreiber-Auskunft: `in1..in3` sind die drei Phasen, `sum_in123_kWh` ist
deren Summe.**

Damit ist `sum_in123_kWh` die Verbrauchsgröße; die Einzelphasen sind
Diagnose. Beide einzuspeisen hieße, dieselbe Energie doppelt zu führen — wer
über Messkanäle summierte, käme auf den doppelten Verbrauch.

Die Folge ist größer, als sie klingt: **Von den rund 40 Feldern beider Ports
ist GENAU EINES eine Verbrauchsgröße.** Alles andere ist Momentanwert,
Phasendetail, Gerätediagnose oder ein Flag. Ein DeZem Harvey 2 braucht für
die Einsparberechnung damit EINEN Messkanal, nicht Dutzende — s. die Tabelle
in Abschnitt 5a und die Folge für **D6**.

### O10 — ERLEDIGT (2026-09-05), aber anders als versprochen
Die Uebersetzung ist gebaut: Schema (V0042), Audit-Katalog (V0043), API
(`/monitoring/ingest/herkunft`) und Pflege-Abschnitt in der Betriebssicht. Wer
eine Application zuordnet, bekommt aus einer opaken Netzserver-Kennung eine
EDMS-Kennung, mit der er im System weiterspringen kann.

**Was NICHT geliefert wurde, ist der Gebaeude-NAME** — dazu **O12**.

Urspruengliche Fassung:
Seit V0041 steht an jeder liegengebliebenen Nachricht, aus welchem Netz und
aus welcher ChirpStack-Application sie kam — als **opake Kennung**. Was noch
fehlt, ist die Übersetzung: `7b0c677e…` statt „Gebäude Lahnstein". Das
leistet erst **B2** (Mapping `chirpstack_application_id` ↔
`energy.standort`). Bis dahin muss man die Kennung im Netzserver
nachschlagen — immerhin ist sie überhaupt da.

### O9 — Feldabbildung ohne Herstellerdokumentation
`DezemHarvey2Decoder` ist aus ZWEI realen Uplinks abgeleitet (§5a), nicht aus
einer Gerätedokumentation. Belegt ist damit: `sum_in123_kWh` auf fPort 30 ist
die Wirkarbeit, fPort 10 trägt keine. Nicht belegt ist, ob es weitere Ports,
weitere Feldnamen oder Geräte-Varianten gibt, die anders senden. Ein
Betreiber sollte die Abbildung bestätigen, bevor damit ein Förderjahr
gerechnet wird.

**ERLEDIGT (2026-09-07):** Der Betreiber — KIT Consulting selbst, s. ADR-0011
D8 und die Antwort auf A3 des Fragenkatalogs — hat die Feldabbildung
bestätigt (Fragenkatalog C4). Damit ist `sum_in123_kWh` auf fPort 30 als
Wirkarbeit belegt, und ein Förderjahr darf darauf gerechnet werden. **Nicht**
mit erledigt ist die Frage nach weiteren Ports oder Gerätevarianten: Taucht
ein unbekannter fPort auf, greift `decode_fehler` fail-closed — der Fall ist
abgesichert, nicht ausgeschlossen.

### O2 — Vorhaltung des Rohframes
Teil von D2: Wird `data` zusätzlich vorgehalten, um Werte später
nachrechnen zu können? Abwägung Datenminimierung ↔ Nachvollziehbarkeit.
Berührt Auflage A12 (Export-Kategorie `rohdaten`).

### O3 — ENTSCHIEDEN (compliance-director, 2026-09-05): `deviceProfileId` reicht NICHT
Vier Anforderungen, alle vier:

1. **`deviceProfileId` je Messwert** — notwendig, nicht hinreichend: Die ID
   ist stabil, waehrend der Codec darunter ausgetauscht werden kann.
2. **Strukturhash statt Adresse**: `sha256` ueber die kanonisierte
   Schluesselmenge + Typ-/Einheiten-Signatur von `objekt` je
   (`deviceProfileId`, `fPort`) — OHNE Werte. Kommen Felder hinzu, fallen weg
   oder werden umbenannt, aendert sich der Hash.
3. **Skalensprung-Erkennung** fuer den Fall, den (2) nicht faengt: Eine reine
   Faktoraenderung (Wandler 1:100 -> 1:200) laesst Struktur und Typ
   unveraendert und aendert nur die Zahl. Dagegen hilft kein Hash, sondern ein
   Test auf der Differenzreihe -> neuer Quarantaenegrund
   `skalensprung_verdacht`, fail-closed.
4. **Unsere eigene Abbildungsvorschrift versionieren** (Decoder-Kennung +
   Version je Messwert).

Speicherform verbindlich: ein Katalog `measurement.dekodierungs_profil`, an
dem der Messwert mit EINEM `smallint` haengt — bei 15-Minuten-Werten ist das
der Unterschied zwischen Kilobyte und zweistelligen Gigabyte. Jede NEUE
Katalogzeile ist ein Pflicht-Audit-Ereignis: **Das ist der Punkt, an dem die
stille Aenderung laut wird.**

Damit ist auch **D2 votiert**: kein Veto gegen die Wertentnahme aus `objekt`
— unter der Bedingung, dass diese vier Punkte umgesetzt sind. Ohne sie waere
D2 eine Verlagerung der Rechenvorschrift in ein fremdes System ohne
Kompensation, und dagegen haette der `compliance-director` ein Veto.

**Anschlussfrage O2 (Rohframe `data` vorhalten) ebenfalls beantwortet: NEIN.**
`data` und `objekt` kommen ueber denselben Kanal aus derselben Quelle — es
entsteht keine zusaetzliche Vertrauensgrenze, nur eine Verdopplung des
sensibelsten Bestands, die ohne den fremden Codec nicht einmal auswertbar
waere.

**STAND 2026-09-07: Punkt 3 ist gebaut, die Punkte 1, 2 und 4 sind offen.**

#### Punkt 3 — Skalensprung-Erkennung: GEBAUT (V0049)

Der Schwellenwert war die offene Fachfrage C3 des Fragenkatalogs; der User
hat sie am 2026-09-07 an die Entwicklung delegiert. Entschieden ist:

**Verdacht besteht, wenn ein Zuwachs NICHT als Verbrauch erklaerbar ist, wohl
aber ALS FAKTOR auf den Zaehlerstand.** Das sind zwei Aussagen, und beide
werden geprueft — plus ein vorgeschaltetes Reifekriterium:

| Bedingung | Schwelle | Begruendung |
|---|---|---|
| Reife | Stand ≥ 96 × Erwartung | 96 Viertelstunden = ein Tag. Davor erzeugt ein anfahrender Betrieb denselben relativen Sprung wie ein Faktorwechsel; die beiden waeren aus der Reihe nicht zu trennen. |
| Nicht als Verbrauch erklaerbar | Zuwachs > 20 × Erwartung | Der Tag-/Nacht-Hub eines Viertelstundenwerts liegt gegen den Median bei etwa 10, Lastspitzen bei einem Mehrfachen. 20 laesst dem Betrieb Luft. |
| Als Faktor erklaerbar | Stand<sub>neu</sub>/Stand<sub>alt</sub> ≥ 1,05 | Fuenf Prozent des aufgelaufenen Standes in einer Viertelstunde gibt keine reale Last her. Nach unten begrenzt durch die engste reale Wandlerstufe (750/800 A = 1,067). |

„Erwartung" ist der **Median** der positiven Zuwaechse der letzten 48
geschriebenen Werte (zwoelf Stunden) — kein Mittelwert: Ein einzelner
Ausreisser wuerde die Schwelle genau dann anheben, wenn sie gebraucht wird.

Die Schwellen sind aufeinander kalibriert: Bei genau einem Tag Historie ist
ein Standwachstum von 20 % gleichbedeutend mit dem 19,2-fachen der Erwartung
— die Bedingungen 2 und 3 greifen dort ineinander. Die **Empfindlichkeit
waechst mit der Betriebsdauer**: Nach M Intervallen wird jeder Faktor
k > 1 + 20/M erkannt, nach einem Jahr also bereits k = 1,0006, begrenzt durch
Bedingung 3 auf k ≥ 1,05.

Drei Eigenschaften, die zur Entscheidung gehoeren:

- **Selbsthaltend.** Der verdaechtige Wert wird nicht geschrieben, also bleibt
  der Vergleichswert der alte, und jeder Folgewert faellt in dieselbe Pruefung.
  Die Sperre haelt, bis ein Mensch sie aufloest — ein zusaetzlicher
  Persistenztest ueber mehrere Intervalle ist deshalb entbehrlich.
- **Nur aufwaerts.** Ein Faktorwechsel nach unten halbiert den Stand und ist
  bereits ein Monotonie-Verstoss. Ihn hier zu deuten waere geraten:
  Geraetetausch und Zaehlerueberlauf erzeugen dieselbe Form. Eine falsche
  Etikettierung im Arbeitsvorrat ist schlechter als eine unspezifische.
- **Nur kumulative Kanaele.** Dort wirkt der Faktor auf den aufgelaufenen
  Stand, und der Sprung ist um Groessenordnungen groesser als jeder
  Intervallverbrauch. Bei `intervall_verbrauch` fehlt diese Verstaerkung —
  dort ist k = 1,25 an einem Einzelwert nicht von Lastschwankung zu
  unterscheiden. **Offen:** ein Niveauverschiebungs-Test ueber ein Fenster,
  der auf dem Einzelwert nicht fail-closed sein kann. Heute liefert kein
  produktiver Decoder einen Intervall-Kanal (`dezem-harvey-2` ist kumulativ),
  die Luecke ist also nicht erreichbar — sie wird es mit dem ersten
  Intervall-Geraetetyp.

Umsetzung: `ingest-flow/skalensprung.util.ts` (Schwellen mit Begruendung),
Pruefung VOR der Monotonie in `IngestFlowService`, Quarantaenegrund
`skalensprung_verdacht` in V0049, Oberflaechentext im Arbeitsvorrat.

#### Punkte 1, 2 und 4 — offen

Der Katalog `measurement.dekodierungs_profil`, der Strukturhash und die
Versionierung der eigenen Abbildungsvorschrift sind eine eigene Migration mit
Wirkung auf `measurement.messwert` (Profil-Schluessel je Messwert) und bleiben
offen. Punkt 3 steht unabhaengig davon: Er braucht keinen Katalog, sondern nur
die Zahlenreihe.

Urspruengliche Fassung:

### O3 — Codec-Versionierung (urspruengliche Fragestellung)
Wenn Werte aus `object` stammen (D2), ist die Rechenvorschrift außerhalb
unserer Versionskontrolle. Ändert jemand den Codec im Device-Profil, ändern
sich Werte, ohne dass im EDMS etwas ausweist, dass sich etwas geändert hat.
Mindestens `deviceProfileId` je Messwert festhalten; ob mehr nötig ist, muss
`compliance-director` mit Blick auf die Nachweispflicht beurteilen.

### O4 — Toter Zeitstempel-Zweig — ERLEDIGT (2026-08-28)
`resolveZeitstempel` liest jetzt `rxInfo[0].gwTime` (v4), dann `time`
(aeltere Fassungen), dann den Envelope-Zeitpunkt. Zuvor lief der
rxInfo-Zweig immer ins Leere und fiel stumm auf den Envelope-Zeitpunkt
zurueck — meist dasselbe Ergebnis, bei einem Backfill aber nicht.
`rxInfo[].location` wird weiterhin NICHT gelesen (B6).

### O8 — Kein Verbindungszustand ablesbar — ERLEDIGT (2026-08-28)
Gelöst mit `ingest.quelle_status` (V0039): Der Worker meldet alle 30 s, wer
er ist (`quelle_code`), worauf er hört (Broker-Host, Topic, Client-Id) und ob
seine Verbindung steht. `GET /monitoring/ingest/status` gibt das je Quelle
aus, die Betriebssicht zeigt es.

**Die tragende Entscheidung:** `verbunden` allein ist keine Aussage. Ein
abgestürzter Prozess kann das Flag nicht mehr zurücksetzen; die Zeile bliebe
für immer grün. Maßgeblich ist deshalb das abgeleitete `lebendig` —
gemeldete Verbindung UND frischer Herzschlag (Schwelle 120 s bei 30-s-Takt,
als Konstante in der Anwendung, nicht im Schema). Am laufenden Stack
nachgewiesen: Nach `SIGKILL` blieb `verbunden=true` stehen, `lebendig`
kippte nach Ablauf der Schwelle auf `false`.

Der Herzschlag läuft AUCH bei getrennter Verbindung weiter. „Ich lebe, komme
aber nicht durch" ist eine andere Störung als Schweigen — die eine schickt
zum Broker, die andere zum Prozess —, und die Oberfläche benennt beide
getrennt.

**Keine Zugangsdaten:** Die Broker-URL wird auf Host[:Port] reduziert, bevor
sie in die Datenbank geht; ein DB-CHECK (`NOT LIKE '%@%'`) ist der Backstop.
Gegengeprüft mit `mqtt://mqtt_benutzer:streng_geheim@localhost:1883` —
gespeichert wurde `localhost:1883`, das Passwort taucht in keiner Spalte auf.

Damit beantwortet die Plattform auch die Frage, für die es bisher gar keine
Oberfläche gab: **auf welchem Broker und welchem Topic hängen wir?**

### O12 — ENTSCHIEDEN (compliance-director, 2026-09-05)
**Ja — aber nicht als Feld der Liste.**

Die Listen-Antworten bleiben PII-frei (`standortId`/`endkundeId`/`typ`); der
Klartextname wird **auf ausdrueckliche Anforderung** ueber die BESTEHENDE
Batch-Label-Route mit der BESTEHENDEN Aktion `read:standort_pii` nachgeladen.
Kein neuer Endpunkt, keine neue PolicyAction — es entsteht kein neues Recht,
nur eine zweite Stelle, an der ein bestehendes ausgeuebt wird.

Berechtigt: `betrieb` (und `geraete-support`, sobald ausgerollt).
**Nicht berechtigt: `compliance-auditor`** — und ausdruecklich **keine
maskierte Fassung**. Begruendung des Votums: Die Auditor-Rolle prueft
VERFAHREN, nicht OBJEKTE; ihr Erkenntnisinteresse ist bedient, wenn sie sieht,
WER den Namen wann aufgeloest hat. Ein Auditor mit Klartextsicht waere
zugleich der groesste unbeaufsichtigte Leser im System. Eine Maskierung waere
bei zwoelf Standorten eines Endkunden ohnehin re-identifizierend und
suggerierte eine Schutzstufe, die im Payload nicht existiert.

Auflagen: Mengengrenze 100 je Aufruf, nur die sichtbare Seite, KEIN Prefetch,
kein Cache ueber die Sitzung hinaus; die Aufloesung ist ein bewusster Schritt
(„Namen anzeigen"), nicht Teil des Seitenaufbaus — Art. 25 Abs. 2, Voreinstellung
ist die Kennung. Der Name erscheint nie in Sortier-/Filterparametern,
Fehlermeldungen, Logs oder Exporten.

**NOCH NICHT GEBAUT.** Die Entscheidung liegt vor, die Umsetzung steht aus.

Urspruenglicher Befund:

### O12 (Befund vom 2026-09-05, der zur Entscheidung fuehrte)
D3 stellt als Nutzen in Aussicht, in der Quarantaene stuende kuenftig
„unbekanntes Geraet in **Gebaeude Lahnstein**" statt einer opaken Kennung.
**Dieser Name ist im EDMS nicht frei verfuegbar.** `energy.standort` traegt
ueberhaupt keine Bezeichnung — sie liegt feldverschluesselt in
`identity.standort_pii.bezeichnung_enc` (V0017), weil `energy.*` seit V0002
PII-frei ist (rote Linie 1). `/monitoring/ingest` ist ausdruecklich eine
PII-freie Flaeche, die auch `compliance-auditor` sieht.

Der Satz aus D3 war also nicht umsetzbar, ohne eine PII-Entscheidung zu
treffen — und die faellt nicht nebenbei beim Bau einer Betriebsliste.

**Was stattdessen gebaut wurde:** Aufgeloest wird auf `standortId`,
`endkundeId` und `standort.typ` — EDMS-EIGENE Kennungen, verkuerzt zur
Unterscheidbarkeit, vollstaendig im Tooltip, mit Link auf den Endkunden. Das
ist der Teil des Nutzens, der ohne PII zu haben ist: Man muss nicht mehr im
fremden Netzserver nachschlagen, sondern springt im EDMS weiter.

**Was zu entscheiden bleibt** (`compliance-director`, nicht vom Bau
vorwegzunehmen): Ob die Betriebssicht den entschluesselten Standortnamen
zeigen darf — und wenn ja, unter welcher Lesestufe (ADR-0010 D5 kennt bereits
`read:standort_pii`, IMMER auditiert), fuer welche Rollen, und ob
`compliance-auditor` ihn sehen darf oder eine maskierte Fassung bekommt.
Solange das offen ist, bleibt die Flaeche PII-frei — die restriktive Seite.

### O11 — Uplink ueber eine andere Quelle als die zugeordnete
Die Zuordnung haelt fest, aus welchem Netz sie stammt (`quelle_code`). Kommt
ein Uplink fuer dieselbe Application ueber einen anderen Worker, wird das
heute weder geprueft noch angezeigt. Ob daraus ein Hinweis, eine Warnung oder
(wie beim Endkunden-Widerspruch) eine Quarantaene werden soll, ist offen —
gegen die Quarantaene spricht, dass eine blosse Umbenennung der Quelle sonst
Messwerte kostet.

### O6 — Stilllegen und Geräte-Zuordnung
Ein stillgelegter Zähler behält heute seine aktive Geräte-Zuordnung; Uplinks
liefen weiter in die Auflösung. Ob das Stilllegen die Zuordnung mit beenden
soll (oder ob die Zuordnung ein eigenständiger Lebenszyklus bleibt), ist
offen. Seit D7 ist der Zustand in der Oberfläche wenigstens sichtbar.

### O5 — Kein Auto-Provisioning
Bleibt so. Ein unbekanntes Gerät erzeugt einen Quarantäne-Eintrag, keine
Zuordnung. Die Broker-ACL schließt das schon auf Transportebene aus
(Worker hat kein `write`). D3 macht daraus einen bequemen **manuellen**
Vorgang — nicht einen automatischen.

---

## 8. Was davon heute bereits gebaut ist

- MQTT-Abo (ein Wildcard-Topic, QoS 1, persistente Session), Broker-Adresse
  und Zugangsdaten über Umgebungsvariablen — **auf einen externen Broker
  zeigen zu lassen, ist reine Konfiguration.**
- DevEUI → Blind-Index (HMAC) → aktiver Zähler → Messkanal, mit Quarantäne
  bei jedem Fehlschlag und acht unterschiedenen Gründen.
- Geräte-Zuordnung als API: Provisionieren, Deaktivieren, break-glass-
  Reverse-Auflösung. Vollständig spezifiziert, verschlüsselt, auditiert.
- Idempotenter Schreibpfad, Plausibilität, Monotonie, Einheitenprüfung.

Nicht gebaut: jede Form von Oberfläche dafür, die Herkunfts-Auswertung, die
Betriebssicht, ein realer Decoder, der Worker als Dienst, die Gate-Freigabe.
