// IL CORRIERE — 15/09/2026
//
// Dal Ghost: «procedi col service worker, così almeno intanto che fallisce non mi incatena a
// guardarla fallire». Il problema vero non era la lentezza: era che una chiamata parte dalla PAGINA
// e quando Android sospende la pagina la chiamata muore — quindi lui doveva restare a guardare uno
// schermo fermo per il solo motivo che guardare altrove faceva perdere il lavoro.
//
// PERCHE' QUESTO BANCO ESISTE. Un service worker è uno script CLASSICO: non può importare da un
// modulo ESM, quindi tre costanti (nome del magazzino, nome del negozio, versione) sono DUPLICATE
// fra sw.js e app.js. Se divergono, il corriere deposita in un posto e la pagina va a ritirare da
// un altro: nessun errore, nessun messaggio, solo lavori che spariscono.
// In questo progetto una regola scritta e non imposta si è già persa: `lib/spartito.js` è rimasto
// fuori dal precaricamento per un giorno intero, con in cima al file un commento che lo vietava.
// Questa volta la regola la impone una prova.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RADICE = join(dirname(fileURLToPath(import.meta.url)), "..");
// PRIMA LE RIGHE //, POI I BLOCCHI /* */, E L'ORDINE NON È UN GUSTO — 15/09/2026.
// Al primo giro era il contrario, e questo banco è caduto su quattro prove dicendo che sw.js non
// conteneva costanti che conteneva. Il motivo: alla riga 3 di sw.js c'è «lib/*.js» DENTRO un
// commento //, e togliendo prima i blocchi il filtro partiva da quel «/*» e arrivava al primo «*/»
// vero, centodieci righe più in là, portandosi via le costanti.
// Misurato: 62 righe di sw.js sparivano. Un filtro che si mangia il codice che deve esaminare fa
// passare qualunque prova per assenza di prove — che è il modo più silenzioso di avere un banco
// verde e inutile. (Su app.js non succedeva: verificato, zero righe perse.)
const senzaCommenti = (t) => t.split("\n").filter((r) => !/^\s*\/\//.test(r)).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
const SW = senzaCommenti(readFileSync(join(RADICE, "sw.js"), "utf8"));
const APP = senzaCommenti(readFileSync(join(RADICE, "app.js"), "utf8"));
const valore = (testo, nome) => (new RegExp(`const ${nome} = ("[^"]*"|\\d+);`).exec(testo) || [])[1];

describe("PAGINA E CORRIERE DEVONO PARLARE DELLO STESSO MAGAZZINO", () => {
  for (const nome of ["IDB_NOME", "IDB_LAVORI", "IDB_VERSIONE"]) {
    test(`${nome} combacia fra sw.js e app.js`, () => {
      const a = valore(APP, nome), b = valore(SW, nome);
      assert.ok(a, `${nome} non si trova in app.js`);
      assert.ok(b, `${nome} non si trova in sw.js`);
      assert.equal(a, b, `divergono: il corriere depositerebbe dove la pagina non va a cercare`);
    });
  }

  test("TUTTI E DUE creano TUTTI i negozi, non solo il proprio", () => {
    // Pagina e corriere aprono lo stesso magazzino: chi arriva primo alla versione nuova fa
    // l'aggiornamento per entrambi. Se ne creasse uno solo, il secondo troverebbe mezzo magazzino
    // e nessun onupgradeneeded da girare — e fallirebbe per sempre, non una volta.
    for (const [dove, testo] of [["app.js", APP], ["sw.js", SW]]) {
      const upgrade = /onupgradeneeded[\s\S]{0,400}?\}\;/.exec(testo)?.[0] || "";
      assert.match(upgrade, /testi-documenti|IDB_NEGOZIO/, `${dove}: non crea il negozio dei testi`);
      assert.match(upgrade, /IDB_LAVORI|"lavori"/, `${dove}: non crea il negozio dei lavori`);
    }
  });

  test("la versione del magazzino è salita: un negozio nuovo senza bump non nasce", () => {
    assert.ok(Number(valore(APP, "IDB_VERSIONE")) >= 2, "IndexedDB crea negozi solo in onupgradeneeded");
  });
});

describe("IL CORRIERE FA IL FATTORINO, NON IL MUSICISTA", () => {
  test("non sa cos'è uno spartito, e non deve saperlo", () => {
    // Tutta l'interpretazione resta in app.js, dove c'è il banco. Duplicarla qui vorrebbe dire due
    // copie che divergono entro un mese: è già successo col piano alimentare, ed è la ragione per
    // cui `detta` e `verifica` stanno nella stessa riga dello stesso array.
    for (const parola of ["analizzaSpartito", "REQUISITI_SPARTITO", "briefDiTrascrizione", "abc", "ABC"]) {
      assert.ok(!SW.includes(parola), `sw.js nomina «${parola}»: l'intelligenza sta scappando nel corriere`);
    }
  });

  test("resta piccolo: è la sua unica difesa contro il diventare un secondo app.js", () => {
    const righe = SW.split("\n").filter((r) => r.trim()).length;
    assert.ok(righe < 140, `sw.js ha ${righe} righe di codice: se cresce, cresce senza banco`);
  });
});

