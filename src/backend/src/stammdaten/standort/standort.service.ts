import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import {
  EnergyStandortRepository,
  PG_FOREIGN_KEY_VIOLATION,
  PG_RAISE_EXCEPTION,
} from '../persistence/energy/energy-standort.repository';
import type { Standort } from '../persistence/energy/energy-standort.repository';
import { EnergyZaehlerStandortRepository } from '../persistence/energy/energy-zaehler-standort.repository';
import { EnergyEndkundeRepository } from '../persistence/energy/energy-endkunde.repository';
import { IdentityStandortPiiRepository } from '../persistence/identity/identity-standort-pii.repository';
import { IdentityEndkundePiiRepository } from '../persistence/identity/identity-endkunde-pii.repository';
import { IdentitySubjektSchluesselRepository } from '../persistence/identity/identity-subjekt-schluessel.repository';
import { KEY_MANAGEMENT_PORT } from '../../common/crypto/key-management.port';
import type { KeyManagementPort } from '../../common/crypto/key-management.port';
import { FieldCipherService } from '../../common/crypto/field-cipher.service';
import { hatPgErrorCode } from '../persistence/pg-error.util';
import { konflikt, nichtGefunden, ungueltigeEingabe } from '../common/problem.util';
import { mapStandortStruktur } from './standort.mapper';
import type {
  StandortLoeschErgebnis,
  StandortPiiDetail,
  StandortStillgelegtErgebnis,
  StandortStruktur,
  StandortVerschobenErgebnis,
} from './standort.types';
import type { StandortAnlegenDto } from './dto/standort-anlegen.dto';
import type { StandortAendernDto } from './dto/standort-aendern.dto';
import type { StandortPiiAendernDto } from './dto/standort-pii-aendern.dto';
import { FELD_ANSCHRIFT, FELD_BEZEICHNUNG, FELD_GEO, istAdressePflicht, istAdresseZulaessig } from './standort.constants';

const WURZEL_TYPEN = ['liegenschaft', 'gebaeude'] as const;
const MAX_EBENE = 9;

interface AnlegenTxInput {
  readonly standortId: string;
  readonly endkundeId: string;
  readonly parentId: string | null;
  readonly typ: StandortAnlegenDto['typ'];
  readonly sortierung: number;
  readonly klimareferenz: string | null;
  readonly cryptoKeyId: string;
  readonly bezeichnungEnc: Buffer;
  readonly anschriftEnc: Buffer | null;
}

/**
 * ADR-0010 (Standort-/Gebäudestruktur) — Fach-Service für die schreibende
 * Stammdaten-Lebenszyklus-Familie (`create:standort`/`update:standort`/
 * `delete:standort`). Controller dünn (`.claude/rules/backend-nestjs.md`).
 *
 * DEK-Wiederverwendung (D4/A2, ZENTRALE Invariante dieses Moduls): beim
 * Anlegen wird NIEMALS ein neuer DEK erzeugt — der `crypto_key_id` des
 * NEUEN `identity.standort_pii`-Datensatzes ist IMMER derselbe wie
 * `identity.endkunde_pii.crypto_key_id` des zugehörigen Endkunden
 * (`identity.subjekt_schluessel` wird 1:n von allen Standorten desselben
 * Endkunden geteilt). Diese Invariante ist NICHT per DB-Constraint
 * erzwingbar (kein Cross-Namespace-FK, Linie 1/5, `crypto_key_id` trägt
 * bewusst KEIN `UNIQUE`, V0017-Migrationskopf) — sie wird HIER, service-
 * seitig, dadurch garantiert, dass `anlegen()` den `cryptoKeyId` NIE selbst
 * erzeugt, sondern IMMER aus `IdentityEndkundePiiRepository.
 * findByPseudonymId(endkundeId)` liest.
 *
 * AAD-Bindung (D4, ZENTRALE Sicherheitsauflage): jeder `FieldCipherService.
 * encrypt(dek, STANDORT_ID, feld, klartext)`-Aufruf bindet die `standortId`
 * (NICHT die `endkundeId`) als `subjektId` — s. `StandortLabelService`-
 * Klassen-Dok für die Begründung (gemeinsamer DEK, AAD verhindert
 * Chiffrat-Umhängen zwischen zwei Standorten desselben Endkunden).
 */
