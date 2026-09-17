import { createResourceQueryKeys } from '../shared';

// Eigene Query-Key-Factory für die Shred-Antrag-Sub-Ressource des Endkunden
// (ADR-0009) — bewusst GETRENNT von `endkundeKeys`: der „offener Antrag"-Read
// (`useEndkundeShredAntragOffen`, EIN Wert je Endkunde über
// `.detail(endkundeId)`) sowie die Beantragen-/Freigeben-/Ablehnen-Mutationen
// invalidieren unabhängig vom Endkunde-Detail-Cache (z. B. ändert
// „beantragen" den Endkunde-Datensatz selbst NICHT).
export const shredAntragKeys = createResourceQueryKeys('endkunde-shred-antrag');