describe("LA CHIAVE API NON SI FERMA NEL CORRIERE", () => {
  test("non finisce nel magazzino né in cache", () => {
    // «Una chiave dentro un file che gira è una chiave bruciata» (app.js, backup). Qui la chiave
    // arriva nel messaggio e vive quanto la chiamata: se finisse in un `deposita` o in un `cache.put`
    // resterebbe scritta sul dispositivo, che è esattamente quello che il backup evita da sempre.
    const depositi = SW.match(/deposita\([^)]*\)/g) || [];
    for (const d of depositi) assert.ok(!/chiave/.test(d), `la chiave finisce nel magazzino: ${d}`);
    assert.ok(!/caches?\.[a-z]+\([^)]*chiave/.test(SW), "la chiave finisce in cache");
  });

  test("esce solo verso openrouter, nell'intestazione Authorization", () => {
    const usi = SW.match(/.{0,60}chiave.{0,60}/g) || [];
    for (const u of usi) {
      assert.ok(/Authorization|Bearer|\{ url, chiave, corpo, tetto \}|const \{ id, chiamate, chiave, tetto \}|!chiave|\.\.\.c, chiave/.test(u),
        `uso della chiave che non è la riga Authorization: ${u.trim()}`);
    }
  });
});

describe("UN LAVORO CHE FALLISCE VIENE DEPOSITATO LO STESSO", () => {
  test("una chiamata fallita è un ESITO, non un'eccezione buttata via", () => {
    // Se il motivo si perdesse, la pagina al ritorno troverebbe un buco senza sapere perché — e
    // direbbe «non l'ho trovato» a un problema di rete. È la stessa distinzione fra «non c'è» e
    // «non ho potuto guardare» che l'archivio fa da giorni.
    assert.match(SW, /return \{ ok: false, ms: Date\.now\(\) - t0, errore:/);
    assert.match(SW, /AbortError.*tempo scaduto/);
  });

  test("e anche un guasto del magazzino avvisa le pagine invece di lasciarle appese", () => {
    const gestore = /self\.addEventListener\("message"[\s\S]*$/.exec(SW)?.[0] || "";
    const rami = gestore.match(/avvisaLePagine/g) || [];
    assert.ok(rami.length >= 2, "il ramo di errore non avvisa: la pagina resterebbe in attesa di un messaggio che non arriva");
    assert.match(gestore, /stato: "errore"/);
  });

  test("il gestore ignora i messaggi che non sono suoi, senza rumore", () => {
    assert.match(SW, /if \(!m \|\| m\.tipo !== "lavoro"\) return;/);
  });
});

describe("LA PAGINA NON RESTA APPESA A UN MESSAGGIO CHE PUO' PERDERSI", () => {
  test("c'è un battito periodico oltre al messaggio del corriere", () => {
    // Un postMessage a una pagina sospesa NON si mette in coda: si perde. Se l'unica via fosse il
    // messaggio, il caso peggiore — la pagina dorme proprio mentre il corriere finisce — lascerebbe
    // l'attesa aperta per sempre. Il controllo periodico è la rete sotto il filo.
    const fn = /function aspettaIlCorriere[\s\S]*?\n\}/.exec(APP)?.[0] || "";
    assert.ok(fn, "aspettaIlCorriere non si trova più");
    assert.match(fn, /setInterval\(guarda/, "manca il battito: il messaggio da solo può perdersi");
    assert.match(fn, /setTimeout\(\(\) => chiudi\(null\)/, "manca la scadenza: un'attesa senza fine è il guasto da cui siamo partiti");
  });

  test("e non lascia in giro né il battito né l'ascoltatore", () => {
    const fn = /function aspettaIlCorriere[\s\S]*?\n\}/.exec(APP)?.[0] || "";
    assert.match(fn, /clearInterval\(battito\)/);
    assert.match(fn, /removeEventListener\("message", ascolta\)/);
  });

  test("SENZA CORRIERE SI FA COME PRIMA: un ripiego che funziona, non un errore", () => {
    // Prima apertura, browser che non lo supporta, registrazione fallita: la ricerca deve partire
    // lo stesso. Un'app che smette di funzionare quando manca l'ottimizzazione è peggio di prima.
    assert.match(APP, /: await Promise\.all\(daLeggere\.map\(leggiUno\)\)/,
      "il ramo senza corriere è sparito: senza service worker la lettura non partirebbe più");
    assert.match(APP, /const corriereDisponibile = \(\) => \{/);
  });
});
