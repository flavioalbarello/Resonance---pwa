// L'INDICE SEMPRE, LA SCHEDA QUANDO SERVE — 12/09/2026.
//
// Il blocco delle capacità pesava 9.842 token e partiva identico a ogni turno: il 79% dei 12.384
// token fissi del prompt dello Shell. Adesso parte l'indice dei nomi più il nucleo, e le schede
// arrivano solo quando il turno le nomina.
//
// LE DUE DIREZIONI VANNO PROVATE INSIEME, e questo file esiste per quello.
//  · RICHIAMO — se una scheda non si fa trovare quando serve, l'ottimizzazione si è portata via del
//    sapere in silenzio: è esattamente il difetto che avrebbe dovuto evitare.
//  · PRECISIONE — se le chiavi si accendono su una frase di vita reale, il risparmio è finto e in
//    più lo Shell si mette a parlare dell'app mentre il Ghost gli racconta della schiena.
// Una sola delle due non basta: un richiamo che prende tutto passerebbe la prima e fallirebbe la
// seconda, e un richiamo che non prende niente il contrario.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();
const T = (s) => Math.round(String(s || "").length / 3.5); // italiano ≈ 3,5 caratteri per token

// ─────────────────────────────────────────────────────────────────────────────
// IL BANCO DELLA PRECISIONE. Trenta frasi che il Ghost dice della sua VITA: nessuna nomina una
// funzionalità. Su nessuna di queste deve accendersi una singola chiave — e quando ho scritto questo
// banco se ne accendevano quattro: «serie» su «tre serie» di esercizi, «spesa» su «ho fatto la
// spesa», «forma» su «rimettermi in forma» (due volte). Le ha trovate il banco, non io.
// ─────────────────────────────────────────────────────────────────────────────
const VITA = [
  "oggi ho dormito male e mi fa male la schiena, domani provo a camminare",
  "ho avuto una giornata pesante con i pazienti, sono stanco morto",
  "questo mese ho speso troppo e devo tirare la cinghia",
  "mia madre sta peggio, ho passato il pomeriggio in ospedale",
  "ho ripreso a correre dopo tre settimane, quaranta minuti facili",
  "non riesco a concentrarmi, penso sempre alle stesse cose",
  "ho pesato 78 e 4 stamattina, mezzo chilo in meno della settimana scorsa",
  "vorrei capire come guadagnare qualcosa in più senza aumentare le ore",
  "sto leggendo un libro di biologia e mi sta aprendo la testa",
  "ieri sera abbiamo litigato e non ho dormito",
  "mi sento fermo, come se girassi a vuoto da mesi",
  "ho fatto la spesa e ho comprato solo verdura e uova",
  "domenica vado a trovare mio fratello, è lontano",
  "il ginocchio destro mi dà fastidio quando salgo le scale",
  "penso di iscrivermi a un corso ma non so se ho il tempo",
  "la giornata è andata liscia, niente di speciale da raccontare",
  "ho finito il lavoro tardi e ho saltato la cena",
  "vorrei rimettermi in forma prima dell'estate",
  "mi hanno detto che dovrei riposare di più ma non ci riesco",
  "sono contento di come è andata la settimana, per una volta",
  "ho dormito sette ore e mezza e mi sento un altro",
  "sto pensando a cosa voglio davvero fare dei prossimi anni",
  "mi fa piacere parlarne con te, mi aiuta a mettere ordine",
  "non ho voglia di fare niente oggi, è la verità",
  "ho ricominciato gli esercizi per la spalla, tre serie",
  "devo decidere se cambiare lavoro o restare dove sono",
  "le giornate si accorciano e la sera mi crolla tutto addosso",
  "ho provato a scrivere qualcosa ieri ma non è venuto fuori niente",
  "mi sono accorto che bevo troppo poca acqua",
  "quest'anno voglio arrivare a fine dicembre senza essermi fermato",
];

