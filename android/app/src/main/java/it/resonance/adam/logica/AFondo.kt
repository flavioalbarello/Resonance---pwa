package it.resonance.adam.logica

import kotlin.math.roundToInt

// La ricerca a fondo, a strati (02/10/2026). Il Ghost: «deve poter accedere a thread, forum, recensioni, in ogni luogo
// si possa ragionevolmente nascondere l'informazione, con i relativi livelli di attendibilità; deve poter incrociare
// questi dati: parte in mano al codice, parte in mano al modello». E: costa di più, quindi la propone lo Shell e la
// autorizza il Ghost, con la stima davanti.
// Divisione: il modello scompone la domanda (le sotto-domande, nella proposta), legge e scrive le affermazioni; il
// programma fa le ricerche, dà il livello alle fonti con regole fisse, conta le fonti indipendenti di ogni affermazione,
// dice dove non ha potuto guardare, stima il costo prima e mette il costo reale accanto alla stima dopo.
object AFondo {
    enum class Tipo(val etichetta: String, val dove: String) {
        UFFICIALE("dati ufficiali", "Cerca soprattutto fonti ufficiali e scientifiche: enti pubblici, statistiche, studi, censimenti. Riporta chi ha prodotto il dato e quando."),
        NOTIZIE("notizie", "Cerca soprattutto giornali e agenzie di stampa, anche locali. Riporta testata e data."),
        FORUM("forum e thread", "Cerca soprattutto forum, thread, Reddit, discussioni di appassionati: esperienze dirette. Riporta il nome del forum e la data del messaggio."),
        RECENSIONI("recensioni", "Cerca soprattutto recensioni e opinioni di chi ha provato. Riporta il sito e quante recensioni."),
        ANNUNCI("annunci e mercato", "Cerca soprattutto annunci, inserzioni, listini e negozi: disponibilità e prezzi. Riporta il sito, la data e quanti annunci."),
    }

    const val SOTTO_MIN = 2
    const val SOTTO_MAX = 6

    data class Sotto(val tipo: Tipo, val domanda: String)

    /** «forum: esperienze di avvistamento» → Sotto(FORUM, …). Il tipo si riconosce anche dall'etichetta italiana. */
    fun sotto(riga: String): Sotto? {
        val (t, d) = riga.split(':', limit = 2).takeIf { it.size == 2 }?.let { it[0].trim().lowercase() to it[1].trim() } ?: return null
        if (d.isBlank()) return null
        val tipo = Tipo.entries.firstOrNull { it.name.lowercase() == t || it.etichetta == t || it.etichetta.startsWith(t) } ?: return null
        return Sotto(tipo, d)
    }

    fun difetti(domanda: String, sotto: List<String>, inAttesa: Int): List<String> = buildList {
        if (domanda.isBlank()) add("manca la domanda")
        if (sotto.size !in SOTTO_MIN..SOTTO_MAX) add("da $SOTTO_MIN a $SOTTO_MAX sotto-domande")
        sotto.filter { sotto(it) == null }.takeIf { it.isNotEmpty() }?.let {
            add("ogni sotto-domanda comincia col tipo (${Tipo.entries.joinToString("/") { t -> t.name.lowercase() }}) e due punti: «${it.first()}» non va")
        }
        if (inAttesa > 0) add("c'è già una ricerca a fondo in attesa del Ghost: una per volta")
    }

    fun domandaSotto(s: Sotto, generale: String) = "${s.domanda}\n(Fa parte di una ricerca più ampia: «$generale».)\n${s.tipo.dove}"

    // ── Il livello delle fonti: regole fisse del programma, non un giudizio del modello ──

    enum class Livello(val sigla: String, val etichetta: String) {
        A("A", "ufficiale o scientifica"), B("B", "giornalismo o istituzioni"), C("C", "forum, recensioni, testimonianze"),
        D("D", "commerciale: chi vende ha un interesse"), N("?", "non classificata"),
    }

