package it.resonance.adam.logica

import java.text.Normalizer

// «Dove trovo X» (05/10/2026, prima ricetta della ricerca nuova). Il Ghost cercava un vino entro 50 km: le ricerche hanno
// risposto «solo online», e il vino era nella carta del ristorante dove cenava quella sera, dietro una pagina anti-robot
// e mai indicizzata. Qui il programma va a vedere: raccoglie i candidati (dalla mappa, dai posti che lo Shell nomina, da
// una ricerca di indirizzi), apre i loro siti col browser interno, segue i link «carta, menu, listino», e cerca il NOME
// ESATTO nel testo della pagina. O c'è, con la frase e il link, o non c'è. Il modello capisce la domanda all'inizio e
// scrive la risposta alla fine, sopra le prove; in mezzo non decide niente.
// Detta e verifica dalla stessa forma: ciò che il modello passa (cosa, varianti) è esattamente ciò che il programma cerca.
object TrovaDove {
    const val SITI_MAX = 10
    const val SOTTOPAGINE_MAX = 3
    // Le letture per sito, sitemap comprese: oltre, un sito solo tiene fermo il Ghost.
    const val LETTURE_MAX = 8
    const val VARIANTI_MAX = 5
    const val INDIZI_MAX = 3
    const val LUOGHI_MAX = 10
    // Quanti posti senza sito si cercano sul web (circa 0,7 centesimi l'uno): oltre, il costo supera ciò che il Ghost ha accettato.
    const val SCOPERTE_MAX = 6

    data class Richiesta(
        val cosa: String,
        val varianti: List<String> = emptyList(),
        val vicinoA: String = "",
        val km: Int = 20,
        val osm: List<String> = emptyList(),
        val indizi: List<String> = emptyList(),
        val luoghi: List<String> = emptyList(),
        // La marca o il produttore. Per un nome di una parola sola («ReAle») è obbligatorio e deve stare nella stessa
        // pagina: il 05/10 «ReAle» da solo ha trovato una pasticceria di Grosseto e un distributore che si chiama Reale.
        val produttore: String = "",
    ) {
        /** Il nome è di una parola sola: senza il produttore accanto, si trova dappertutto. */
        val corto get() = normalizza(cosa).split(' ').filter { it.isNotEmpty() }.size < 2
        /** Tutte le forme del nome che il programma cerca: il nome e le varianti, senza doppioni. */
        val forme get() = (listOf(cosa) + varianti).map { it.trim() }.filter { it.isNotEmpty() }.distinctBy { normalizza(it) }
    }

    /** Ciò che non va nella richiesta, detto al modello perché la corregga. Vuoto = si parte. */
    fun difetti(r: Richiesta): List<String> = buildList {
        val c = normalizza(r.cosa)
        if (c.length < 3 || r.cosa.length > 80) add("cosa: il nome esatto di ciò che si cerca, come lo scriverebbe una carta o un listino (da 3 a 80 caratteri)")
        if (r.varianti.size > VARIANTI_MAX) add("varianti: al massimo $VARIANTI_MAX")
        if (r.varianti.any { normalizza(it).length < 3 }) add("varianti: ognuna almeno 3 lettere, altrimenti si trova dappertutto")
        if (r.indizi.size > INDIZI_MAX) add("indizi: al massimo $INDIZI_MAX ricerche")
        if (r.luoghi.size > LUOGHI_MAX) add("luoghi: al massimo $LUOGHI_MAX")
        if (r.osm.isNotEmpty() && Mappa.filtri(r.osm) == null) add("osm: filtri nella forma di OpenStreetMap, «chiave=valore» o «chiave=a|b»")
        if (r.osm.isNotEmpty() && r.vicinoA.isBlank()) add("con osm serve vicino_a: il paese da cui contare i km")
        if (r.km !in 1..Mappa.KM_MAX) add("km da 1 a ${Mappa.KM_MAX}")
        if (r.vicinoA.isBlank() && r.luoghi.none { it.startsWith("http") }) add("serve vicino_a, il paese o la città")
        if (r.corto && normalizza(r.produttore).length < 3) add("un nome di una parola sola si trova dappertutto: aggiungi produttore (la marca o chi lo fa)")
    }

    // ── Il nome nella pagina ──

    fun normalizza(s: String): String = Normalizer.normalize(s.lowercase(), Normalizer.Form.NFD).replace(Regex("\\p{M}"), "")
        .replace(Regex("[^a-z0-9]+"), " ").trim()

