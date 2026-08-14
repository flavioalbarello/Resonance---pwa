// FASE 2 (brief 14/08/2026) — pubblicazione di un prodotto sul canale di vendita collegato (Etsy).
// È l'azione irreversibile della catena: da qui in poi un estraneo può vedere e comprare. Ricade
// quindi sotto C.10 (soglia di irreversibilità): il sistema si ferma e MOSTRA, non decide.
//
// Perché passa da Printify e non dall'API di Etsy, decisione presa qui e non lasciata a Flavio:
//  - l'API di Etsy richiede la registrazione di un'applicazione, OAuth2 con PKCE e un'approvazione
//    manuale da parte di Etsy che può richiedere settimane. È un muro di attesa, non di codice.
//  - Etsy obbliga a dichiarare il partner di produzione su ogni inserzione di prodotto fatto da
//    terzi. Passando da Printify quel partner È Printify, e la dichiarazione la compila lui: il
//    vincolo è soddisfatto per costruzione invece che da codice nostro che potrebbe sbagliarlo.
//  - il collegamento Etsy↔Printify si fa una volta sola dalla dashboard Printify, a mano.
// Conseguenza concreta per Flavio: niente domanda di approvazione a Etsy, niente attesa. In cambio,
// le inserzioni nascono dal formato prodotto di Printify e non da campi Etsy arbitrari.
//
// Due azioni:
//   azione: "statoNegozi" → GET /v1/shops.json ; dice se un canale di vendita è collegato davvero.
//       sales_channel vale "disconnected" quando non lo è. È il controllo da fare PRIMA di provare
//       a pubblicare, altrimenti l'errore arriva dopo aver già creato il prodotto.
//   azione: "pubblica"    → POST /v1/shops/{shop}/products/{id}/publish.json
//       Il corpo sono FLAG BOOLEANI (verificato sulla specifica OpenAPI ufficiale il 14/08/2026):
//       dicono QUALI campi spingere sul canale, non cosa scriverci. Il contenuto è già nel prodotto.
const { leggiCredenziali, printifyRequest, rispostaProvaAVuoto } = require("./_lib/printifyClient");

// Tutti i campi attivi: pubblicare un prodotto con le immagini spente produrrebbe un'inserzione
// monca, che è peggio di nessuna inserzione.
const CAMPI_DA_PUBBLICARE = { title: true, description: true, images: true, variants: true, tags: true, keyFeatures: true, shipping_template: true };

module.exports = async (request, response) => {
  if (request.method !== "POST") { response.status(405).json({ ok: false, error: "Metodo non consentito, usa POST." }); return; }
  const { azione, productId, dryRun } = request.body || {};
  if (azione !== "statoNegozi" && azione !== "pubblica") {
    response.status(400).json({ ok: false, error: "Campo 'azione' mancante o non valido. Ammessi: statoNegozi, pubblica." });
    return;
  }
  const { token, shopId, complete } = leggiCredenziali();

  if (dryRun) {
    if (azione === "statoNegozi") {
      response.status(200).json(rispostaProvaAVuoto(
        "Controllo di quali negozi sono collegati a Printify e se Etsy è fra questi.",
        [{ metodo: "GET", url: "https://api.printify.com/v1/shops.json", scopo: "leggere sales_channel di ogni negozio" }]
      ));
      return;
    }
    response.status(200).json(rispostaProvaAVuoto(
      `Pubblicazione del prodotto ${productId || "(nessun id fornito)"} sul canale di vendita collegato. QUESTA È L'AZIONE IRREVERSIBILE: dopo, il prodotto è visibile e comprabile da chiunque.`,
      [{
        metodo: "POST",
        url: `https://api.printify.com/v1/shops/${shopId || "{shop_id}"}/products/${productId || "{product_id}"}/publish.json`,
        corpo: CAMPI_DA_PUBBLICARE,
        scopo: "spingere titolo, descrizione, immagini, varianti e tag sul canale di vendita",
      }]
    ));
    return;
  }

  if (!complete) {
    response.status(200).json({ ok: false, error: "PRINTIFY_API_TOKEN e/o PRINTIFY_SHOP_ID non configurate su Vercel. Finché mancano, nessuna pubblicazione è possibile — e questo è il comportamento voluto, non un guasto." });
    return;
  }

  try {
    if (azione === "statoNegozi") {
      const negozi = await printifyRequest("/shops.json", token);
      const elenco = negozi.map((n) => ({ id: n.id, titolo: n.title, canaleDiVendita: n.sales_channel, collegato: n.sales_channel !== "disconnected" }));
      const etsy = elenco.find((n) => String(n.canaleDiVendita || "").toLowerCase().includes("etsy"));
      response.status(200).json({
        ok: true, negozi: elenco,
        etsyCollegato: Boolean(etsy),
        negozioConfigurato: String(shopId),
        diagnosi: etsy
          ? `Etsy è collegato al negozio "${etsy.titolo}" (id ${etsy.id}).`
          : "Nessun negozio Etsy collegato a questo account Printify. Va collegato una volta sola dalla dashboard Printify → Manage my stores → Connect, prima che una pubblicazione possa funzionare.",
      });
      return;
    }
    if (!productId) { response.status(400).json({ ok: false, error: "Campo 'productId' mancante: serve l'id restituito dalla creazione del prodotto." }); return; }
    await printifyRequest(`/shops/${shopId}/products/${productId}/publish.json`, token, {
      method: "POST", body: JSON.stringify(CAMPI_DA_PUBBLICARE),
    });
    response.status(200).json({
      ok: true, pubblicato: true, productId, shopId,
      nota: "Printify ha preso in carico la pubblicazione sul canale collegato. La comparsa dell'inserzione sul canale non è istantanea: Printify la elabora e poi la spinge.",
    });
  } catch (e) {
    response.status(200).json({ ok: false, error: e.message });
  }
};
