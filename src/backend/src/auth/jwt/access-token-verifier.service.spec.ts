import { beforeEach, describe, expect, it } from 'vitest';
import { AccessTokenVerificationError, AccessTokenVerifierService } from './access-token-verifier.service';
import { AuthConfigService } from '../auth.config';
import { createTestJwtIssuer } from '../test-support/jwt-test-support';
import type { TestJwtIssuer } from '../test-support/jwt-test-support';

const ISSUER_URL = 'http://localhost:8080/realms/edms';

function setRequiredEnv(): void {
  process.env['KEYCLOAK_ISSUER_URL'] = ISSUER_URL;
  process.env['OIDC_CLIENT_ID'] = 'edms-bff';
  process.env['EDMS_BFF_CLIENT_SECRET'] = 'test-secret';
  process.env['OIDC_REDIRECT_URI'] = 'http://localhost:3000/auth/callback';
}

describe('AccessTokenVerifierService (ADR-0002 Teil B §11 D1)', () => {
  let issuer: TestJwtIssuer;
  let verifier: AccessTokenVerifierService;

  beforeEach(async () => {
    setRequiredEnv();
    issuer = await createTestJwtIssuer();
    verifier = new AccessTokenVerifierService(issuer.keyResolver, new AuthConfigService());
  });

  it('akzeptiert ein gültig signiertes Token mit korrektem issuer', async () => {
    const token = await issuer.sign({ iss: ISSUER_URL, sub: 'sub-1' });
    const claims = await verifier.verify(token);
    expect(claims.sub).toBe('sub-1');
  });

  it('lehnt ein Token mit falschem issuer ab', async () => {
    const token = await issuer.sign({ iss: 'http://boese-seite.example/realms/edms', sub: 'sub-1' });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it('lehnt ein abgelaufenes Token ab (über die 5s-Clock-Skew-Toleranz hinaus)', async () => {
    const token = await issuer.sign({ iss: ISSUER_URL, sub: 'sub-1' }, { expiresIn: '-1h' });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it('lehnt ein Token ohne sub ab (requiredClaims)', async () => {
    const token = await issuer.sign({ iss: ISSUER_URL });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it('lehnt ein mit einem FREMDEN Schlüssel signiertes Token ab (Signaturprüfung gegen die gebundene JWKS)', async () => {
    const fremderIssuer = await createTestJwtIssuer();
    const token = await fremderIssuer.sign({ iss: ISSUER_URL, sub: 'sub-1' });

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it('lehnt ein none-alg-Token ab (Alg-Confusion-Schutz)', async () => {
    // jose erzwingt beim Signieren ohnehin einen Algorithmus — dieser Test
    // belegt zusätzlich, dass die Allowlist (RS256/ES256) greift, indem ein
    // strukturell kaputtes/unsigniertes Token abgelehnt wird.
    const fakeToken = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
      JSON.stringify({ iss: ISSUER_URL, sub: 'sub-1' }),
    ).toString('base64url')}.`;

    await expect(verifier.verify(fakeToken)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });
});