@Injectable()
export class StandortService {
  constructor(
    private readonly standortRepository: EnergyStandortRepository,
    private readonly zaehlerStandortRepository: EnergyZaehlerStandortRepository,
    private readonly standortPiiRepository: IdentityStandortPiiRepository,
    private readonly endkundeRepository: EnergyEndkundeRepository,
    private readonly endkundePiiRepository: IdentityEndkundePiiRepository,
    private readonly subjektSchluesselRepository: IdentitySubjektSchluesselRepository,
    @Inject(KEY_MANAGEMENT_PORT) private readonly keyManagementPort: KeyManagementPort,
    private readonly fieldCipher: FieldCipherService,
  ) {}

  async anlegen(endkundeId: string, dto: StandortAnlegenDto): Promise<StandortStruktur> {
    const endkunde = await this.endkundeRepository.findById(endkundeId);
    if (endkunde === undefined) {
      throw nichtGefunden('Endkunde');
    }

    const parentId = dto.parentId ?? null;
    let parent: Standort | undefined;
    if (parentId !== null) {
      parent = await this.standortRepository.findById(parentId);
      if (parent === undefined) {
        throw nichtGefunden('Parent-Standort');
      }
      // D2.1 — Referenzkonsistenz-Vorab-Check (analog NutzungsverhaeltnisService
      // B2): der zusammengesetzte Self-FK deckt dies ohnehin ab, dieser Check
      // liefert nur die sprechendere 400 statt eines rohen FK-Fehlers.
      if (parent.endkundeId !== endkundeId) {
        throw ungueltigeEingabe('parentId gehoert nicht zum angegebenen endkundeId (D2.1).');
      }
      if (parent.ebene + 1 > MAX_EBENE) {
        throw konflikt(`Tiefenlimit erreicht — der neue Knoten laege auf Ebene ${String(parent.ebene + 1)} (zulaessig: 0-${String(MAX_EBENE)}, D2.3).`);
      }
    } else if (!(WURZEL_TYPEN as readonly string[]).includes(dto.typ)) {
      // D2.4 — Wurzel-Typ-Vorab-Check (analog: der DB-CHECK deckt dies ohnehin ab).
      throw ungueltigeEingabe('Wurzelknoten (kein parentId) muessen liegenschaft oder gebaeude sein (D2.4).');
    }

    // D4 — Adressregeln (service-seitig, energy kennt den Adress-Zustand nicht).
    if (dto.adresse !== undefined && !istAdresseZulaessig(dto.typ, parentId)) {
      throw ungueltigeEingabe('Adresse ist auf dieser Ebene nicht zulaessig (D4: nur Wurzelknoten oder gebaeude).');
    }
    if (istAdressePflicht(parentId) && dto.adresse === undefined) {
      throw ungueltigeEingabe('Adresse ist auf Wurzelknoten Pflicht (D4).');
    }

    // DEK-Wiederverwendung (D4/A2) — s. Klassen-Dok.
    const endkundePii = await this.endkundePiiRepository.findByPseudonymId(endkundeId);
    if (endkundePii === undefined) {
      throw nichtGefunden('Endkunde-PII');
    }
    const subjektSchluessel = await this.subjektSchluesselRepository.findById(endkundePii.cryptoKeyId);
    if (subjektSchluessel === undefined || subjektSchluessel.keyState === 'geschreddert') {
      throw konflikt('Endkunde ist bereits krypto-geschreddert (Art. 17) — es koennen keine neuen Standorte angelegt werden.');
    }

    // KMS-Roundtrip + Verschluesselung VOR dem inneren NESTED-Tx-Beginn
    // (backend-lead-Constraint, s. `EndkundeService.anlegen()`-Klassen-Dok).
    const dek = await this.keyManagementPort.unwrapDek({
      wrappedDek: subjektSchluessel.wrappedDek,
      kmsKeyId: subjektSchluessel.kmsKeyId,
      algVersion: subjektSchluessel.algVersion,
    });

    const standortId = randomUUID();
    const bezeichnungEnc = this.fieldCipher.encrypt(dek, standortId, FELD_BEZEICHNUNG, dto.bezeichnung);
    const anschriftEnc =
      dto.adresse !== undefined ? this.fieldCipher.encrypt(dek, standortId, FELD_ANSCHRIFT, dto.adresse) : null;

    const standort = await this.anlegenInTx({
      standortId,
      endkundeId,
      parentId,
      typ: dto.typ,
      sortierung: dto.sortierung ?? 0,
      klimareferenz: dto.klimareferenz ?? null,
      cryptoKeyId: endkundePii.cryptoKeyId,
      bezeichnungEnc,
      anschriftEnc,
    });

    return mapStandortStruktur(standort, 0);
  }

