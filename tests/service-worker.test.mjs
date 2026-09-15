// IL SERVICE WORKER DEVE PRECARICARE TUTTO QUELLO CHE L'APP IMPORTA — 15/09/2026
//
// PERCHE' ESISTE QUESTO BANCO. In cima a sw.js c'e' un commento scritto il 31/08/2026 che dice, con
// parole sue: se lib/*.js non fosse precaricato, «la prima apertura SENZA rete dopo un aggiornamento
// troverebbe app.js in cache e i suoi import no — e l'app non si disegnerebbe affatto, con tutti i
// dati gia' sul dispositivo».
// Il 15/09/2026 si e' scoperto che era gia' successo: `lib/spartito.js`, nato il 14/09 e importato
// da app.js, NON era in quell'elenco. Per un giorno intero la prima apertura offline dopo un
// aggiornamento avrebbe dato una schermata vuota — senza un errore leggibile, con i dati intatti
// sotto. Nessuno se ne sarebbe accorto finche' il Ghost non fosse finito in un garage senza campo.
//
// LA CORREZIONE NON E' AGGIUNGERE LA RIGA. Quella era gia' scritta la regola, e non e' bastata:
// stava SOLO in un commento, come il divieto di build step stava solo in CLAUDE.md. Una regola che
// nessun controllo impone dura finche' qualcuno se la ricorda. La correzione e' questo file: il
// grafo degli import lo si CALCOLA dal codice vero, non lo si ricorda.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";

const RADICE = join(dirname(fileURLToPath(import.meta.url)), "..");
const leggi = (f) => readFileSync(join(RADICE, f), "utf8");
const SW = leggi("sw.js");

// L'elenco dichiarato nel service worker, normalizzato: "./x" e "x" sono lo stesso file.
const SHELL = (/const SHELL = \[([\s\S]*?)\n\];/.exec(SW)?.[1] || "")
  .split("\n")
  .map((r) => /^\s*"([^"]+)"/.exec(r)?.[1])
  .filter(Boolean)
  .map((p) => p.replace(/^\.\//, ""));

// Il grafo vero: da app.js si scende nei moduli, e da ogni modulo nei suoi. Ricorsivo, perche' un
// modulo importato da un altro modulo serve alla prima apertura esattamente quanto uno importato
// da app.js — lib/griglia.js sta gia' nell'elenco proprio per questo, e nessuno lo importa da app.js.
function importatiDa(file, visti = new Set()) {
  if (visti.has(file)) return visti;
  visti.add(file);
  const testo = leggi(file);
  const base = dirname(file);
  for (const m of testo.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+"(\.[^"]+)"/g)) {
    const risolto = normalize(join(base, m[1])).replace(/\\/g, "/");
    if (existsSync(join(RADICE, risolto))) importatiDa(risolto, visti);
  }
  return visti;
}

describe("IL SERVICE WORKER PRECARICA TUTTO QUELLO CHE SERVE A DISEGNARE L'APP", () => {
  test("ogni modulo che app.js importa, anche di rimbalzo, sta nell'elenco", () => {
    const serve = [...importatiDa("app.js")].filter((f) => f !== "app.js");
    const mancanti = serve.filter((f) => !SHELL.includes(f));
    assert.deepEqual(mancanti, [],
      `senza questi, la prima apertura offline dopo un aggiornamento non disegna niente: ${mancanti.join(", ")}`);
  });

  test("anche quello che index.html chiede da se' (fogli di stile, icone, script)", () => {
    const html = leggi("index.html");
    const chiesti = [...html.matchAll(/(?:src|href)="(?!https?:|data:|#)([^"]+)"/g)]
      .map((m) => m[1].replace(/^\.?\//, ""))
      .filter((p) => existsSync(join(RADICE, p)));
    const mancanti = [...new Set(chiesti)].filter((f) => !SHELL.includes(f));
    assert.deepEqual(mancanti, [], `index.html li chiede ma senza rete non ci sarebbero: ${mancanti.join(", ")}`);
  });

  test("e NIENTE nell'elenco e' un file che non esiste — o non si precarica piu' niente", () => {
    // `cache.addAll` e' tutto-o-niente: un solo 404 fa fallire l'INTERA installazione, e l'app
    // resta senza cache mentre il service worker sembra attivo. Un errore di battitura in una riga
    // di questo elenco spegne l'offline per tutte le altre.
    const fantasmi = SHELL.filter((p) => p !== "" && !existsSync(join(RADICE, p)));
    assert.deepEqual(fantasmi, [], `addAll fallisce in blocco e la cache resta vuota: ${fantasmi.join(", ")}`);
  });

  test("la versione della cache e' cambiata insieme al codice", () => {
    // Non verifica CHE numero sia — verifica che esista e sia leggibile: senza il bump, il browser
    // continua a servire la versione vecchia dalla cache e un rilascio non arriva mai.
    const v = /const CACHE = "resonance-v(\d+)"/.exec(SW);
    assert.ok(v, "il nome della cache ha cambiato forma: se e' voluto, aggiorna questa prova");
    assert.ok(Number(v[1]) >= 33, `la cache e' ferma a v${v[1]}: un rilascio senza bump non arriva sui telefoni`);
  });
});