describe("PRECISIONE — una frase sulla vita reale non tira dentro niente", () => {
  test("nessuna chiave di nessuna scheda si accende su nessuna delle trenta frasi", () => {
    const norm = (s) => ` ${String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()} `;
    const corpus = VITA.map(norm);
    const colpevoli = [];
    for (const c of app.CAPACITA_INDICIZZATE) {
      for (const k of c.chiavi) {
        const dove = corpus.findIndex((t) => t.includes(` ${k} `));
        if (dove >= 0) colpevoli.push(`«${k}» (di «${c.n.slice(0, 40)}») accesa da: ${VITA[dove]}`);
      }
    }
    assert.deepEqual(colpevoli, [], `chiavi troppo comuni:\n${colpevoli.join("\n")}`);
  });

  test("su una frase di vita il blocco è indice + nucleo e nient'altro", () => {
    for (const frase of VITA) assert.equal(app.capacitaRichiamate(frase).length, 0, frase);
  });

  test("un testo vuoto non richiama niente (e non è il caso «tutto»)", () => {
    for (const t of ["", "   ", null, undefined]) assert.deepEqual(app.capacitaRichiamate(t), []);
  });

  test("il confine di parola vale: «seme» non si accende dentro «sembra»", () => {
    const nomi = app.capacitaRichiamate("mi sembra che sia insensato, semplicemente").map((c) => c.n);
    assert.deepEqual(nomi, [], nomi.join(" | "));
  });
});

describe("RICHIAMO — i tre difetti storici, riprovati sulle frasi vere che li hanno prodotti", () => {
  const contiene = (testo, nome) => {
    const b = app.costruisciBloccoCapacita(testo);
    return b.includes(nome);
  };

  test("26/07/2026 — «sto testando i Semi nel pilastro AIR»", () => {
    // Il difetto che ha fatto nascere tutto il blocco: lo Shell rispose della vecchia strategia
    // contenuti, ignaro che "Semi" fosse una feature. Semi è nel NUCLEO, quindi c'è sempre — ed è
    // il motivo per cui sta nel nucleo e non fra le richiamate.
    assert.ok(contiene("sto testando i Semi nel pilastro AIR", "Semi (solo AIR)"));
    assert.ok(contiene("una giornata qualunque senza niente di app", "Semi (solo AIR)"), "il nucleo deve esserci comunque");
  });

  test("09/09/2026 — «dimmi i temi dell'atto IV e dell'atto V»", () => {
    assert.ok(contiene("dimmi i temi dell'atto IV e dell'atto V", "Cercare fra i documenti riconosce i numeri"));
  });

  test("28/08/2026 — il piano alimentare", () => {
    const t = "mi fai un piano alimentare per due settimane da 1600 kcal";
    assert.ok(contiene(t, "Piano alimentare montato dal programma"));
    assert.ok(contiene(t, "Controllo del piano alimentare"));
  });

  test("altre frasi che il Ghost dice davvero, con la scheda che devono portare", () => {
    const casi = [
      ["come funziona il generatore di plasmidi", "Plasmidi (strumenti acquisiti)"],
      ["fammi vedere le trappole di questa settimana", "Trappole"],
      ["a che punto è l'anello di quella perturbazione", "L'anello (accettore d'azione)"],
      ["quanto sto spendendo questo mese di modello", "Tetto di spesa (Setup)"],
      ["scarica il backup", "Backup e ripristino (Setup)"],
      ["voglio provare il microfono in macchina", "Banco microfono in auto"],
      ["genera un documento da questa conversazione", "Genera documento da questa conversazione"],
      ["a cosa hai rinunciato per farmi arrivare la risposta", "Rinunce di parametro"],
      ["apri la catena printify", "Catena Printify → Etsy"],
      ["salvalo nel percorso", "Salvare nel percorso quello che lo Shell ha appena prodotto"],
      ["spostare quell'evento a venerdì", "Spostare un evento a un altro giorno o ora"],
      ["che andamento ha il peso", "Andamento misurato (BIO)"],
    ];
    const mancati = casi.filter(([t, nome]) => !contiene(t, nome)).map(([t, nome]) => `«${t}» non ha portato «${nome}»`);
    assert.deepEqual(mancati, [], mancati.join("\n"));
  });
});