  @Transactional(Propagation.Nested)
  private async anlegenInTx(input: AnlegenTxInput): Promise<Standort> {
    await this.standortPiiRepository.insert({
      id: randomUUID(),
      pseudonymId: input.standortId,
      cryptoKeyId: input.cryptoKeyId,
      bezeichnungEnc: input.bezeichnungEnc,
      anschriftEnc: input.anschriftEnc,
      geoEnc: null,
    });

    return this.standortRepository.insert({
      id: input.standortId,
      endkundeId: input.endkundeId,
      parentId: input.parentId,
      typ: input.typ,
      sortierung: input.sortierung,
      klimareferenz: input.klimareferenz,
    });
  }

  async aendern(standortId: string, dto: StandortAendernDto): Promise<StandortStruktur> {
    if (dto.typ === undefined && dto.sortierung === undefined && dto.klimareferenz === undefined) {
      throw ungueltigeEingabe('Mindestens ein Feld muss gesetzt sein (typ, sortierung oder klimareferenz).');
    }

    const existing = await this.standortRepository.findById(standortId);
    if (existing === undefined) {
      throw nichtGefunden('Standort');
    }

    if (dto.typ !== undefined && existing.parentId === null && !(WURZEL_TYPEN as readonly string[]).includes(dto.typ)) {
      throw ungueltigeEingabe('Wurzelknoten muessen liegenschaft oder gebaeude bleiben (D2.4).');
    }

    const updated = await this.standortRepository.updateStruktur(standortId, {
      ...(dto.typ !== undefined ? { typ: dto.typ } : {}),
      ...(dto.sortierung !== undefined ? { sortierung: dto.sortierung } : {}),
      // Leerstring heisst „Station wieder entfernen" — die Spalte ist
      // nullable, und ein leerer Text waere weder Station noch Abwesenheit.
      ...(dto.klimareferenz !== undefined
        ? { klimareferenz: dto.klimareferenz.trim() === '' ? null : dto.klimareferenz.trim() }
        : {}),
    });
    if (updated === undefined) {
      throw nichtGefunden('Standort');
    }

    const zaehlerAnzahl = await this.zaehlerStandortRepository.countAktivByStandortId(standortId);
    return mapStandortStruktur(updated, zaehlerAnzahl);
  }