    /**
     * La riga della pagina che contiene una delle forme, intera: in una carta o in un listino la riga è la voce (nome,
     * annata, prezzo). Se la riga è corta si aggiunge la seguente, dove spesso stanno il produttore e il prezzo.
     * Null = non c'è. Si confronta il testo normalizzato a parole intere: «Cane» non si trova in «Canepa».
     */
    fun trova(testo: String, forme: List<String>): String? {
        val cercate = forme.map { " ${normalizza(it)} " }.filter { it.isNotBlank() }
        val righe = testo.lines()
        righe.forEachIndexed { i, r ->
            val n = " ${normalizza(r)} "
            if (cercate.any { n.contains(it) }) {
                val frase = if (r.trim().length < 50 && i + 1 < righe.size) r.trim() + " " + righe[i + 1].trim() else r.trim()
                return Testi.corto(frase.replace(Regex("\\s+"), " "), 220)
            }
        }
        // Un nome spezzato su due righe (un menu impaginato a colonne): si guarda anche il testo tutto di seguito.
        val tutto = " ${normalizza(testo)} "
        return cercate.firstOrNull { tutto.contains(it) }?.let { "«${it.trim()}» nel testo della pagina (impaginato su più righe)" }
    }

    /** Il nome nella pagina, con la regola del nome corto: se è di una parola sola, nella pagina deve esserci anche il produttore. */
    fun trova(testo: String, r: Richiesta): String? {
        val frase = trova(testo, r.forme) ?: return null
        if (r.corto && !" ${normalizza(testo)} ".contains(" ${normalizza(r.produttore)} ")) return null
        return frase
    }

    // ── Quali link seguire dentro un sito ──

    // Le pagine dove un posto dice cosa ha: carte, menu, listini, cataloghi. Parole di qualunque negozio o locale, non di un caso.
    private val PAROLE_LINK = Regex("men[uù]|carta|carte|vin[io]\\b|vini|wine|listin|prodott|catalog|shop|negozi|bottigli|cantin|bevand|drink|birr|" +
        "assortiment|marchi|brand|rivendit|punti.?vendita|selezion|etichett|enoteca|dispensa|bottega|price|prezz", RegexOption.IGNORE_CASE)
    private val DA_EVITARE = Regex("facebook\\.|instagram\\.|twitter\\.|x\\.com|tiktok\\.|youtube\\.|wa\\.me|whatsapp|mailto:|tel:|" +
        "google\\.|maps\\.|privacy|cookie|login|account|carrello|cart\\b|checkout|wp-admin|#", RegexOption.IGNORE_CASE)

    data class Link(val href: String, val testo: String)

    fun pdf(url: String) = url.substringBefore('?').substringBefore('#').lowercase().endsWith(".pdf")

    /**
     * I link da seguire: dello stesso sito (o un PDF linkato da lì), che nel testo o nell'indirizzo dicono «carta, menu,
     * listino…». Prima i PDF e quelli col segno più forte; al massimo SOTTOPAGINE_MAX.
     */
    fun daSeguire(base: String, link: List<Link>, gia: Set<String> = emptySet()): List<String> {
        val casa = sito(base) ?: return emptyList()
        return link.asSequence()
            .map { it.copy(href = it.href.substringBefore('#').trim()) }
            .filter { it.href.startsWith("http") && !DA_EVITARE.containsMatchIn(it.href) && it.href !in gia && it.href.trimEnd('/') != base.trimEnd('/') }
            .filter { sito(it.href) == casa || pdf(it.href) }
            .map { l -> l to (PAROLE_LINK.findAll(l.testo).count() * 2 + PAROLE_LINK.findAll(l.href.substringAfter(casa)).count() + if (pdf(l.href)) 3 else 0) }
            .filter { it.second > 0 }
            .sortedByDescending { it.second }
            .map { it.first.href }
            .distinct()
            .take(SOTTOPAGINE_MAX)
            .toList()
    }

    // ── La mappa del sito (sitemap) ──
    // Il 05/10 la carta dei vini del Salotto Belvedere non era collegata da nessuna pagina: si arrivava solo conoscendo
    // l'indirizzo. Stava nella sitemap, che quasi ogni sito pubblica per i motori di ricerca (robots.txt la indica).
    // Quando i link non bastano, il programma legge la sitemap e ne prende gli indirizzi che dicono «carta, menu, listino».

