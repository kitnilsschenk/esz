/**
 * Bietet einen bereits geladenen Inhalt als Datei zum Speichern an.
 *
 * **Warum nicht einfach ein `<a href>` auf die API-Route?** Die
 * Download-Routen des EDMS verlangen `Authorization: Bearer <access>` (das
 * Access-Token lebt ausschließlich im Speicher, s. `authTokenStore` —
 * `.claude/rules/frontend-react.md`: kein Token in localStorage). Eine
 * Browser-Navigation schickt diesen Header nicht mit; ein direkter Link liefe
 * verlässlich in einen 401. Der Inhalt wird deshalb über den regulären
 * API-Client geholt und hier als `blob:`-URL an einen kurzlebigen,
 * programmatisch geklickten Anker gehängt.
 *
 * Die Objekt-URL wird unmittelbar wieder freigegeben — sie hielte sonst den
 * gesamten Dateiinhalt bis zum Neuladen der Seite im Speicher.
 *
 * Läuft NUR im Browser. In jsdom fehlt `URL.createObjectURL`; Aufrufer werden
 * daher in Tests gegen diese Funktion gemockt (sie ist bewusst ein eigenes
 * Modul, damit genau das möglich ist).
 */
export function bieteDateiZumSpeichernAn(dateiname: string, inhalt: string | Blob, mimeTyp: string): void {
  // Ein bereits fertiger `Blob` (Binaerdatei, z. B. die
  // Einsparungsnachweis-Mappe) wird NICHT erneut verpackt — `new Blob([blob])`
  // ginge zwar, aber der Server hat den Typ schon gesetzt, und ein zweiter
  // wuerde ihn ueberschreiben.
  const blob = inhalt instanceof Blob ? inhalt : new Blob([inhalt], { type: mimeTyp });
  const objektUrl = URL.createObjectURL(blob);
  try {
    const anker = document.createElement('a');
    anker.href = objektUrl;
    anker.download = dateiname;
    anker.rel = 'noopener';
    document.body.appendChild(anker);
    anker.click();
    anker.remove();
  } finally {
    URL.revokeObjectURL(objektUrl);
  }
}
