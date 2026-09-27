// Output minimization also covers contact numbers embedded in free-text notes.
export function withoutContactDetails(value) {
  return String(value ?? '')
    .replace(/(?:\+?90[\s().-]*)?0?[\s().-]*\(?[2-5]\d{2}\)?[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}\b/g, '[telefon gizlendi]')
    .replace(/\b[1-9]\d{10}\b/g, '[kimlik bilgisi gizlendi]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[e-posta gizlendi]');
}
