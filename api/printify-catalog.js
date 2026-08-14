// FASE 2 (brief 14/08/2026) — ricerca nel catalogo Printify.
// Chiude un limite dichiarato apertamente nel codice esistente: printify-create-product.js richiede
// blueprintId / printProviderId / variantIds, ma nessuno li andava a cercare — il modello doveva
// tirarli a indovinare. Un id di prodotto indovinato non produce un errore leggibile: produce un
// prodotto sbagliato, o un 400 che non dice quale dei tre id era storto.
//
// Tre modi d'uso, uno per ogni pezzo che serve, più uno di riepilogo:
//   azione: "blueprints"       → cerca un tipo di prodotto per nome (es. "t-shirt", "mug", "poster")
//   azione: "providers"        → per un blueprint, chi lo stampa
//   azione: "variants"         → per blueprint+provider, taglie/colori disponibili con i loro id
//   azione: "prodottoPiuSemplice" → fa i tre passi in fila e restituisce una combinazione pronta
//
// "prodottoPiuSemplice" esiste per la domanda B1 del brief: serve UN prodotto per verificare che la
// catena funzioni, non un catalogo. Sceglie la combinazione con MENO varianti, che è la meno
// rognosa da gestire in una prima pubblicazione.
const { leggiCredenziali, printifyRequest, rispostaProvaAVuoto } = require("./_lib/printifyClient");

const AZIONI = ["blueprints", "providers", "variants", "prodottoPiuSemplice"];

module.exports = async (request, response) => {
  if (request.method !== "POST") { response.status(405).json({ ok: false, error: "Metodo non consentito, usa POST." }); return; }
  const { azione, cerca, blueprintId, printProviderId, dryRun } = request.body || {};
  if (!AZIONI.includes(azione)) {
    response.status(400).json({ ok: false, error: `Campo 'azione' mancante o non valido. Ammessi: ${AZIONI.join(", ")}.` });
    return;
  }
  if (dryRun) {
    response.status(200).json(rispostaProvaAVuoto(
      `Interrogazione del catalogo Printify, azione "${azione}".`,
      [{ metodo: "GET", url: "https://api.printify.com/v1/catalog/blueprints.json", scopo: "elenco dei tipi di prodotto" }]
    ));
    return;
  }
  const { token, complete } = leggiCredenziali();
  if (!complete) {
    response.status(200).json({ ok: false, error: "PRINTIFY_API_TOKEN e/o PRINTIFY_SHOP_ID non configurate su Vercel. Il catalogo non è interrogabile finché non le imposti." });
    return;
  }
  try {
    if (azione === "blueprints" || azione === "prodottoPiuSemplice") {
      const tutti = await printifyRequest("/catalog/blueprints.json", token);
      const termine = String(cerca || "").trim().toLowerCase();
      const filtrati = termine
        ? tutti.filter((b) => `${b.title} ${b.brand || ""} ${b.model || ""}`.toLowerCase().includes(termine))
        : tutti;
      if (azione === "blueprints") {
        response.status(200).json({ ok: true, totaleCatalogo: tutti.length, trovati: filtrati.length, blueprints: filtrati.slice(0, 40).map((b) => ({ id: b.id, titolo: b.title, marca: b.brand, modello: b.model })) });
        return;
      }
      // prodottoPiuSemplice: continua sotto usando il primo blueprint trovato
      const scelto = filtrati[0];
      if (!scelto) { response.status(200).json({ ok: false, error: `Nessun tipo di prodotto trovato per "${cerca}". Prova un termine più generico (es. "t-shirt", "mug", "poster").` }); return; }
      const providers = await printifyRequest(`/catalog/blueprints/${scelto.id}/print_providers.json`, token);
      if (!providers.length) { response.status(200).json({ ok: false, error: `Il prodotto "${scelto.title}" non ha nessun fornitore di stampa disponibile.` }); return; }
      // Prova i fornitori in ordine e tiene quello con MENO varianti: meno taglie/colori da gestire.
      let migliore = null;
      for (const p of providers.slice(0, 5)) {
        try {
          const v = await printifyRequest(`/catalog/blueprints/${scelto.id}/print_providers/${p.id}/variants.json`, token);
          const varianti = v.variants || [];
          if (!varianti.length) continue;
          if (!migliore || varianti.length < migliore.varianti.length) migliore = { provider: p, varianti };
        } catch { /* un fornitore che non risponde non deve far fallire l'intera ricerca */ }
      }
      if (!migliore) { response.status(200).json({ ok: false, error: `Nessun fornitore di "${scelto.title}" ha restituito varianti utilizzabili.` }); return; }
      response.status(200).json({
        ok: true,
        combinazionePronta: {
          blueprintId: scelto.id, blueprintTitolo: scelto.title,
          printProviderId: migliore.provider.id, printProviderTitolo: migliore.provider.title,
          variantIds: migliore.varianti.map((v) => v.id),
          numeroVarianti: migliore.varianti.length,
          esempioVarianti: migliore.varianti.slice(0, 6).map((v) => ({ id: v.id, titolo: v.title })),
        },
        nota: `Scelto il fornitore con meno varianti (${migliore.varianti.length}) fra i primi ${Math.min(providers.length, 5)} disponibili: è la combinazione più semplice da gestire per una prima pubblicazione.`,
      });
      return;
    }
    if (azione === "providers") {
      if (!blueprintId) { response.status(400).json({ ok: false, error: "Campo 'blueprintId' mancante." }); return; }
      const providers = await printifyRequest(`/catalog/blueprints/${blueprintId}/print_providers.json`, token);
      response.status(200).json({ ok: true, providers: providers.map((p) => ({ id: p.id, titolo: p.title })) });
      return;
    }
    // azione === "variants"
    if (!blueprintId || !printProviderId) { response.status(400).json({ ok: false, error: "Campi 'blueprintId' e 'printProviderId' obbligatori per l'azione variants." }); return; }
    const v = await printifyRequest(`/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`, token);
    const varianti = v.variants || [];
    response.status(200).json({ ok: true, numeroVarianti: varianti.length, variantIds: varianti.map((x) => x.id), varianti: varianti.slice(0, 40).map((x) => ({ id: x.id, titolo: x.title })) });
  } catch (e) {
    response.status(200).json({ ok: false, error: e.message });
  }
};