describe("LA REGOLA CHE VALE PER LE SCHEDE FUTURE, non solo per queste", () => {
  test("un nome lungo DEVE avere chiavi scritte a mano", () => {
    // La derivazione automatica si ferma sopra le quattro parole significative, perché spezzare una
    // frase intera dà chiavi come «lettura», «conferma», «davvero». Chi aggiunge domani una scheda
    // col nome lungo e senza `k` la rende raggiungibile SOLO recitando il nome per intero — cosa che
    // nessun Ghost fa. Questa prova è l'accettore di quella regola: diventa rossa da sola.
    const nudi = app.CAPACITA_INDICIZZATE
      .filter((c) => !c.nucleo && c.chiavi.length <= 1 && app.CAPACITA_INDICIZZATE.find((x) => x.i === c.i).n.split(" ").length > 3)
      .map((c) => c.n);
    assert.deepEqual(nudi, [], `queste schede si raggiungono solo col nome intero:\n${nudi.join("\n")}`);
  });

  test("ogni scheda ha un nome e un testo, e nessun nome è doppio", () => {
    for (const c of app.CAPACITA) {
      assert.ok(c.n && c.n.trim().length > 2, JSON.stringify(c).slice(0, 80));
      assert.ok(c.s && c.s.length > 40, c.n);
      assert.ok(c.s.startsWith(c.n), `la scheda di «${c.n}» non comincia col suo nome`);
    }
    const nomi = app.CAPACITA.map((c) => c.n);
    assert.equal(new Set(nomi).size, nomi.length, "ci sono nomi doppi");
  });

  test("il nucleo non finisce mai fra le richiamate: sarebbe un doppione pagato due volte", () => {
    const t = "percorsi semi inventario interruttori calendario memoria procedurale documenti";
    for (const c of app.capacitaRichiamate(t)) assert.ok(!c.nucleo, `${c.n} è nucleo e anche richiamata`);
  });
});

describe("L'INDICE — il pezzo che fa funzionare il riconoscimento", () => {
  const bloccoCorto = app.costruisciBloccoCapacita("una frase qualunque della vita");

  test("i nomi di TUTTE le schede sono nell'indice, anche quelle senza scheda in questo turno", () => {
    const mancanti = app.CAPACITA.filter((c) => !bloccoCorto.includes(c.n)).map((c) => c.n);
    assert.deepEqual(mancanti, [], mancanti.join("\n"));
  });

  test("l'indice dice cosa fare quando manca la scheda: chiedere, non indovinare", () => {
    assert.match(bloccoCorto, /dillo e chiedi invece di indovinare/);
  });

  test("le capacità NON disponibili ci sono sempre: è un vincolo, non una descrizione", () => {
    assert.ok(bloccoCorto.includes(app.CAPACITA_CHIUSURA));
    assert.ok(app.APP_CAPABILITIES_CONTEXT.includes(app.CAPACITA_CHIUSURA));
    assert.match(app.CAPACITA_CHIUSURA, /notifiche push/);
  });

  test("l'intestazione, che spiega a cosa serve il blocco, non si perde", () => {
    assert.ok(bloccoCorto.startsWith(app.CAPACITA_INTESTAZIONE));
    assert.match(app.CAPACITA_INTESTAZIONE, /sto parlando di una funzionalità di Resonance/);
  });
});

