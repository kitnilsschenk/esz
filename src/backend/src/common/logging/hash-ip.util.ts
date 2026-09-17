import { createHash } from 'node:crypto';

/**
 * Einweg-Hash einer Client-IP für Security-Logs (ADR-0002 §15,
 * `security-lead`-Votum 4: "ggf. IP-Hash", NIE die rohe IP). SHA-256,
 * gekürzt auf 16 Hex-Zeichen (64 Bit) — genug Entropie, um dieselbe IP über
 * mehrere Log-Zeilen hinweg zu korrelieren (Brute-Force-/Incident-Analyse),
 * ohne die IP selbst zu speichern.
 *
 * Bewusst KEIN Salt aus einer Konfigurationsquelle: ein Salt würde die
 * Korrelierbarkeit über Prozess-Neustarts hinweg zerstören, die für
 * Incident-Recherche (Persona B, ADR-0003) gerade gebraucht wird; das Ziel
 * ist Datensparsamkeit (keine Klartext-IP im Log), nicht Unlinkability.
 */
export function hashIp(ip: string | undefined): string | undefined {
  if (ip === undefined || ip.length === 0) {
    return undefined;
  }

  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}
