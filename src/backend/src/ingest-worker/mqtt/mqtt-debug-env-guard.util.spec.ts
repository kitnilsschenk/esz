import { describe, expect, it } from 'vitest';
import { assertKeinMqttDebugLeckrisiko, mqttDebugEnvIstRiskant } from './mqtt-debug-env-guard.util';

describe('mqtt-debug-env-guard (SA-4 — DEBUG=mqtt*-Leck, fail-closed Startup-Selbstcheck)', () => {
  describe('mqttDebugEnvIstRiskant()', () => {
    it('ist false, wenn DEBUG nicht gesetzt ist', () => {
      expect(mqttDebugEnvIstRiskant(undefined)).toBe(false);
    });

    it('ist false bei einem leeren String', () => {
      expect(mqttDebugEnvIstRiskant('')).toBe(false);
      expect(mqttDebugEnvIstRiskant('   ')).toBe(false);
    });

    it('ist false bei einem voellig unabhaengigen Namespace', () => {
      expect(mqttDebugEnvIstRiskant('express:router')).toBe(false);
    });

    it('ist true bei DEBUG=mqtt*', () => {
      expect(mqttDebugEnvIstRiskant('mqtt*')).toBe(true);
    });

    it('ist true bei einem mqtt.js-internen Namespace wie mqttjs:client', () => {
      expect(mqttDebugEnvIstRiskant('mqttjs:client')).toBe(true);
    });

    it('ist true bei DEBUG=* (matcht ALLES, auch mqtt-Namespaces)', () => {
      expect(mqttDebugEnvIstRiskant('*')).toBe(true);
    });

    it('ist true, wenn EIN Eintrag einer Komma-Liste riskant ist (auch wenn andere es nicht sind)', () => {
      expect(mqttDebugEnvIstRiskant('express:router,mqtt*,http')).toBe(true);
    });

    it('ist case-insensitiv (DEBUG=MQTT* ist ebenso riskant)', () => {
      expect(mqttDebugEnvIstRiskant('MQTT*')).toBe(true);
    });

    it('wertet ein Negations-Muster NICHT als risikosenkend (konservativ, s. Begruendung)', () => {
      expect(mqttDebugEnvIstRiskant('*,-mqtt*')).toBe(true);
    });
  });

  describe('assertKeinMqttDebugLeckrisiko()', () => {
    it('wirft NICHT, wenn DEBUG unabhaengig vom mqtt-Namespace ist', () => {
      expect(() => assertKeinMqttDebugLeckrisiko('express:router')).not.toThrow();
    });

    it('wirft NICHT, wenn DEBUG unbesetzt ist', () => {
      expect(() => assertKeinMqttDebugLeckrisiko(undefined)).not.toThrow();
    });

    it('wirft fail-closed bei DEBUG=mqtt*', () => {
      expect(() => assertKeinMqttDebugLeckrisiko('mqtt*')).toThrow(/mqtt\*-Namespace-Muster/);
    });

    it('wirft fail-closed bei DEBUG=*', () => {
      expect(() => assertKeinMqttDebugLeckrisiko('*')).toThrow(/mqtt\*-Namespace-Muster/);
    });

    it('liest process.env.DEBUG als Default, wenn kein Argument uebergeben wird', () => {
      const original = process.env['DEBUG'];
      process.env['DEBUG'] = 'mqtt*';
      try {
        expect(() => assertKeinMqttDebugLeckrisiko()).toThrow();
      } finally {
        if (original === undefined) {
          delete process.env['DEBUG'];
        } else {
          process.env['DEBUG'] = original;
        }
      }
    });
  });
});