    /** Le sitemap dichiarate in robots.txt; se non ce ne sono, i posti soliti. */
    fun sitemap(base: String, robots: String?): List<String> {
        val dichiarate = robots.orEmpty().lines().mapNotNull { r -> Regex("^\\s*sitemap:\\s*(\\S+)", RegexOption.IGNORE_CASE).find(r)?.groupValues?.get(1) }
        if (dichiarate.isNotEmpty()) return dichiarate.distinct().take(3)
        val r = radice(base)
        return listOf("$r/sitemap_index.xml", "$r/sitemap.xml", "$r/wp-sitemap.xml")
    }

    private val INDIRIZZO = Regex("https?://[^\\s<>\"']+")
    private val SITEMAP_INUTILI = Regex("image|author|tag|categor|attachment|video|news", RegexOption.IGNORE_CASE)

    /** Gli indirizzi scritti in una sitemap (come link o come testo), dello stesso sito. */
    fun indirizzi(base: String, testo: String, link: List<Link>): List<String> {
        val casa = sito(base) ?: return emptyList()
        return (link.map { it.href } + INDIRIZZO.findAll(testo).map { it.value.trimEnd('.', ',', ';', ')') }).filter { sito(it) == casa }.distinct()
    }

    /** Fra gli indirizzi di un indice di sitemap, le sitemap figlie che valgono una lettura (pagine, articoli, prodotti). */
    fun figlie(indirizzi: List<String>): List<String> = indirizzi.filter { it.substringBefore('?').lowercase().endsWith(".xml") && !SITEMAP_INUTILI.containsMatchIn(it) }
        .sortedByDescending { Regex("page|post|product|prodott|menu", RegexOption.IGNORE_CASE).containsMatchIn(it) }.take(3)

    fun radice(url: String): String = runCatching { java.net.URI(url).let { "${it.scheme}://${it.host}" } }.getOrDefault(url.trimEnd('/'))

    /** Il sito senza «www.» e senza sottodomini di lingua: «salottobelvedere.it». */
    fun sito(url: String): String? = runCatching { java.net.URI(url.trim()).host }.getOrNull()?.lowercase()?.removePrefix("www.")?.takeIf { it.contains('.') }

    // ── Di chi è un indirizzo ──

    // Guide, recensioni, social, elenchi: dicono che un posto esiste, non cosa ha in carta. Non sono il sito del posto.
    private val AGGREGATORI = listOf("tripadvisor", "facebook", "instagram", "yelp", "google", "restaurantguru", "thefork.it", "thefork.com",
        "paginegialle", "paginebianche", "virgilio", "exa.ai", "wikipedia", "wikivoyage", "tiktok", "youtube", "giallozafferano", "cybo",
        "misterimprese", "ilmiolibro", "amazon", "ebay", "vivino", "openstreetmap", "foursquare", "booking", "airbnb", "eatoutmap", "sluurpy")

    fun aggregatore(url: String) = sito(url)?.let { s -> AGGREGATORI.any { s.contains(it) } } ?: true

    /**
     * L'indirizzo è il sito di questo posto? Il dominio deve contenere una parola vera del nome (almeno 4 lettere,
     * non «ristorante», «bar»…): «salottobelvedere.it» per «Salotto Belvedere». Gli aggregatori mai.
     */
    fun diQuesto(url: String, nome: String): Boolean {
        if (aggregatore(url)) return false
        val dominio = sito(url)?.replace(Regex("[^a-z0-9]"), "") ?: return false
        val parole = Incrocio.chiave(nome).split(' ').filter { it.length >= 4 }
        return parole.isNotEmpty() && parole.any { dominio.contains(it) }
    }

    // ── I candidati e gli esiti ──

    enum class Origine(val etichetta: String) { SHELL("nominato"), WEB("dal web"), MAPPA("dalla mappa") }

    data class Candidato(val nome: String, val url: String?, val dove: String = "", val km: Double? = null, val origine: Origine)

    sealed class Esito {
        abstract val candidato: Candidato
        data class Trovato(override val candidato: Candidato, val url: String, val frase: String) : Esito()
        data class NonTrovato(override val candidato: Candidato, val pagine: Int) : Esito()
        data class NonAperto(override val candidato: Candidato, val motivo: String) : Esito()
        data class SenzaSito(override val candidato: Candidato) : Esito()
    }

    /** I posti dalla mappa: col sito vero (non la scheda di OpenStreetMap) o senza. */
    fun dallaMappa(luoghi: List<Mappa.Luogo>): List<Candidato> = luoghi.map { l ->
        Candidato(l.nome, l.url.takeUnless { it.contains("openstreetmap.org/") || it.isBlank() }?.let(::conSchema), l.dove, l.km, Origine.MAPPA)
    }

