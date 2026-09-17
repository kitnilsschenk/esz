import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { alsErklaerungNachErfassung, EinwilligungService } from './einwilligung.service';
import type { EinwilligungErteilenInput } from './einwilligung.service';
import { ensureNoOpTransactionHost } from '../stammdaten/test-support/init-noop-transaction-host';
import type { ConsentRepository } from './persistence/consent.repository';
import type { IdentityEndkundePiiRepository } from '../stammdaten/persistence/identity/identity-endkunde-pii.repository';
import type { IdentityAnschlussnutzerPiiRepository } from '../stammdaten/persistence/identity/identity-anschlussnutzer-pii.repository';
import type { EinwilligungItem, TextVersionItem, ZweckItem } from './consent.types';

const ENDKUNDE_ID = '018f1e2d-0000-7000-8000-00000000000e';
const KEY_ID = '018f1e2d-0000-7000-8000-0000000000ff';

const ZWECKE: readonly ZweckItem[] = [
  { code: 'nutzerinformation', bezeichnung: 'Monatliche Nutzerinformation', beschreibung: '…' },
  { code: 'mehrwertdienste', bezeichnung: 'Mehrwertdienste', beschreibung: '…' },
  { code: 'messdaten_verarbeitung', bezeichnung: 'Verbrauchsmessung', beschreibung: '…' },
];

/**
 * Die Matrix, wie V0047 sie fuer einen ANSCHLUSSNUTZER liefert. Die Tests
 * laufen bewusst auf dieser Subjektart: Beim Endkunden traegt die
 * Kernverarbeitung ein Vertrag, und dort gibt es gar nichts zu erteilen.
 */
const MATRIX_ANSCHLUSSNUTZER = [
  {
    zweckCode: 'nutzerinformation',
    subjektTyp: 'anschlussnutzer' as const,
    rechtsgrundlage: 'einwilligung_art6_1a' as const,
    erlaubnismodus: 'opt_in' as const,
    verweigerbar: true,
    begruendung: 'Kein Vertrag, also lit. a.',
  },
  {
    zweckCode: 'mehrwertdienste',
    subjektTyp: 'anschlussnutzer' as const,
    rechtsgrundlage: 'einwilligung_art6_1a' as const,
    erlaubnismodus: 'opt_in' as const,
    verweigerbar: true,
    begruendung: 'Per Definition zusaetzlich.',
  },
];

/** Beim ENDKUNDEN traegt die Kernverarbeitung ein Vertrag — nicht erteilbar. */
const MATRIX_ENDKUNDE = [
  {
    zweckCode: 'messdaten_verarbeitung',
    subjektTyp: 'endkunde' as const,
    rechtsgrundlage: 'vertrag_art6_1b' as const,
    erlaubnismodus: 'vertraglich' as const,
    verweigerbar: false,
    begruendung: 'Der Endkunde ist Vertragspartei; die Messung ist der Vertragsgegenstand.',
  },
];

const TEXT: TextVersionItem = {
  id: '018f1e2d-0000-7000-8000-000000000t01'.replace('t', 'a'),
  zweckCode: 'nutzerinformation',
  fassung: '1.0',
  wortlaut: 'Synthetischer Beispieltext fuer die monatliche Nutzerinformation.',
  wortlautSha256: 'a'.repeat(64),
  gueltigAb: '2026-01-01T00:00:00.000Z',
  gueltigBis: null,
};

const ERTEILT: EinwilligungItem = {
  id: '018f1e2d-0000-7000-8000-0000000000c1',
  subjektTyp: 'anschlussnutzer',
  subjektId: ENDKUNDE_ID,
  zweckCode: 'nutzerinformation',
  textVersionId: TEXT.id,
  fassung: '1.0',
  rechtsgrundlage: 'einwilligung_art6_1a',
  erfassungsweg: 'vertrag_schriftlich',
  quelleRef: 'AZ-2026-0815',
  widerrufErfassungsweg: null,
  widerrufQuelleRef: null,
  erteiltAt: '2026-03-14T09:22:00.000Z',
  widerrufenAt: null,
  wirksam: true,
};

