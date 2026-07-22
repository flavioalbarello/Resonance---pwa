// ─────────────────────────────────────────────────────────────
// CONFIGURAZIONE — modifica solo questo file, non app.js
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  // Da Google Cloud Console → APIs & Services → Credentials → OAuth Client ID (tipo "Web application")
  // Vedi README.md, sezione "Collegare Google Drive", per i passaggi esatti.
  GOOGLE_CLIENT_ID: "1078828973632-tvtcjij9dj8hvam339qtrplq333rvm52.apps.googleusercontent.com",

  // Scope combinato: Drive (solo i file creati dall'app) + Calendar (braccio Shell/Calendar, 19/07/2026)
  // + Gmail send (invio feedback e bozze Arms confermate, 22/07/2026). Alla prossima autenticazione
  // Google chiederà di riconsentire — su entrambi i dispositivi, alla prima sincronizzazione dopo
  // questo aggiornamento.
  GOOGLE_DRIVE_SCOPE: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send",

  // Indirizzo email fisso dove arrivano le segnalazioni dal pulsante "Segnala" (canale feedback).
  // Mai scelto dal client — sempre e solo questo indirizzo, indipendentemente da chi invia.
  FEEDBACK_EMAIL: "progettoresonance@gmail.com",
};