describe("LA MISURA — se il risparmio non c'è, questo lavoro non serviva", () => {
  const intero = T(app.APP_CAPABILITIES_CONTEXT);

  test("nessuna scheda si è persa nel passaggio da testo ad array", () => {
    // Il numero da solo non basta come garanzia: cresce quando si aggiunge una feature (è la
    // checklist di consegna) e non direbbe niente se una vecchia sparisse e una nuova arrivasse
    // nello stesso commit. Quindi: un pavimento sul numero, E i nomi delle schede che c'erano prima.
    assert.ok(app.CAPACITA.length >= 74, `${app.CAPACITA.length} schede: ne è sparita qualcuna`);
    const primaDel12Settembre = [
      "Percorsi", "Semi (solo AIR)", "Agorà Magi", "Kernel", "Simbiosi", "Vincoli dichiarati",
      "Piano alimentare montato dal programma", "Andamento misurato (BIO)", "Documenti del percorso",
      "Plasmidi (strumenti acquisiti)", "L'anello (accettore d'azione)", "Trappole", "Inventario",
      "Interruttori", "Leggere il calendario", "Creare un evento sul calendario", "Inviare una mail",
      "Memoria procedurale", "Backup e ripristino (Setup)", "Tetto di spesa (Setup)",
      "La voce non legge i marcatori", "Banco microfono in auto", "Catena Printify → Etsy",
      "Genera documento da questa conversazione", "Cercare fra i documenti riconosce i numeri",
    ];
    const spariti = primaDel12Settembre.filter((n) => !app.CAPACITA.some((c) => c.n === n));
    assert.deepEqual(spariti, [], spariti.join(", "));
    assert.ok(intero > 9000 && intero < 13000, `${intero} token: il blocco intero è cambiato molto`);
  });

  test("un turno che non nomina niente costa meno di un terzo del blocco intero", () => {
    const corto = T(app.costruisciBloccoCapacita("oggi sono stanco e non ho fatto niente"));
    assert.ok(corto < intero / 3, `${corto} vs ${intero}`);
  });

  test("il caso PEGGIORE — otto schede richiamate — resta sotto la metà", () => {
    // Il tetto non è prudenza: è il numero oltre il quale il richiamo tornerebbe a essere il blocco
    // intero. Se un giorno qualcuno lo alza, questa prova dice quando ha smesso di convenire.
    const pieno = "plasmidi generatore trappole anello printify postura magi kernel simbiosi backup documento voce microfono rinunce andamento";
    assert.equal(app.capacitaRichiamate(pieno).length, app.CAPACITA_RICHIAMATE_MAX);
    const costo = T(app.costruisciBloccoCapacita(pieno));
    assert.ok(costo < intero / 2, `${costo} vs ${intero}`);
  });

  test("più chiavi colpite = più in alto: la scheda più pertinente non viene tagliata dal tetto", () => {
    const t = "il piano alimentare con le kcal e i pasti, e poi anche il kernel";
    const primi = app.capacitaRichiamate(t).map((c) => c.n);
    assert.ok(primi.includes("Piano alimentare montato dal programma"), primi.join(" | "));
  });
});

describe("DOVE IL BANCO NON ARRIVA, e lo dico", () => {
  test("PIN sul sorgente: il turno di chat usa il richiamo, non il blocco intero", () => {
    // Questa è una lettura del TESTO di app.js, non una prova di comportamento — la stessa forma di
    // buco già dichiarata tre volte (il gate dei Semi, il filtro sulle negazioni, perLaVoce dentro
    // speakText): «X è chiamato da Y» non è provabile con moduli ESM, i legami sono di sola lettura
    // e le chiamate si risolvono lessicalmente. È la QUARTA occorrenza della stessa cosa.
    // Vale comunque per una ragione precisa: se una riscrittura futura rimettesse il blocco intero
    // nel prompt, il risparmio sparirebbe in silenzio e nessun'altra prova se ne accorgerebbe.
    const src = readFileSync(new URL("../app.js", import.meta.url), "utf8");
    const i = src.indexOf("const bloccoCapacitaDelTurno = costruisciBloccoCapacita(recentText)");
    assert.ok(i > 0, "il turno non costruisce più il blocco dal testo del turno");
    const prompt = src.slice(i, i + 2600);
    assert.ok(prompt.includes("${bloccoCapacitaDelTurno}"), "il prompt non interpola il blocco del turno");
    assert.ok(!prompt.includes("${APP_CAPABILITIES_CONTEXT}"), "il prompt interpola ancora il blocco intero");
  });
});