    // OpenStreetMap scrive spesso il sito senza schema («americanpubgaleon.it»).
    fun conSchema(u: String) = u.trim().let { if (it.startsWith("http")) it else "https://$it" }

    /** I posti che lo Shell nomina: un indirizzo è già un sito; un nome va cercato. */
    fun nominati(luoghi: List<String>, vicinoA: String): List<Candidato> = luoghi.map { it.trim() }.filter { it.isNotEmpty() }.map { l ->
        if (l.startsWith("http")) Candidato(sito(l) ?: l, l, origine = Origine.SHELL) else Candidato(l, null, vicinoA, origine = Origine.SHELL)
    }

    /**
     * Dalle ricerche sul web: gli indirizzi che non sono guide né social, uno per sito. Si tiene la PAGINA trovata, non la
     * pagina iniziale: se è la carta che nomina la cosa (il 05/10 due carte dei vini col Mannaja Cane le aveva viste
     * Perplexity, e nessuno le ha aperte), la prima lettura basta.
     */
    fun dalWeb(fonti: List<Consulente.Fonte>): List<Candidato> = fonti.filter { !aggregatore(it.url) }.distinctBy { sito(it.url) }
        .map { Candidato(it.titolo.ifBlank { it.dominio }.let { t -> Testi.corto(t, 60) }, it.url, origine = Origine.WEB) }

    // Senza la mappa i candidati vengono solo dal web, che conosce negozi online e recensioni, non i posti vicini. Il 05/10
    // un rifiuto per osm mancante ha fermato lo Shell due volte su quattro (ripeteva la stessa chiamata, poi chiedeva al
    // Ghost): meglio cercare lo stesso e dirlo nella scheda, con l'esempio, che non cercare.
    fun senzaMappa(r: Richiesta): String? = if (r.vicinoA.isNotBlank() && r.osm.isEmpty() && r.luoghi.isEmpty())
        "senza osm: nessun posto vicino dalla mappa, solo pagine dal web. Per i posti, richiama con osm (vino: shop=wine|alcohol, " +
            "amenity=restaurant|bar; formaggio: shop=cheese|deli; libro: shop=books)" else null

    /** Le ricerche sul web di ogni trova_dove: le pagine che nominano la cosa (nel posto e ovunque), più gli indizi dello Shell. */
    fun ricerche(r: Richiesta): List<String> = (listOfNotNull(
        r.vicinoA.takeIf { it.isNotBlank() }?.let { "\"${r.cosa}\" ${r.produttore} $it".replace(Regex("\\s+"), " ") },
        "\"${r.cosa}\" ${r.produttore} carta menu listino dove si trova".replace(Regex("\\s+"), " "),
    ) + r.indizi).distinct().take(2 + INDIZI_MAX)

    /**
     * L'ordine delle visite: prima i posti nominati, poi quelli che il web associa alla domanda, poi la mappa per distanza.
     * Uno per sito. I posti senza sito restano in fondo, per la scoperta del sito o per dirli come tali.
     */
    fun ordina(candidati: List<Candidato>): List<Candidato> {
        // Lo stesso sito da due fonti (la pagina trovata sul web e il posto sulla mappa) è un candidato solo: si tiene la
        // pagina della fonte che viene prima, col nome e la distanza della mappa.
        val conSito = candidati.filter { it.url != null }
            .groupBy { sito(it.url!!) ?: it.url }.values
            .map { stessi ->
                val primo = stessi.minWith(compareBy<Candidato> { it.origine.ordinal }.thenBy { it.km ?: Double.MAX_VALUE })
                val luogo = stessi.firstOrNull { it.km != null }
                if (luogo == null || luogo === primo) primo else primo.copy(nome = luogo.nome, dove = luogo.dove, km = luogo.km)
            }
            .sortedWith(compareBy<Candidato> { it.origine.ordinal }.thenBy { it.km ?: Double.MAX_VALUE })
        val senza = candidati.filter { it.url == null }.sortedWith(compareBy<Candidato> { it.origine.ordinal }.thenBy { it.km ?: Double.MAX_VALUE })
            .distinctBy { Incrocio.chiave(it.nome) }
        return conSito + senza
    }

    /** Le domande per trovare il sito dei posti senza: una per posto, col paese. */
    fun domandeSito(senza: List<Candidato>): List<String> = senza.map { "sito ufficiale ${it.nome} ${it.dove}".trim() }