  /**
   * PII-Vollersatz (D5-Trennung: eigene Route/Aktion `update:standort`,
   * NICHT `read:standort_pii` — Schreiben ist kein Lesen). Antwort ECHOT den
   * gerade geschriebenen Klartext (keine erneute Entschlüsselung nötig,
   * analog `EndkundeService.aendern()`).
   */
  async aendernPii(standortId: string, dto: StandortPiiAendernDto): Promise<StandortPiiDetail> {
    const standort = await this.standortRepository.findById(standortId);
    if (standort === undefined) {
      throw nichtGefunden('Standort');
    }

    if (dto.adresse !== undefined && !istAdresseZulaessig(standort.typ, standort.parentId)) {
      throw ungueltigeEingabe('Adresse ist auf dieser Ebene nicht zulaessig (D4: nur Wurzelknoten oder gebaeude).');
    }
    if (istAdressePflicht(standort.parentId) && dto.adresse === undefined) {
      throw ungueltigeEingabe('Adresse ist auf Wurzelknoten Pflicht (D4).');
    }

    const pii = await this.standortPiiRepository.findByPseudonymId(standortId);
    if (pii === undefined) {
      throw nichtGefunden('Standort-PII');
    }

    const subjektSchluessel = await this.subjektSchluesselRepository.findById(pii.cryptoKeyId);
    if (subjektSchluessel === undefined || subjektSchluessel.keyState === 'geschreddert') {
      throw konflikt('Der zugehoerige Endkunde ist bereits krypto-geschreddert (Art. 17) — PII kann nicht mehr geaendert werden.');
    }

    const dek = await this.keyManagementPort.unwrapDek({
      wrappedDek: subjektSchluessel.wrappedDek,
      kmsKeyId: subjektSchluessel.kmsKeyId,
      algVersion: subjektSchluessel.algVersion,
    });

    const bezeichnungEnc = this.fieldCipher.encrypt(dek, standortId, FELD_BEZEICHNUNG, dto.bezeichnung);
    const anschriftEnc =
      dto.adresse !== undefined ? this.fieldCipher.encrypt(dek, standortId, FELD_ANSCHRIFT, dto.adresse) : null;
    const geoEnc = dto.geo !== undefined ? this.fieldCipher.encrypt(dek, standortId, FELD_GEO, dto.geo) : null;

    await this.standortPiiRepository.updateByPseudonymId(standortId, { bezeichnungEnc, anschriftEnc, geoEnc });

    return { id: standortId, bezeichnung: dto.bezeichnung, anschrift: dto.adresse ?? null, geo: dto.geo ?? null };
  }

