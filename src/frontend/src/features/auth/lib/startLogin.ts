/**
 * Startet den OIDC-Login (ADR-0002 Teil B §12/§16): Browser-Top-Level-
 * Navigation zu `GET /auth/login` — das Backend erzeugt PKCE (S256,
 * IdP-seitig auf `edms-bff` erzwungen) + `state`/`nonce` und antwortet mit
 * 302 zu Keycloak. Bewusst KEIN `fetch`/`apiClient`-Aufruf: `/auth/login`
 * muss eine echte Top-Level-Navigation sein, damit der Keycloak-Rücksprung
 * (`GET /auth/callback`) den Vor-Auth-Cookie (`SameSite=Lax`) sieht und der
 * Browser dem 302 folgt — ein `fetch` würde den Redirect nur "leise"
 * auflösen, ohne die Adressleiste/den Login-Dialog zu zeigen.
 *
 * Relativer Pfad, analog zum Default-Verhalten des `apiClient`
 * (`src/shared/src/api/client.ts`: leere `VITE_API_BASE_URL` = same-origin
 * über den Vite-Dev-Proxy bzw. gemeinsames Deployment-Origin). Getrennte
 * Deployments mit eigener `VITE_API_BASE_URL` sind ein offener Punkt (siehe
 * Review-Hinweise) — v1 deckt den Standardfall.
 */
export function startLogin(): void {
  window.location.assign('/auth/login');
}