    private val UFFICIALI = listOf(".gov", ".gov.", ".edu", ".ac.", ".int", "europa.eu", "istat.it", "who.int", "un.org", "oecd.org", "ncbi.nlm.nih.gov",
        "pubmed", "nature.com", "science.org", "sciencedirect.com", "springer.com", "wiley.com", "researchgate.net", "arxiv.org", "plos.org",
        "iucnredlist.org", "fws.gov", "noaa.gov", "myfwc.com", "isprambiente.gov.it", "bancaditalia.it", "ecb.europa.eu", "worldbank.org")
    private val NOTIZIE = listOf("reuters.com", "apnews.com", "bbc.", "ansa.it", "corriere.it", "repubblica.it", "ilsole24ore.com", "lastampa.it",
        "ilpost.it", "nytimes.com", "theguardian.com", "washingtonpost.com", "bloomberg.com", "ft.com", "wsj.com", "economist.com", "lemonde.fr",
        "spiegel.de", "elpais.com", "cnn.com", "nationalgeographic.", "wikipedia.org", "treccani.it")
    private val VOCI = listOf("reddit.com", "quora.com", "forum", "community", "discourse", "stackexchange.com", "stackoverflow.com", "trustpilot.",
        "tripadvisor.", "yelp.", "youtube.com", "facebook.com", "instagram.com", "x.com", "twitter.com", "tiktok.com", "medium.com", "substack.com",
        "blogspot.", "wordpress.", "tumblr.com", "inaturalist.org", "ebird.org")
    private val MERCATO = listOf("amazon.", "ebay.", "autoscout24.", "subito.it", "mobile.de", "automobile.it", "kijiji.", "craigslist.", "idealista.",
        "immobiliare.it", "booking.com", "etsy.com", "aliexpress.", "zalando.", "shop", "store", "dealer", "concessionari")

    fun livello(url: String): Livello {
        val d = Consulente.dominio(url).lowercase()
        val u = url.lowercase()
        return when {
            UFFICIALI.any { d.contains(it) } -> Livello.A
            VOCI.any { d.contains(it) || (it == "forum" && u.contains("/forum")) } -> Livello.C
            MERCATO.any { d.contains(it) } -> Livello.D
            NOTIZIE.any { d.contains(it) } -> Livello.B
            else -> Livello.N
        }
    }

    // ── La forma della sintesi e l'incrocio: detta e verifica dalla stessa costante ──

    const val SINTESI = "Sintesi:"
    val FORMA = "Scrivi in italiano. Prima le affermazioni, una per riga, ognuna comincia con «- » e finisce con i numeri delle fonti che la " +
        "sostengono fra parentesi quadre, per esempio «- La popolazione è stimata in 8.300 esemplari nel 2024 [3, 7]». Solo affermazioni che le " +
        "fonti qui sotto sostengono davvero; se due fonti non sono d'accordo, scrivi le due versioni con «(in contrasto)». Poi una riga «$SINTESI» " +
        "e al massimo cinque righe di sintesi, che distinguono ciò che è confermato da ciò che è solo testimonianza. Niente fonti inventate."

    data class Fonte(val n: Int, val url: String, val titolo: String, val dominio: String, val livello: Livello)

    /** Le fonti di tutte le sotto-ricerche, senza doppioni, numerate e classificate. */
    fun fonti(gruppi: List<List<Consulente.Fonte>>): List<Fonte> =
        gruppi.flatten().distinctBy { it.url }.mapIndexed { i, f -> Fonte(i + 1, f.url, f.titolo, f.dominio, livello(f.url)) }

    private val RIMANDI = Regex("\\[([0-9 ,;]+)]\\s*\\.?\\s*$")

    data class Affermazione(val testo: String, val fonti: List<Fonte>, val inventate: List<Int>) {
        val indipendenti get() = fonti.map { it.dominio.lowercase() }.distinct().size
        val migliore get() = fonti.minByOrNull { it.livello.ordinal }?.livello
    }

    /** Le righe «- … [n, m]» della sintesi, con le fonti vere a cui rimandano e i numeri che non esistono. */
    fun affermazioni(testo: String, fonti: List<Fonte>): List<Affermazione> = testo.lines().map { it.trim() }
        .filter { it.startsWith("- ") || it.startsWith("• ") }
        .map { r ->
            val m = RIMANDI.find(r)
            val numeri = m?.groupValues?.get(1)?.split(',', ';', ' ')?.mapNotNull { it.trim().toIntOrNull() }.orEmpty().distinct()
            val perN = fonti.associateBy { it.n }
            Affermazione(r.removePrefix("- ").removePrefix("• ").let { if (m != null) it.substring(0, it.length - m.value.length).trimEnd() else it },
                numeri.mapNotNull { perN[it] }, numeri.filter { it !in perN })
        }

