// Effettore "printify_crea_prodotto" (FASE 4, BRIEF_effettori_printify 27/07/2026) — il traguardo
// dichiarato del brief: un prodotto REALE nel catalogo Printify, verificabile aprendo la dashboard
// Printify. Questa azione ricade SEMPRE sotto il gate (vedi EFFECTOR_REGISTRY in app.js,
// richiedeGate:true) — arriva qui solo dopo che Caspar ha dato via libera o il Ghost ha confermato
// esplicitamente (unlockGatedSeed).
//
// Autenticazione Printify: header "Authorization: Bearer <token>" — token generato dalla dashboard
// Printify (My Profile → Connections → Personal Access Token), NON OAuth. Richiede anche uno Shop
// ID (visibile nell'URL della dashboard del negozio Printify). Entrambi vanno impostati come
// variabili d'ambiente Vercel: PRINTIFY_API_TOKEN, PRINTIFY_SHOP_ID — mai in config.js, mai nel repo.
//
// Due chiamate Printify in sequenza:
// 1) POST /v1/uploads/images.json — carica l'immagine (base64), ottiene un id di upload.
// 2) POST /v1/shops/{shop_id}/products.json — crea il prodotto usando quell'id come immagine del
//    print_area, con blueprint_id/print_provider_id/variants forniti dal chiamante (il modello, che
//    li ha scelti in base al catalogo — vedi limiti noti nel report: servono query separate al
//    catalogo Printify per scoprire questi id, non fatte automaticamente qui).
const PRINTIFY_BASE = "https://api.printify.com/v1";
const DEFAULT_PRICE_CENTS = 2000; // segnaposto ($20.00) — NON un prezzo reale, Flavio lo aggiusterà

async function printifyRequest(path, token, options = {}) {
  const res = await fetch(`${PRINTIFY_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Resonance-PWA/1.0",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const message = data?.errors ? JSON.stringify(data.errors) : (data?.error || data?.raw || `HTTP ${res.status}`);
    throw new Error(`Printify ${path} → ${res.status}: ${message}`);
  }
  return data;
}

module.exports = async (request, response) => {
  if (request.method !== "POST") { response.status(405).json({ ok: false, error: "Metodo non consentito, usa POST." }); return; }
  const token = process.env.PRINTIFY_API_TOKEN;
  const shopId = process.env.PRINTIFY_SHOP_ID;
  if (!token || !shopId) {
    response.status(200).json({ ok: false, error: "PRINTIFY_API_TOKEN e/o PRINTIFY_SHOP_ID non configurate su Vercel — nessuna chiave fornita in questa sessione." });
    return;
  }
  const { imagePngBase64, blueprintId, printProviderId, variantIds, title, description, priceCents } = request.body || {};
  if (!imagePngBase64 || typeof imagePngBase64 !== "string") {
    response.status(400).json({ ok: false, error: "Campo 'imagePngBase64' mancante." });
    return;
  }
  if (!blueprintId || !printProviderId || !Array.isArray(variantIds) || !variantIds.length || !title) {
    response.status(400).json({ ok: false, error: "Campi obbligatori mancanti: blueprintId, printProviderId, variantIds (array non vuoto), title." });
    return;
  }
  try {
    const upload = await printifyRequest("/uploads/images.json", token, {
      method: "POST",
      body: JSON.stringify({ file_name: `resonance-${Date.now()}.png`, contents: imagePngBase64 }),
    });
    const product = await printifyRequest(`/shops/${shopId}/products.json`, token, {
      method: "POST",
      body: JSON.stringify({
        title,
        description: description || "",
        blueprint_id: blueprintId,
        print_provider_id: printProviderId,
        variants: variantIds.map((id) => ({ id, price: Number.isFinite(priceCents) ? priceCents : DEFAULT_PRICE_CENTS, is_enabled: true })),
        print_areas: [{ variant_ids: variantIds, placeholders: [{ position: "front", images: [{ id: upload.id, x: 0.5, y: 0.5, scale: 1, angle: 0 }] }] }],
      }),
    });
    response.status(200).json({
      ok: true,
      productId: product.id,
      uploadId: upload.id,
      shopId,
      printifyDashboardHint: `Dashboard Printify → negozio ${shopId} → prodotto id ${product.id}`,
    });
  } catch (e) {
    response.status(200).json({ ok: false, error: e.message });
  }
};
