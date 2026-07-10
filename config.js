// ─────────────────────────────────────────────────────────────
// CONFIGURAZIONE — modifica solo questo file, non app.js
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  // Da Google Cloud Console → APIs & Services → Credentials → OAuth Client ID (tipo "Web application")
  // Vedi README.md, sezione "Collegare Google Drive", per i passaggi esatti.
  GOOGLE_CLIENT_ID: "INCOLLA_QUI_IL_TUO_CLIENT_ID.apps.googleusercontent.com",

  // Scope minimo: l'app vede solo i file che crea lei stessa, non l'intero Drive.
  GOOGLE_DRIVE_SCOPE: "https://www.googleapis.com/auth/drive.file",
};
