import type { ReactNode } from 'react';
import { t } from '../../../shared/i18n/t';
import { startLogin } from '../lib/startLogin';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../shared/ui/card';
import { KitConsultingMarke } from '../../../shared/branding/Marke';

/**
 * Minimaler Login-Screen (ADR-0002 Teil B §16). "Anmelden" navigiert den
 * Browser als Top-Level-Navigation zu `GET /auth/login` (Backend redirectet
 * zu Keycloak, PKCE S256 IdP-seitig erzwungen). Kein Formular, kein
 * direkter Keycloak-Kontakt aus der SPA (BFF-/Hybrid-Modell, A5).
 *
 * Zentrierte `Card` (Phase 4c-Feinschliff, Design-System) — dies ist die
 * GESAMTE Bildschirmfläche, solange `AuthGate` noch nicht authentifiziert
 * hat (keine Sidebar/Topbar). Das äußere `<section aria-labelledby>` bleibt
 * als benanntes Landmark erhalten (axe `region`); `CardTitle as="h1"`, weil
 * dies die einzige Überschrift der Seite ist.
 *
 * **Hier steht die Wortmarke, und zwar ÜBER der Überschrift.** Dies ist die
 * erste und oft einzige Ansicht, die jemand von aussen zu sehen bekommt —
 * ohne Sidebar, ohne Fusszeile, ohne jeden anderen Hinweis auf den Urheber.
 * Sie war bis hierher vollständig markenlos.
 *
 * Die Marke steht VOR der Ueberschrift im DOM, aber sie ist `alt`-versehen
 * und damit selbst kein Ueberschriftenersatz: Die Seitenstruktur bleibt
 * „eine h1, darunter Beschreibung, darunter Aktion".
 */
export function LoginScreen(): ReactNode {
  return (
    <section
      aria-labelledby="auth-login-heading"
      className="flex min-h-screen items-center justify-center bg-background p-6"
    >
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <KitConsultingMarke groesse="gross" className="mb-4" />
          <CardTitle id="auth-login-heading" as="h1">
            {t('auth.login.title')}
          </CardTitle>
          <CardDescription>{t('auth.login.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button type="button" onClick={startLogin}>
            {t('auth.login.action')}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