/** Ein Erklaerungszeitpunkt in der Vergangenheit — der Regelfall beim Nachtragen. */
const ERKLAERT_AM = '2026-03-14T09:22:00.000Z';

const WIDERRUF_EINGABE = {
  widerrufenAt: '2026-08-01T10:00:00.000Z',
  erfassungsweg: 'vertrag_schriftlich',
  quelleRef: 'AZ-2026-0999',
} as const;

function pgFehler(code: string, constraint: string): Error & { code: string; constraint: string } {
  return Object.assign(new Error('constraint violation'), { code, constraint });
}

describe('EinwilligungService (ADR-0012 B1)', () => {
  // Einzelne Mock-Referenzen statt eines Record-Zugriffs: Unter
  // `noUncheckedIndexedAccess` waere `repo['x']` vom Typ `Mock | undefined`,
  // und jede Assertion muesste das wegcasten.
  let findZwecke: Mock;
  let findMatrixFuerSubjektTyp: Mock;
  let findGueltigeTextVersion: Mock;
  let insertTextVersion: Mock;
  let schliesseOffeneTextVersion: Mock;
  let findEinwilligungenFuerSubjekt: Mock;
  let findEinwilligungById: Mock;
  let insertEinwilligung: Mock;
  let insertBeleg: Mock;
  let widerrufeEinwilligung: Mock;
  let service: EinwilligungService;

  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  beforeEach(() => {
    findZwecke = vi.fn().mockResolvedValue(ZWECKE);
    findMatrixFuerSubjektTyp = vi.fn().mockResolvedValue(MATRIX_ANSCHLUSSNUTZER);
    findGueltigeTextVersion = vi.fn().mockResolvedValue(TEXT);
    insertTextVersion = vi.fn().mockResolvedValue(TEXT);
    schliesseOffeneTextVersion = vi.fn().mockResolvedValue(undefined);
    findEinwilligungenFuerSubjekt = vi.fn().mockResolvedValue([ERTEILT]);
    findEinwilligungById = vi.fn().mockResolvedValue(ERTEILT);
    insertEinwilligung = vi.fn().mockResolvedValue(ERTEILT.id);
    insertBeleg = vi.fn().mockResolvedValue(undefined);
    widerrufeEinwilligung = vi.fn().mockResolvedValue(true);

    const repo = {
      findZwecke,
      findMatrixFuerSubjektTyp,
      findTextVersionen: vi.fn().mockResolvedValue([TEXT]),
      findGueltigeTextVersion,
      insertTextVersion,
      schliesseOffeneTextVersion,
      findEinwilligungenFuerSubjekt,
      findEinwilligungById,
      insertEinwilligung,
      insertBeleg,
      widerrufeEinwilligung,
    };

    service = new EinwilligungService(
      repo as unknown as ConsentRepository,
      { findByPseudonymId: vi.fn().mockResolvedValue({ cryptoKeyId: KEY_ID }) } as unknown as IdentityEndkundePiiRepository,
      {
        findByPseudonymId: vi.fn().mockResolvedValue({ cryptoKeyId: KEY_ID }),
      } as unknown as IdentityAnschlussnutzerPiiRepository,
    );
  });

  function erteilen(overrides: Partial<EinwilligungErteilenInput> = {}): Promise<EinwilligungItem> {
    return service.erteile({
      subjektTyp: 'anschlussnutzer',
      subjektId: ENDKUNDE_ID,
      zweckCode: 'nutzerinformation',
      erfassungsweg: 'vertrag_schriftlich',
      erteiltAt: ERKLAERT_AM,
      quelleRef: 'AZ-2026-0815',
      ...overrides,
    });
  }

  describe('digitales Opt-in ueber die Betriebssicht', () => {
    it('wird abgelehnt — die IP waere die des Bearbeiters, nicht die der betroffenen Person', async () => {
      // Der Kern: Ein Beleg, der einen digitalen Vorgang behauptet, den es
      // nie gab, an einer Adresse, die nicht zur Person gehoert, ist eine
      // Faelschung des Nachweises — nicht bloss eine Ungenauigkeit.
      await expect(erteilen({ erfassungsweg: 'digital_opt_in' })).rejects.toBeInstanceOf(BadRequestException);
      expect(insertEinwilligung).not.toHaveBeenCalled();
      expect(insertBeleg).not.toHaveBeenCalled();
    });

    it('nennt in der Ablehnung den zulaessigen Weg', async () => {
      const fehler = await erteilen({ erfassungsweg: 'digital_opt_in' }).catch((e: unknown) => e);

      expect((fehler as Error).message).toContain('vertrag_schriftlich');
      // `uebernahme_altbestand` wird NICHT mehr als Ausweg genannt — er ist
      // seit AW-20 selbst gesperrt (s. naechster Block).
      expect((fehler as Error).message).not.toContain('uebernahme_altbestand');
    });
  });

  describe('uebernahme_altbestand ist gesperrt (Votum 2026-09-07, AW-20)', () => {
    it('lehnt das Erfassen ab — es gibt keinen Altbestand, also auch keinen Vorgang dahinter', async () => {
      await expect(erteilen({ erfassungsweg: 'uebernahme_altbestand' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(insertEinwilligung).not.toHaveBeenCalled();
      expect(insertBeleg).not.toHaveBeenCalled();
    });

    it('begruendet die Sperre nachvollziehbar', async () => {
      const fehler = await erteilen({ erfassungsweg: 'uebernahme_altbestand' }).catch((e: unknown) => e);

      expect((fehler as Error).message).toContain('gesperrt');
      expect((fehler as Error).message).toContain('vertrag_schriftlich');
    });

    it('lehnt auch den Widerruf auf diesem Weg ab', async () => {
      const fehler = await service
        .widerrufe(ERTEILT.id, { ...WIDERRUF_EINGABE, erfassungsweg: 'uebernahme_altbestand' })
        .catch((e: unknown) => e);

      expect(fehler).toBeInstanceOf(BadRequestException);
      expect(widerrufeEinwilligung).not.toHaveBeenCalled();
    });
  });

  describe('Erfassen', () => {
    it('schreibt Fachzeile UND Beleg — eine Einwilligung ohne Nachweis waere wertlos', async () => {
      await erteilen();

      expect(insertEinwilligung).toHaveBeenCalledTimes(1);
      expect(insertBeleg).toHaveBeenCalledTimes(1);
    });

    it('verschluesselt den Beleg mit dem Schluessel DER PERSON — damit ein Krypto-Shred ihn erfasst', async () => {
      await erteilen();

      expect((insertBeleg.mock.calls[0]?.[0] as { cryptoKeyId: string }).cryptoKeyId).toBe(KEY_ID);
    });

    it('schreibt KEINE IP auf den schriftlichen Weg', async () => {
      await erteilen();

      const beleg = insertBeleg.mock.calls[0]?.[0] as { ipEnc: unknown };
      expect(beleg.ipEnc).toBeUndefined();
    });

    it('nimmt die zum Erteilungszeitpunkt GUELTIGE Fassung, nicht irgendeine', async () => {
      await erteilen();

      expect(findGueltigeTextVersion).toHaveBeenCalledWith('nutzerinformation', expect.any(Date));
      expect((insertEinwilligung.mock.calls[0]?.[0] as { textVersionId: string }).textVersionId).toBe(TEXT.id);
    });

    it('lehnt ab, wenn zu diesem Zweck gar keine Erklaerung veroeffentlicht ist', async () => {
      // Man kann nicht einer Erklaerung zustimmen, die es nicht gibt.
      findGueltigeTextVersion.mockResolvedValueOnce(undefined);

      await expect(erteilen()).rejects.toBeInstanceOf(BadRequestException);
      expect(insertEinwilligung).not.toHaveBeenCalled();
    });

    it('lehnt ab, wenn zur Person kein Stammdatensatz existiert', async () => {
      service = new EinwilligungService(
        {
          findZwecke,
          findMatrixFuerSubjektTyp,
          findGueltigeTextVersion,
          insertEinwilligung,
          insertBeleg,
          findEinwilligungById,
        } as unknown as ConsentRepository,
        { findByPseudonymId: vi.fn().mockResolvedValue(undefined) } as unknown as IdentityEndkundePiiRepository,
        { findByPseudonymId: vi.fn() } as unknown as IdentityAnschlussnutzerPiiRepository,
      );

      await expect(erteilen()).rejects.toBeInstanceOf(NotFoundException);
    });

    it('meldet 409, wenn zu diesem Zweck bereits eine wirksame Einwilligung besteht', async () => {
      insertEinwilligung.mockRejectedValueOnce(
        pgFehler('23505', 'ux_einwilligung_wirksam_endkunde'),
      );

      await expect(erteilen()).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('Widerruf', () => {
    it('setzt den Zeitpunkt und loescht nichts', async () => {
      await service.widerrufe(ERTEILT.id, WIDERRUF_EINGABE);

      expect(widerrufeEinwilligung).toHaveBeenCalledWith(ERTEILT.id, expect.any(Date));
    });

    it('ueberschreibt einen bereits gesetzten Widerruf NICHT', async () => {
      // Sonst verschoebe sich die Aussage, ab wann die Verarbeitung ohne
      // Grundlage lief.
      findEinwilligungById.mockResolvedValue({
        ...ERTEILT,
        widerrufenAt: '2026-08-01T00:00:00.000Z',
        wirksam: false,
      });
      widerrufeEinwilligung.mockResolvedValueOnce(false);

      const fehler = await service.widerrufe(ERTEILT.id, WIDERRUF_EINGABE).catch((e: unknown) => e);

      expect(fehler).toBeInstanceOf(ConflictException);
      expect((fehler as Error).message).toContain('2026-08-01');
    });

    it('meldet 404 fuer eine unbekannte Einwilligung', async () => {
      findEinwilligungById.mockResolvedValueOnce(undefined);

      await expect(service.widerrufe(ERTEILT.id, WIDERRUF_EINGABE)).rejects.toBeInstanceOf(NotFoundException);
      expect(widerrufeEinwilligung).not.toHaveBeenCalled();
    });
  });

  describe('Stand eines Subjekts', () => {
    it('fuehrt AUCH Zwecke ohne Einwilligung — sonst bliebe das Nicht-Erteilte unsichtbar', async () => {
      const stand = await service.standFuerSubjekt('endkunde', ENDKUNDE_ID);

      expect(stand.zwecke).toHaveLength(2);
      const ohne = stand.zwecke.find((z) => z.zweckCode === 'mehrwertdienste');
      expect(ohne?.wirksameEinwilligung).toBeNull();
      expect(ohne?.verlauf).toEqual([]);
    });

    it('haelt den Verlauf vor, nicht nur den aktuellen Stand', async () => {
      const widerrufen = { ...ERTEILT, id: 'alt', widerrufenAt: '2026-05-01T00:00:00.000Z', wirksam: false };
      findEinwilligungenFuerSubjekt.mockResolvedValueOnce([ERTEILT, widerrufen]);

      const stand = await service.standFuerSubjekt('endkunde', ENDKUNDE_ID);
      const zweck = stand.zwecke.find((z) => z.zweckCode === 'nutzerinformation');

      expect(zweck?.verlauf).toHaveLength(2);
      expect(zweck?.wirksameEinwilligung?.id).toBe(ERTEILT.id);
    });
  });

  describe('Textfassungen', () => {
    it('bildet den Hash selbst — ein mitgelieferter waere eine Behauptung', async () => {
      await service.veroeffentlicheTextVersion({
        zweckCode: 'nutzerinformation',
        fassung: '2.0',
        wortlaut: 'Ein hinreichend langer synthetischer Beispieltext.',
      });

      const eingabe = insertTextVersion.mock.calls[0]?.[0] as { wortlautSha256: Buffer };
      expect(eingabe.wortlautSha256).toBeInstanceOf(Buffer);
      expect(eingabe.wortlautSha256).toHaveLength(32);
    });

    it('schliesst die bisherige Fassung, BEVOR die neue geschrieben wird', async () => {
      await service.veroeffentlicheTextVersion({
        zweckCode: 'nutzerinformation',
        fassung: '2.0',
        wortlaut: 'Ein hinreichend langer synthetischer Beispieltext.',
      });

      expect(schliesseOffeneTextVersion.mock.invocationCallOrder[0]).toBeLessThan(
        insertTextVersion.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
      );
    });

    it('lehnt einen unbekannten Zweck ab', async () => {
      await expect(
        service.veroeffentlicheTextVersion({
          zweckCode: 'ausgedachter_zweck',
          fassung: '1.0',
          wortlaut: 'Ein hinreichend langer synthetischer Beispieltext.',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
  describe('Erklaerungszeitpunkt statt Erfassungszeitpunkt (A12-27, Teil-Veto)', () => {
    it('schreibt den ERKLAERTEN Zeitpunkt, nicht den der Erfassung', async () => {
      // Der Kern des Teil-Vetos: Eine im Maerz unterschriebene, im September
      // erfasste Einwilligung wies bis V0046 den September aus -- und liess
      // damit ein halbes Jahr rechtmaessiger Verarbeitung als grundlos
      // erscheinen. Vor dem Fix war dieser Test rot.
      await erteilen();

      const eingabe = insertEinwilligung.mock.calls[0]?.[0] as { erteiltAt: Date };
      expect(eingabe.erteiltAt.toISOString()).toBe(ERKLAERT_AM);
    });

    it('sucht die Textfassung zum ERKLAERUNGSZEITPUNKT, nicht zum Erfassungszeitpunkt', async () => {
      // Sonst bekaeme eine nachgetragene Alt-Einwilligung rueckwirkend eine
      // Fassung untergeschoben, die es bei ihrer Erklaerung nicht gab.
      await erteilen();

      const [, stichtag] = findGueltigeTextVersion.mock.calls[0] as [string, Date];
      expect(stichtag.toISOString()).toBe(ERKLAERT_AM);
    });

    it('weist einen Erklaerungszeitpunkt in der ZUKUNFT ab', async () => {
      const morgen = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await expect(erteilen({ erteiltAt: morgen })).rejects.toBeInstanceOf(BadRequestException);
      expect(insertEinwilligung).not.toHaveBeenCalled();
    });

    it('weist einen Widerruf VOR der Erteilung ab', async () => {
      const fehler = await service
        .widerrufe(ERTEILT.id, { ...WIDERRUF_EINGABE, widerrufenAt: '2026-01-01T00:00:00.000Z' })
        .catch((e: unknown) => e);

      expect(fehler).toBeInstanceOf(BadRequestException);
      expect(widerrufeEinwilligung).not.toHaveBeenCalled();
    });

    it('uebernimmt den erklaerten Widerrufszeitpunkt', async () => {
      // Ein am 1. brieflich erklaerter, am 20. erfasster Widerruf liesse
      // sonst neunzehn Tage rechtswidriger Verarbeitung rechtmaessig
      // aussehen -- zulasten der betroffenen Person.
      await service.widerrufe(ERTEILT.id, WIDERRUF_EINGABE);

      const [, zeitpunkt] = widerrufeEinwilligung.mock.calls[0] as [string, Date];
      expect(zeitpunkt.toISOString()).toBe(WIDERRUF_EINGABE.widerrufenAt);
    });
  });

  describe('Belege fuer beide Vorgaenge (A12-28/A12-29)', () => {
    it('belegt die Erteilung mit Fundstelle', async () => {
      await erteilen();

      const beleg = insertBeleg.mock.calls[0]?.[0] as { art: string; quelleRef: string };
      expect(beleg.art).toBe('erteilung');
      expect(beleg.quelleRef).toBe('AZ-2026-0815');
    });

    it('belegt AUCH den Widerruf — mit eigenem Kanal und eigener Fundstelle', async () => {
      // Bis V0046 war die Erteilung dreifach belegt und der Widerruf
      // einfach. Art. 7 Abs. 3 S. 4: Der Widerruf muss so einfach sein wie
      // die Erteilung — dann muss er auch so belegt sein.
      await service.widerrufe(ERTEILT.id, WIDERRUF_EINGABE);

      const beleg = insertBeleg.mock.calls[0]?.[0] as { art: string; quelleRef: string };
      expect(beleg.art).toBe('widerruf');
      expect(beleg.quelleRef).toBe(WIDERRUF_EINGABE.quelleRef);
    });

    it('lehnt einen digital erklaerten Widerruf ueber die Betriebssicht ab', async () => {
      const fehler = await service
        .widerrufe(ERTEILT.id, { ...WIDERRUF_EINGABE, erfassungsweg: 'digital_opt_in' })
        .catch((e: unknown) => e);

      expect(fehler).toBeInstanceOf(BadRequestException);
      expect(widerrufeEinwilligung).not.toHaveBeenCalled();
    });
  });
  describe('Rechtsgrundlagen-Matrix (A12-1/A12-3, Votum zu O1)', () => {
    it('nimmt die Grundlage aus der Matrix — der Aufrufer waehlt sie nicht', async () => {
      await erteilen();

      const eingabe = insertEinwilligung.mock.calls[0]?.[0] as { rechtsgrundlage: string };
      expect(eingabe.rechtsgrundlage).toBe('einwilligung_art6_1a');
    });

    it('lehnt eine Erteilung ab, wo ein VERTRAG traegt', async () => {
      // Der haeufigste Fehler waere, dem Endkunden ein Haekchen fuer die
      // Verbrauchsmessung vorzulegen: Das verspraeche eine Widerrufbarkeit,
      // die er nicht einloesen kann — die Messung liefe weiter, weil der
      // Vertrag sie schuldet.
      findMatrixFuerSubjektTyp.mockResolvedValueOnce(MATRIX_ENDKUNDE);

      const fehler = await erteilen({ subjektTyp: 'endkunde', zweckCode: 'messdaten_verarbeitung' }).catch(
        (e: unknown) => e,
      );

      expect(fehler).toBeInstanceOf(BadRequestException);
      expect((fehler as Error).message).toContain('vertraglich');
      expect(insertEinwilligung).not.toHaveBeenCalled();
    });

    it('lehnt einen Zweck ab, der fuer diese Subjektart nicht vorgesehen ist', async () => {
      const fehler = await erteilen({ zweckCode: 'gibt_es_nicht' }).catch((e: unknown) => e);

      expect(fehler).toBeInstanceOf(BadRequestException);
      expect(insertEinwilligung).not.toHaveBeenCalled();
    });

    it('verweigert den Widerruf einer vertraglichen Grundlage (A12-3)', async () => {
      // Sonst entstuende ein Pflichtereignis im append-only Audit-Log ueber
      // einen Vorgang, den es rechtlich nicht gibt.
      findEinwilligungById.mockResolvedValue({ ...ERTEILT, rechtsgrundlage: 'vertrag_art6_1b' });

      const fehler = await service.widerrufe(ERTEILT.id, WIDERRUF_EINGABE).catch((e: unknown) => e);

      expect(fehler).toBeInstanceOf(ConflictException);
      expect((fehler as Error).message).toContain('Vertrag');
      expect(widerrufeEinwilligung).not.toHaveBeenCalled();
    });

    it('liefert im Stand die Grundlage samt Begruendung mit', async () => {
      // Wer eine Rechtsgrundlage erfasst, soll wissen, warum sie gilt --
      // sonst ist die Matrix eine Blackbox, die Eingaben ablehnt.
      const stand = await service.standFuerSubjekt('anschlussnutzer', ENDKUNDE_ID);
      const zweck = stand.zwecke.find((z) => z.zweckCode === 'nutzerinformation');

      expect(zweck?.rechtsgrundlage).toBe('einwilligung_art6_1a');
      expect(zweck?.erlaubnismodus).toBe('opt_in');
      expect(zweck?.begruendung).toContain('lit. a');
    });

    it('blendet Zwecke aus, die fuer diese Subjektart keine Matrix-Zeile haben', async () => {
      // Ein Zweck ohne Grundlage anzuzeigen waere eine Einladung, ihn
      // trotzdem zu erfassen.
      const stand = await service.standFuerSubjekt('anschlussnutzer', ENDKUNDE_ID);

      expect(stand.zwecke.map((z) => z.zweckCode)).not.toContain('messdaten_verarbeitung');
    });
  });
});

/**
 * Die Uebersetzung der beiden V0046-Grenzen. Sie bekommt einen UNIT-Test und
 * keinen Integrationstest, weil das Fenster, in dem sie greift, von aussen
 * nicht deterministisch zu treffen ist: Es liegt zwischen dem Beginn der
 * Request-Transaktion und der Node-seitigen Zeitpruefung, also bei wenigen
 * Millisekunden. Ein Integrationstest darauf waere ein Wuerfelwurf.
 */
describe('alsErklaerungNachErfassung (V0046-Grenzen)', () => {
  it('uebersetzt die Widerrufs-Grenze in eine erklaerende 400', () => {
    const fehler = alsErklaerungNachErfassung(
      { code: '23514', constraint: 'ck_einwilligung_widerruf_nicht_nach_erfassung' },
      'widerrufenAt',
    );

    expect(fehler).toBeInstanceOf(BadRequestException);
    expect(fehler?.message).toContain('nach der eigenen Erfassung');
    // Der Hinweis auf die letzte Sekunde ist der eigentliche Dienst an der
    // Bedienung: Ohne ihn probiert jemand denselben Wert noch dreimal.
    expect(fehler?.message).toContain('letzten Sekunde');
  });

  it('uebersetzt auch die Erteilungs-Grenze', () => {
    expect(
      alsErklaerungNachErfassung(
        { code: '23514', constraint: 'ck_einwilligung_erteilt_nicht_nach_erfassung' },
        'erteiltAt',
      ),
    ).toBeInstanceOf(BadRequestException);
  });

  it('laesst jede ANDERE Check-Verletzung durch', () => {
    // Sonst bekaeme der Aufrufer die Schuld fuer etwas, dessen Ursache wir
    // nicht kennen.
    expect(
      alsErklaerungNachErfassung({ code: '23514', constraint: 'ck_irgendetwas_anderes' }, 'erteiltAt'),
    ).toBeUndefined();
  });

  it('laesst einen anderen Fehlercode durch', () => {
    expect(
      alsErklaerungNachErfassung(
        { code: '23505', constraint: 'ck_einwilligung_widerruf_nicht_nach_erfassung' },
        'widerrufenAt',
      ),
    ).toBeUndefined();
  });

  it('kommt mit einem Nicht-Postgres-Fehler zurecht', () => {
    expect(alsErklaerungNachErfassung(undefined, 'erteiltAt')).toBeUndefined();
  });
});
