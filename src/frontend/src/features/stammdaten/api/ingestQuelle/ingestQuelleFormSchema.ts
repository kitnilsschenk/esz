// Zod-Formular-Schema für „Datenquelle anlegen" — Feldgrenzen 1:1 gegen
// `QuelleAnlegenDto` gespiegelt.
//
// Die Prüfungen hier sind KEIN Ersatz für die serverseitigen: Sie sparen dem
// Bedienenden den Umweg über eine abgelehnte Anfrage, mehr nicht. Die
// verbindliche Entscheidung fällt im Backend und in der Datenbank.

import { z } from 'zod';
import type { TlsModus } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';

/** Reihenfolge = Anzeigereihenfolge der Auswahl. */
export const TLS_MODUS_WERTE: readonly TlsModus[] = ['kein_tls', 'tls', 'mtls'];

const QUELLE_CODE_FORM = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const BROKER_HOST_FORM = /^[A-Za-z0-9.\-_]+(:\d{1,5})?$/;
const PEM_FORM = /^-----BEGIN [A-Z0-9 ]+-----[\s\S]+-----END [A-Z0-9 ]+-----\s*$/;

/** Leer = „nicht angegeben"; sonst muss ein PEM-Block dastehen. */
const pemFeld = (fehler: string) =>
  z
    .string()
    .trim()
    .max(64_000)
    .refine((wert) => wert.length === 0 || PEM_FORM.test(wert), fehler);

export const quelleAnlegenFormSchema = z
  .object({
    quelleCode: z
      .string()
      .trim()
      .min(1, t('stammdaten.ingestQuelle.form.errors.codeErforderlich'))
      .regex(QUELLE_CODE_FORM, t('stammdaten.ingestQuelle.form.errors.codeForm')),
    bezeichnung: z
      .string()
      .trim()
      .min(1, t('stammdaten.ingestQuelle.form.errors.bezeichnungErforderlich'))
      .max(200, t('stammdaten.ingestQuelle.form.errors.bezeichnungZuLang')),
    brokerHost: z
      .string()
      .trim()
      .min(1, t('stammdaten.ingestQuelle.form.errors.brokerErforderlich'))
      .max(255)
      .regex(BROKER_HOST_FORM, t('stammdaten.ingestQuelle.form.errors.brokerForm')),
    topic: z
      .string()
      .trim()
      .min(1, t('stammdaten.ingestQuelle.form.errors.topicErforderlich'))
      .max(255),
    clientId: z
      .string()
      .trim()
      .min(1, t('stammdaten.ingestQuelle.form.errors.clientIdErforderlich'))
      .max(128),
    tlsModus: z.string().min(1),
    benutzername: z.string().trim().max(255),
    passwort: z.string().max(1024),
    caZertifikat: pemFeld(t('stammdaten.ingestQuelle.form.errors.pemForm')),
    clientZertifikat: pemFeld(t('stammdaten.ingestQuelle.form.errors.pemForm')),
    clientSchluessel: pemFeld(t('stammdaten.ingestQuelle.form.errors.pemForm')),
    notiz: z.string().trim().max(2000),
  })
  // Bei mTLS gehören Zertifikat UND Schlüssel dazu. Die Datenbank lehnt das
  // ohnehin ab; hier steht es, damit der Hinweis AM Feld erscheint statt als
  // Fehlermeldung nach dem Absenden.
  .refine((werte) => werte.tlsModus !== 'mtls' || werte.clientZertifikat.length > 0, {
    path: ['clientZertifikat'],
    message: t('stammdaten.ingestQuelle.form.errors.mtlsZertifikat'),
  })
  .refine((werte) => werte.tlsModus !== 'mtls' || werte.clientSchluessel.length > 0, {
    path: ['clientSchluessel'],
    message: t('stammdaten.ingestQuelle.form.errors.mtlsSchluessel'),
  })
  // Ein Passwort ohne Benutzername ist bei MQTT nicht verwendbar.
  .refine((werte) => werte.passwort.length === 0 || werte.benutzername.length > 0, {
    path: ['benutzername'],
    message: t('stammdaten.ingestQuelle.form.errors.passwortBrauchtBenutzer'),
  });

export type QuelleAnlegenFormValues = z.infer<typeof quelleAnlegenFormSchema>;

export const quelleAnlegenFormDefaultValues: QuelleAnlegenFormValues = {
  quelleCode: '',
  bezeichnung: '',
  brokerHost: '',
  // Der Standard-Topic von ChirpStack v4 — der Fall, den fast jeder braucht.
  topic: 'application/+/device/+/event/up',
  clientId: 'edms-ingest-worker',
  tlsModus: 'tls',
  benutzername: '',
  passwort: '',
  caZertifikat: '',
  clientZertifikat: '',
  clientSchluessel: '',
  notiz: '',
};
