/**
 * Gemeinsame, feldbezogene Konstante für Provisioning (Encrypt) UND
 * Reverse-Auflösung (Decrypt) — MUSS in beiden Richtungen identisch sein
 * (Teil der AAD, `FieldCipherService.buildAad(subjektId, feld)` = `LP(
 * subjektId)||LP(feld)`, ADR-0005 §26.2). Single-Source-of-Truth statt
 * zweier unabhängiger String-Literale, die auseinanderdriften könnten
 * (ein Drift würde JEDEN Decrypt mit einem GCM-Auth-Tag-Mismatch scheitern
 * lassen).
 */
export const FELD_DEVEUI = 'deveui';
