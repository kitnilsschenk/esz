export {
  fetchZwecke,
  fetchTextVersionen,
  fetchConsentStand,
  erteileEinwilligung,
  widerrufeEinwilligung,
  veroeffentlicheTextVersion,
  fetchWidersprueche,
  erklaereWiderspruch,
  nimmWiderspruchZurueck,
} from './consentApi';
export {
  useZwecke,
  useTextVersionen,
  useConsentStand,
  useEinwilligungErteilen,
  useEinwilligungWiderrufen,
  useTextVersionVeroeffentlichen,
  consentZweckKeys,
  consentTextKeys,
  consentStandKeys,
  useWidersprueche,
  useWiderspruchErklaeren,
  useWiderspruchZuruecknehmen,
  widerspruchKeys,
} from './useConsent';
export type { WiderrufInput, WiderspruchRuecknahmeInput } from './useConsent';