    /** Il sito di un posto fra gli indirizzi trovati: il primo il cui dominio porta il suo nome. */
    fun sitoDi(c: Candidato, fonti: List<Consulente.Fonte>): String? = fonti.firstOrNull { diQuesto(it.url, c.nome) }?.url?.let { u ->
        // Si parte dalla pagina iniziale: la carta la trova il programma seguendo i link.
        sito(u)?.let { "https://${java.net.URI(u).host}/" } ?: u
    }

    // ── Ciò che si vede ──

    const val TITOLO = "Dove trovo:"

    private fun riga(e: Esito): String {
        val c = e.candidato
        val dove = listOfNotNull(c.dove.takeIf { it.isNotBlank() }, c.km?.let { "%.0f km in linea d'aria".format(it) }).joinToString(", ")
        val chi = c.nome + if (dove.isNotEmpty()) " ($dove)" else ""
        return when (e) {
            is Esito.Trovato -> "✓ $chi — «${e.frase}» — ${e.url}"
            is Esito.NonTrovato -> "· $chi — letto (${e.pagine} ${if (e.pagine == 1) "pagina" else "pagine"}), non c'è — ${c.url}"
            is Esito.NonAperto -> "✗ $chi — non aperto: ${e.motivo} — ${c.url}"
            is Esito.SenzaSito -> "○ $chi — nessun sito trovato"
        }
    }

    /**
     * La scheda in chat. Due parti, perché dicono cose diverse: i POSTI (dalla mappa o nominati) sono luoghi veri vicini;
     * le PAGINE dal web sono negozi online, recensioni, distributori, carte di locali chissà dove. Il 05/10 erano tutte
     * insieme e «4 posti lo hanno» contava il disciplinare del pecorino.
     */
    fun scheda(r: Richiesta, esiti: List<Esito>, note: List<String>): String = buildString {
        val (web, posti) = esiti.partition { it.candidato.origine == Origine.WEB }
        val ordine = { e: Esito -> when (e) { is Esito.Trovato -> 0; is Esito.NonTrovato -> 1; is Esito.NonAperto -> 2; is Esito.SenzaSito -> 3 } }
        append("$TITOLO «${r.cosa}»" + if (r.produttore.isNotBlank()) " (${r.produttore})" else "")
        if (r.vicinoA.isNotBlank()) append(" vicino a ${r.vicinoA}" + if (r.osm.isNotEmpty()) " (${r.km} km)" else "")
        val trovati = posti.count { it is Esito.Trovato }
        append("\nPosti vicini: $trovati ${if (trovati == 1) "lo ha" else "lo hanno"} su ${posti.count { it !is Esito.SenzaSito }} siti aperti")
        append(" · ${posti.count { it is Esito.NonAperto }} non aperti · ${posti.count { it is Esito.SenzaSito }} senza sito")
        posti.sortedBy(ordine).forEach { append("\n").append(riga(it)) }
        if (web.isNotEmpty()) {
            append("\nSul web, pagine che lo nominano (negozi online, recensioni, carte; dove siano non è detto): ${web.count { it is Esito.Trovato }} su ${web.size}")
            web.sortedBy(ordine).forEach { append("\n").append(riga(it)) }
        }
        note.forEach { append("\n⚠ $it") }
    }

    /** Ciò che lo Shell riceve: le prove, e come parlarne. Il modello scrive la risposta sopra queste, non sopra ciò che ricorda. */
    fun perIlModello(r: Richiesta, esiti: List<Esito>, note: List<String>): String = buildString {
        appendLine("PROVE DEL PROGRAMMA: ha aperto i siti e cercato «${r.forme.joinToString("» / «")}» nel testo delle pagine.")
        appendLine(scheda(r, esiti, note))
        appendLine()
        append("Come riferirle: ✓ = il nome è scritto in quella pagina, dillo con la frase e il link. · = letto senza trovarlo: " +
            "«non risulta dal sito», non «non ce l'ha» (una carta cambia, una pagina può mancare). ✗ e ○ = non verificato, e dillo. " +
            "Non aggiungere posti, distanze o disponibilità che non stanno in queste prove o nelle fonti di altre ricerche di questo turno; " +
            "una pagina che lo nomina senza dire dove sia va detta così, col link.")
        append(" Le pagine «sul web» non sono posti vicini: un negozio online si dice negozio online, una recensione non è un punto vendita.")
        if (esiti.none { it is Esito.Trovato && it.candidato.origine != Origine.WEB })
            append(" Nessun posto vicino lo nomina sul suo sito: dillo chiaramente, e proponi il passo dopo (telefonare o scrivere ai posti più vicini, allargare la zona, il sito del produttore).")
    }
}