    /** L'etichetta che il programma mette accanto a ogni affermazione: quante fonti indipendenti, di che livello. */
    fun etichetta(a: Affermazione): String = when {
        a.fonti.isEmpty() -> "⚠ nessuna fonte" + if (a.inventate.isNotEmpty()) " (rimanda a ${a.inventate.joinToString()}, che non esistono)" else ""
        a.indipendenti >= 2 -> "${a.indipendenti} fonti indipendenti · migliore ${a.migliore!!.sigla}"
        else -> "1 sola fonte · ${a.migliore!!.sigla} ${a.migliore!!.etichetta}"
    } + if (a.fonti.isNotEmpty() && a.inventate.isNotEmpty()) " · ⚠ rimanda anche a ${a.inventate.joinToString()}, che non esistono" else ""

    /** Una riga per strato: cosa ha trovato, o perché non ha potuto. Il 02/10 cinque strati falliti dicevano solo «nessuna fonte». */
    fun esito(s: Sotto, riuscita: Boolean, fonti: Int, problemi: List<String>): String = when {
        !riuscita -> "✗ ${s.tipo.etichetta}: non riuscita — ${problemi.joinToString("; ").take(220)}"
        fonti == 0 -> "· ${s.tipo.etichetta}: ha risposto senza fonti"
        else -> "✓ ${s.tipo.etichetta}: $fonti fonti"
    }

    val CHIUSI = "gruppi chiusi (Facebook, Telegram, WhatsApp), forum dietro login, annunci visibili solo dentro le app, pagine non indicizzate"

    /** Dove il programma non ha potuto guardare: i tipi senza nessuna fonte, e ciò che nessun motore vede. */
    fun doveNo(perTipo: Map<Tipo, Int>): String {
        val vuoti = perTipo.filterValues { it == 0 }.keys.map { it.etichetta }
        return "Dove non ho potuto guardare: " + (if (vuoti.isNotEmpty()) "${vuoti.joinToString(", ")} (nessuna fonte trovata); " else "") + CHIUSI + "."
    }

    // ── La stima del costo: la fa il programma coi prezzi del listino, non il modello ──

    const val COSTO_RICERCA = 0.007          // dollari per ricerca Exa, verificato sulla documentazione di OpenRouter il 02/10/2026
    const val COSTO_RICHIESTA = 0.005        // dollari per richiesta a Perplexity, dal listino del 02/10/2026; col contesto alto fino a 2,4 volte
    private const val TOKEN_RICERCA_IN = 12_000
    private const val TOKEN_DA_SE_IN = 1_500 // a Perplexity va solo la domanda: ciò che legge non si paga a token
    private const val TOKEN_RICERCA_OUT = 900
    private const val TOKEN_SINTESI_OUT = 1_500

    data class Forbice(val min: Double, val max: Double)

    /**
     * Una ricerca col modello che legge, prezzi dal listino (dollari per milione). Chi cerca da sé (Perplexity) paga la
     * richiesta e pochi token; gli altri da 1 a 4 ricerche Exa e i risultati letti come token.
     */
    fun stimaRicerca(v: Listino.Voce): Forbice {
        if (Listino.cercaDaSe(v.id)) {
            val richiesta = v.perRichiesta.takeIf { it > 0 } ?: COSTO_RICHIESTA
            val token = TOKEN_DA_SE_IN * v.ingresso / 1e6 + TOKEN_RICERCA_OUT * v.uscita / 1e6
            return Forbice(richiesta + token * 0.6, richiesta * 2.4 + token * 1.6)
        }
        val token = TOKEN_RICERCA_IN * v.ingresso / 1e6 + TOKEN_RICERCA_OUT * v.uscita / 1e6
        return Forbice(COSTO_RICERCA + token * 0.6, 4 * COSTO_RICERCA + token * 1.6)
    }

    /** Gli strati, ciascuno col suo modello di ricerca, più l'incrocio col modello che non cerca. */
    fun stima(sotto: Int, strato: Listino.Voce, sintesi: Listino.Voce): Forbice {
        val r = stimaRicerca(strato)
        val inSintesi = (sotto * 2_000 + 1_500) * sintesi.ingresso / 1e6 + TOKEN_SINTESI_OUT * sintesi.uscita / 1e6
        return Forbice(sotto * r.min + inSintesi * 0.6, sotto * r.max + inSintesi * 1.6)
    }

    fun centesimi(d: Double) = (d * 100).let { if (it < 1) String.format(java.util.Locale.ITALIAN, "%.1f", it) else it.roundToInt().toString() }
    fun testo(f: Forbice) = "${centesimi(f.min)}–${centesimi(f.max)} centesimi di dollaro"
}
