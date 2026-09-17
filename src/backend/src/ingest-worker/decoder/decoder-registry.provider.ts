import type { Provider } from '@nestjs/common';
import { DecoderRegistry } from './decoder-registry';
import { SynthetischReferenzV1Decoder } from './synthetisch-referenz-v1.decoder';
import { DezemHarvey2Decoder } from './dezem-harvey-2.decoder';

/**
 * ADR-0005 §23 (D11) — additive, code-basierte Registrierung. v1 registriert
 * GENAU den einen synthetischen Referenz-Gerätetyp; ein künftiger echter
 * Hardware-Decoder wird hier additiv ergänzt (kein Refactoring des
 * bestehenden Eintrags nötig).
 */
export const DECODER_REGISTRY_PROVIDER: Provider = {
  provide: DecoderRegistry,
  useFactory: (): DecoderRegistry => {
    const registry = new DecoderRegistry();
    registry.register(new SynthetischReferenzV1Decoder());
    registry.register(new DezemHarvey2Decoder());
    return registry;
  },
};