  /**
   * Reparent (D6). Service-seitige Vorab-Prüfungen SPIEGELN die Trigger-
   * Logik (`energy.standort_pfad_pflegen()`, V0017) — sprechende 400/409
   * statt eines rohen `RAISE EXCEPTION`. Der Trigger selbst bleibt der
   * ATOMARE, unumgehbare Garant (Race-Backstop via `PG_RAISE_EXCEPTION`).
   */
  async verschieben(standortId: string, neuerParentId: string | null): Promise<StandortVerschobenErgebnis> {
    const node = await this.standortRepository.findById(standortId);
    if (node === undefined) {
      throw nichtGefunden('Standort');
    }

    let neueEigeneEbene = 0;
    if (neuerParentId === null) {
      if (!(WURZEL_TYPEN as readonly string[]).includes(node.typ)) {
        throw ungueltigeEingabe('Nur liegenschaft/gebaeude duerfen an die Wurzel verschoben werden (D2.4).');
      }
    } else {
      if (neuerParentId === standortId) {
        throw konflikt('Ein Knoten kann nicht sein eigener Parent sein.');
      }
      const neuerParent = await this.standortRepository.findById(neuerParentId);
      if (neuerParent === undefined) {
        throw nichtGefunden('Ziel-Parent');
      }
      if (neuerParent.endkundeId !== node.endkundeId) {
        throw ungueltigeEingabe('neuerParentId gehoert nicht zum selben Endkunden (D2.1, Mandantentreue).');
      }
      if (neuerParent.pfad.includes(standortId)) {
        throw konflikt('Ziel-Parent ist Nachfahre (oder der Knoten selbst) — Verschieben wuerde einen Zyklus erzeugen (D2.2/D6).');
      }
      neueEigeneEbene = neuerParent.ebene + 1;
    }

    const statistik = await this.standortRepository.findNachfahrenStatistik(standortId);
    const relativeNachfahrenTiefe = statistik.maxEbene !== undefined ? statistik.maxEbene - node.ebene : 0;
    if (neueEigeneEbene + relativeNachfahrenTiefe > MAX_EBENE) {
      throw konflikt(`Tiefenlimit erreicht — mindestens ein Nachfahre laege auf Ebene ${String(neueEigeneEbene + relativeNachfahrenTiefe)} (zulaessig: 0-${String(MAX_EBENE)}, D2.3).`);
    }

    let updated: Standort | undefined;
    try {
      updated = await this.standortRepository.updateParent(standortId, neuerParentId);
    } catch (error: unknown) {
      if (hatPgErrorCode(error, PG_RAISE_EXCEPTION) || hatPgErrorCode(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw konflikt('Verschieben abgelehnt (Zyklus, Tiefenlimit, Mandantentreue oder unbekannter Parent, D2/D6).');
      }
      throw error;
    }
    if (updated === undefined) {
      throw nichtGefunden('Standort');
    }

    const zaehlerAnzahl = await this.zaehlerStandortRepository.countAktivByStandortId(standortId);
    return {
      standort: mapStandortStruktur(updated, zaehlerAnzahl),
      parentIdAlt: node.parentId,
      nachfahrenAktualisiert: statistik.anzahl,
    };
  }

  /**
   * Stilllegen (D2.6) — IDEMPOTENT, Zustandswechsel (KEIN Hard-Delete).
   * Vorbedingungen (im selben Transaktions-Lock, ambiente Request-Tx):
   * (a) keine aktiven Kinder, (b) keine offenen Verortungen am Knoten selbst.
   */
  async stilllegen(standortId: string): Promise<StandortStillgelegtErgebnis> {
    const existing = await this.standortRepository.findById(standortId);
    if (existing === undefined) {
      throw nichtGefunden('Standort');
    }

    if (existing.status === 'aktiv') {
      const [hatAktiveKinder, hatOffeneVerortung] = await Promise.all([
        this.standortRepository.hatAktiveKinder(standortId),
        this.zaehlerStandortRepository.hatOffeneVerortungAmStandort(standortId),
      ]);
      if (hatAktiveKinder) {
        throw konflikt('Standort hat aktive Kinder — Stilllegen ist erst nach deren Stilllegung moeglich (D2.6(a)).');
      }
      if (hatOffeneVerortung) {
        throw konflikt('Standort hat mindestens eine offene Zaehler-Verortung — Stilllegen ist erst nach deren Beendigung moeglich (D2.6(b)).');
      }
    }

    const updated = await this.standortRepository.stilllegen(standortId);
    if (updated === undefined) {
      throw nichtGefunden('Standort');
    }

    const zaehlerAnzahl = await this.zaehlerStandortRepository.countAktivByStandortId(standortId);
    return { standort: mapStandortStruktur(updated, zaehlerAnzahl), statusAlt: existing.status };
  }

  /**
   * Hartes DELETE (D2.6, "Korrektur von Fehlanlagen") — NUR Blattknoten OHNE
   * jede Verortungshistorie. Löscht in EINER Transaktion sowohl die
   * `identity.standort_pii`-Zeile (verhindert eine verwaiste PII-Zeile, kein
   * FK möglich, Linie 5) als auch den `energy.standort`-Knoten selbst.
   */
  async loeschen(standortId: string): Promise<StandortLoeschErgebnis> {
    const existing = await this.standortRepository.findById(standortId);
    if (existing === undefined) {
      throw nichtGefunden('Standort');
    }

    const [hatKinder, hatJemalsVerortung] = await Promise.all([
      this.standortRepository.hatKinder(standortId),
      this.zaehlerStandortRepository.hatJemalsVerortungAmStandort(standortId),
    ]);
    if (hatKinder) {
      throw konflikt('Standort hat Kinder — Hart-Loeschen ist nur fuer Blattknoten zulaessig (D2.6).');
    }
    if (hatJemalsVerortung) {
      throw konflikt('Standort hat eine (auch historische) Verortungshistorie — Hart-Loeschen ist nur ohne jede Verortungshistorie zulaessig (D2.6).');
    }

    await this.loeschenInTx(standortId);
    return {
      id: standortId,
      geloescht: true,
      endkundeId: existing.endkundeId,
      typ: existing.typ,
      parentIdAlt: existing.parentId,
    };
  }

  @Transactional(Propagation.Nested)
  private async loeschenInTx(standortId: string): Promise<void> {
    await this.standortPiiRepository.deleteByPseudonymId(standortId);
    const geloescht = await this.standortRepository.deleteById(standortId);
    if (!geloescht) {
      throw nichtGefunden('Standort');
    }
  }
}
