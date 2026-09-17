/** Was das Portal über den angemeldeten Kunden zurückgibt — bewusst wenig. */
export interface PortalIchAntwort {
  readonly kennung: string;
  /**
   * Die Endkunden-Kennung. Sie steht hier, weil die Oberfläche damit die
   * eigenen Daten nachlädt — NICHT, damit sie irgendwo als Parameter
   * mitgegeben würde: Der Server nimmt sie ausschließlich aus der Sitzung.
   */
  readonly endkundeId: string;
}
