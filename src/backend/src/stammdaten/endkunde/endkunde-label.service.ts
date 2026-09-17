import { Inject, Injectable } from '@nestjs/common';
import type { SecurityContext } from '../../common/security/security-context';
import { FieldCipherService } from '../../common/crypto/field-cipher.service';
import { KEY_MANAGEMENT_PORT, type KeyManagementPort } from '../../common/crypto/key-management.port';
import { EnergyEndkundeRepository } from '../persistence/energy/energy-endkunde.repository';
import { IdentityEndkundePiiRepository } from '../persistence/identity/identity-endkunde-pii.repository';
import { IdentitySubjektSchluesselRepository } from '../persistence/identity/identity-subjekt-schluessel.repository';
import { PiiProjektionsPolicy } from '../pii/pii-projektions.policy';

/** Feldname der AAD-Bindung — identisch zu `endkunde.service.ts`. */
const FELD_NAME = 'name';

/**
 * Ein aufgelöstes Label. Trägt AUSSCHLIESSLICH `{ id, name }` — Auflage A1.
 *
 * Bewusste Abweichung vom Standort-Vorbild (`StandortLabelItem`), das
 * zusätzlich `anschrift` liefert: Dort ist die Anschrift das
 * Unterscheidungsmerkmal zwischen Gebäudeknoten, hier genügt der Name zur
 * Zeilenidentifikation. Alles Weitere bleibt der Detailseite vorbehalten
 * (Art. 5 Abs. 1 lit. c).
 */
export interface EndkundeLabelItem {
  readonly id: string;
  readonly name: string;
}

/**
 * Batch-Auflösung von Endkunden-Klartextnamen für Listen und Auswahlfelder
 * (ADR-0008 **D12**, `compliance-director`-Votum 2026-08-26 mit Auflagen
 * A1–A10).
 *
 * **Wozu.** Ohne diesen Pfad sind Endkunden in jeder Liste und jedem
 * Auswahlfeld nur über ein 8-Zeichen-UUID-Präfix identifizierbar. Der
 * `compliance-director` bewertet das nicht als Komfortlücke, sondern als
 * Fehlzuordnungsrisiko nach Art. 5 Abs. 1 lit. d — ein am falschen Endkunden
 * angehängtes System oder Zähler wandert in die Nutzerinformation und den
 * BAFA-Nachweis.
 *
 * **Warum getrennt vom Listen-Schema.** ADR-0008 §13/D1 bleibt vollumfänglich
 * gültig: `EndkundeListItem` ist schema-erzwungen PII-frei, damit kein
 * Laufzeitfehler eines Feld-Filters Klartext in Listen, Logs oder
 * `problem+json` spülen kann. Die Auflösung geschieht deshalb HIER — in einem
 * eigenen Vorgang mit eigener Fachaktion (`read:endkunde_pii`), eigenem Gate
 * und eigenem Audit-Event. Wer diesen Service liest, darf daraus NICHT
 * ableiten, D1 sei aufgeweicht.
 *
 * **Auflage A4 — die tragende Zusicherung dieser Klasse.** Die
 * `PiiProjektionsPolicy` wird JE DATENSATZ ausgewertet, nicht je Route. Ein
 * einmal erteiltes `permit` auf den Endpunkt sagt nichts über den einzelnen
 * Endkunden: Gesperrte (Art. 18) und krypto-geschredderte (Art. 17) Sätze
 * fallen STILL aus der Antwort — kein Klartext, kein 404, keine Begründung
 * (kein Existenz-Leak, Muster `StandortLabelService`). Ohne diese
 * Per-Datensatz-Prüfung hebelte der Batch die Art.-18-Sperre aus; das war der
 * benannte Veto-Grund des Votums.
 *
 * Entschlüsselt wird konsequent erst NACH `darfPiiSehen()===true` je Satz —
 * kein „PII-Entschlüsseln auf Vorrat" (ADR-0008 §18/D6).
 *
 * **Anders als beim Standort:** Dort teilen sich alle Knoten EINEN DEK des
 * Endkunden (D4/A2), ein einziges `unwrapDek()` genügt. Endkunden haben je
 * einen EIGENEN Subjektschlüssel — hier fällt daher ein Unwrap je Endkunde an.
 * Das ist der Preis der Mandantentrennung und der Grund, warum die
 * Mengengrenze mit 100 (A2) deutlich unter den 500 des Standort-Batches liegt.
 */
@Injectable()
export class EndkundeLabelService {
  constructor(
    private readonly endkundeRepository: EnergyEndkundeRepository,
    private readonly endkundePiiRepository: IdentityEndkundePiiRepository,
    private readonly subjektSchluesselRepository: IdentitySubjektSchluesselRepository,
    @Inject(KEY_MANAGEMENT_PORT) private readonly keyManagementPort: KeyManagementPort,
    private readonly fieldCipher: FieldCipherService,
    private readonly piiProjektionsPolicy: PiiProjektionsPolicy,
  ) {}

  async labels(subject: SecurityContext, endkundeIds: readonly string[]): Promise<EndkundeLabelItem[]> {
    const endkunden = await this.endkundeRepository.findManyByIds(endkundeIds);
    if (endkunden.length === 0) {
      return [];
    }

    // A4: Policy JE DATENSATZ, mit dem tatsächlichen Status DIESES Endkunden.
    // Nicht-Berechtigte fallen hier heraus, BEVOR irgendein Chiffrat geladen
    // wird — die Entschlüsselung sieht ihre Ids nie.
    const erlaubteIds = endkunden
      .filter((endkunde) => this.piiProjektionsPolicy.darfPiiSehen(subject, { verarbeitungsStatus: endkunde.verarbeitungsStatus }))
      .map((endkunde) => endkunde.id);
    if (erlaubteIds.length === 0) {
      return [];
    }

    const piiRows = await this.endkundePiiRepository.findManyByPseudonymIds(erlaubteIds);
    if (piiRows.length === 0) {
      return [];
    }

    const labels: EndkundeLabelItem[] = [];
    for (const pii of piiRows) {
      const subjektSchluessel = await this.subjektSchluesselRepository.findById(pii.cryptoKeyId);
      if (subjektSchluessel === undefined || subjektSchluessel.keyState === 'geschreddert') {
        // Bereits krypto-geschreddert (Art. 17) — nichts mehr entschlüsselbar.
        // Still auslassen, kein Fehler (analog `PiiProjektionsPolicy`-Maskierung
        // und `StandortLabelService`). Der Aufrufer sieht die Lücke nur als
        // fehlenden Eintrag; die Ursache verrät die Antwort bewusst nicht.
        continue;
      }

      const dek = await this.keyManagementPort.unwrapDek({
        wrappedDek: subjektSchluessel.wrappedDek,
        kmsKeyId: subjektSchluessel.kmsKeyId,
        algVersion: subjektSchluessel.algVersion,
      });

      labels.push({
        id: pii.pseudonymId,
        // AAD-Bindung an die pseudonymId DIESES Datensatzes — ein Chiffrat aus
        // Endkunde A lässt sich damit nicht als Endkunde B entschlüsseln
        // (GCM-Auth-Tag-Fehler), analog der Begründung in `StandortLabelService`.
        name: this.fieldCipher.decrypt(dek, pii.pseudonymId, FELD_NAME, pii.nameEnc),
      });
    }

    return labels;
  }
}
