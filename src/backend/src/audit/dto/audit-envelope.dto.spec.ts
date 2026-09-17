import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { AuditEnvelopeDto } from './audit-envelope.dto';

describe('AuditEnvelopeDto (ADR-0003 §17.1 Struktur-Validierung, Defense-in-Depth zum Seal-Trigger)', () => {
  it('akzeptiert einen minimalen gültigen Envelope', async () => {
    const dto = plainToInstance(AuditEnvelopeDto, {
      eventTyp: 'test.objekt.erstellt',
      actorTyp: 'benutzer',
      ergebnis: 'ok',
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('lehnt unbekannte actorTyp-Werte ab', async () => {
    const dto = plainToInstance(AuditEnvelopeDto, { eventTyp: 'x', actorTyp: 'unbekannt', ergebnis: 'ok' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'actorTyp')).toBe(true);
  });

  it('lehnt unbekannte ergebnis-Werte ab', async () => {
    const dto = plainToInstance(AuditEnvelopeDto, { eventTyp: 'x', actorTyp: 'benutzer', ergebnis: 'vielleicht' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'ergebnis')).toBe(true);
  });

  it('lehnt kontext mit verschachtelten Objekten ab (rote Linie 1 — kein Freitext-Einfallstor)', async () => {
    const dto = plainToInstance(AuditEnvelopeDto, {
      eventTyp: 'x',
      actorTyp: 'benutzer',
      ergebnis: 'ok',
      kontext: { verschachtelt: { a: 1 } },
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'kontext')).toBe(true);
  });

  it('lehnt kontext mit Array-Werten ab', async () => {
    const dto = plainToInstance(AuditEnvelopeDto, {
      eventTyp: 'x',
      actorTyp: 'benutzer',
      ergebnis: 'ok',
      kontext: { liste: [1, 2, 3] },
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'kontext')).toBe(true);
  });

  it('akzeptiert kontext mit ausschließlich skalaren Werten (string/number/boolean/null)', async () => {
    const dto = plainToInstance(AuditEnvelopeDto, {
      eventTyp: 'x',
      actorTyp: 'benutzer',
      ergebnis: 'ok',
      kontext: { a: 'text', b: 1, c: true, d: null },
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('lehnt kontext mit übergroßem String-Wert ab (Werte-Cap)', async () => {
    const dto = plainToInstance(AuditEnvelopeDto, {
      eventTyp: 'x',
      actorTyp: 'benutzer',
      ergebnis: 'ok',
      kontext: { zu_lang: 'x'.repeat(1000) },
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'kontext')).toBe(true);
  });

  it('lehnt objektRef ab, die nicht UUID-förmig ist', async () => {
    const dto = plainToInstance(AuditEnvelopeDto, {
      eventTyp: 'x',
      actorTyp: 'benutzer',
      ergebnis: 'ok',
      objektRef: 'keine-uuid',
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'objektRef')).toBe(true);
  });

  it('akzeptiert eine UUIDv7-förmige objektRef (Versions-Nibble 7)', async () => {
    const dto = plainToInstance(AuditEnvelopeDto, {
      eventTyp: 'x',
      actorTyp: 'benutzer',
      ergebnis: 'ok',
      objektRef: '018f9a7a-7c1a-7c3a-9c3a-0123456789ab',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
