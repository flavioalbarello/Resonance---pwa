# Resonance PWA

App installabile su Android/iOS, indipendente da Claude. Nessun build step: apre direttamente in browser tramite moduli ESM (Preact + htm da CDN).

## 1. Pubblicarla online (serve un dominio HTTPS perché Android la installi)

Opzione più semplice — **Vercel**:
1. Crea un account su vercel.com (gratuito)
2. Trascina questa cartella nella dashboard, oppure `vercel deploy` da terminale se hai Node
3. Ottieni un URL tipo `resonance-tuonome.vercel.app`

In alternativa: Netlify (drag & drop della cartella) o GitHub Pages — stesso risultato, gratuito.

## 2. Installarla su Android
1. Apri l'URL pubblicato in Chrome
2. Menu (⋮) → "Aggiungi a schermata Home" / "Installa app"
3. Da quel momento si apre come app a sé stante, icona propria, senza barra del browser

## 3. Motore AI
Vai in **Setup** nell'app e inserisci una chiave:
- **OpenRouter** (consigliato — un'unica chiave per Gemini/Kimi/DeepSeek/Llama/Claude): crea un account su openrouter.ai, genera una chiave in Settings → Keys, carica qualche euro di credito
- **Claude diretto**: chiave da console.anthropic.com — sperimentale, alcuni browser possono bloccare la richiesta (CORS); se non funziona usa OpenRouter con il modello Claude

La chiave resta solo sul tuo dispositivo (localStorage), non passa da server intermedi.

## 4. Collegare Google Drive (opzionale, per la sincronizzazione reale)
1. Vai su [console.cloud.google.com](https://console.cloud.google.com) → crea un progetto
2. APIs & Services → Library → abilita **Google Drive API**
3. APIs & Services → Credentials → Create Credentials → **OAuth Client ID** → tipo "Web application"
4. In "Authorized JavaScript origins" aggiungi l'URL esatto dove hai pubblicato l'app (es. `https://resonance-tuonome.vercel.app`)
5. Copia il Client ID generato (finisce in `.apps.googleusercontent.com`)
6. Incollalo in `config.js`, campo `GOOGLE_CLIENT_ID`
7. Ricarica l'app, vai in Setup → "Testa connessione Drive"

Per cambiare account Google in futuro: basta disconnettersi da quell'account Google nel browser e riconnettersi — l'app userà l'account attivo in quel momento, nessuna modifica al codice necessaria.

## Roadmap

**Fase 1 — fatto**: shell PWA installabile, dati salvati sul dispositivo, Triade Magi multi-motore, Agente AIR con ricerca web reale on-demand, pillar log, Kernel versionato.

**Fase 2 — richiede i tuoi passaggi 1 e 4 sopra**: pubblicazione online + Drive reale.

**Fase 3 — non ancora costruita, richiede un piccolo backend**: comportamento realmente proattivo (vedi sotto).
