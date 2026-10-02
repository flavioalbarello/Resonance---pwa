package it.resonance.adam.logica

import java.text.Normalizer

// L'incrocio (02/10/2026, notte). Il Ghost: «incrociare i dati è la base dell'intelligenza e dell'efficacia di ogni
// ricerca»; e «la ricerca scema la posso fare sempre su Google, noi puntiamo a costruire qualcosa di meglio».
// Un motore solo per ogni ricerca: il modello scompone la domanda in caselle (dove, che tipo di fonte, quale sito, quale
// periodo) e in ogni casella elenca gli ELEMENTI che trova, uno per riga, con la fonte; il programma riconosce lo stesso
// elemento in caselle e fonti diverse (lo stesso locale su OpenStreetMap, TheFork e un forum; lo stesso anno in un
// censimento e in un giornale), conta le fonti indipendenti, mette i dati accanto e ordina: in cima ciò che più fonti
// confermano. Cambia solo che cos'è l'elemento: un posto, un annuncio, un anno, un prezzo.
// Detta e verifica dalla stessa costante: FORMA dice la riga, `elementi` la legge con gli stessi separatori.
object Incrocio {
    const val SEP = "|"
    const val MAPPA = "OpenStreetMap"

    val FORMA = "Poi una riga per ogni elemento che le fonti nominano (un posto, un annuncio, un prodotto, una persona, un anno, un " +
        "valore), nella forma «- nome $SEP dove o a cosa si riferisce $SEP il dato che lo distingue, con data e unità [numero della fonte]». " +
        "Il nome scritto come lo scrivono le fonti. Una riga per elemento, anche se è uno solo; niente premesse."

    data class Elemento(val nome: String, val dove: String, val dato: String, val fonti: List<Consulente.Fonte>, val casella: String)

    private val RIGA = Regex("^\\s*[-•*]\\s+(.+)$")
    private val RIMANDI = Regex("\\[(\\d+)]")

    /** Le righe-elemento di una risposta; i numeri fra parentesi quadre puntano alle fonti del motore, nel loro ordine. */
    fun elementi(testo: String, fonti: List<Consulente.Fonte>, casella: String): List<Elemento> = testo.lines().mapNotNull { r ->
        val corpo = RIGA.matchEntire(r)?.groupValues?.get(1) ?: return@mapNotNull null
        val parti = corpo.split(SEP).map { it.trim() }
        if (parti.size < 2) return@mapNotNull null
        val numeri = RIMANDI.findAll(corpo).mapNotNull { it.groupValues[1].toIntOrNull() }.distinct().toList()
        val pulito = { s: String -> s.replace(RIMANDI, "").replace("**", "").trim().trimEnd('.', ';', ',') }
        val nome = pulito(parti[0])
        if (nome.isEmpty() || chiave(nome).isEmpty()) return@mapNotNull null
        Elemento(nome, pulito(parti[1]), pulito(parti.drop(2).joinToString(" $SEP ")), numeri.mapNotNull { fonti.getOrNull(it - 1) }, casella)
    }

    // Parole che non distinguono un elemento da un altro: «Ristorante La Riserva» e «La Riserva» sono lo stesso posto.
    private val VUOTE = setOf("il", "lo", "la", "i", "gli", "le", "l", "un", "una", "da", "di", "del", "della", "dei", "e", "the", "a", "al",
        "ristorante", "trattoria", "osteria", "pizzeria", "hostaria", "locanda", "agriturismo", "bar", "restaurant", "enoteca", "braceria",
        "dott", "ssa", "dottssa", "dottoressa", "dottore", "dr", "dra", "studio", "medico", "pediatra")

    fun chiave(nome: String): String = Normalizer.normalize(nome.lowercase(), Normalizer.Form.NFD).replace(Regex("\\p{M}"), "")
        .replace(Regex("[^a-z0-9]+"), " ").split(' ').filter { it.isNotBlank() && it !in VUOTE }.joinToString(" ")

    /** Lo stesso elemento: stessa chiave, o le parole di una tutte dentro l'altra (almeno una parola vera). */
    fun stesso(a: String, b: String): Boolean {
        val ka = chiave(a); val kb = chiave(b)
        if (ka.isEmpty() || kb.isEmpty()) return false
        if (ka == kb) return true
        val pa = ka.split(' ').toSet(); val pb = kb.split(' ').toSet()
        val (corta, lunga) = if (pa.size <= pb.size) pa to pb else pb to pa
        return corta.any { it.length >= 4 } && lunga.containsAll(corta)
    }

    // Due elementi con nomi solo simili e posti diversi sono due cose: «Da Mario» a Tolfa non è «Bar Mario» a Bracciano.
    // Con lo stesso nome esatto basta: «Milano» e «Lombardia» possono essere lo stesso annuncio.
    fun vicini(a: String, b: String, stessoNome: Boolean): Boolean {
        if (stessoNome || a.isBlank() || b.isBlank()) return true
        val pa = chiave(a).split(' ').toSet(); val pb = chiave(b).split(' ').toSet()
        return pa.any { it in pb }
    }

    // Il nome scritto uguale (a parte maiuscole e punteggiatura): «Da Mario» e «Bar Mario» hanno la stessa chiave, non lo stesso nome.
    fun esatto(a: String, b: String) = Normalizer.normalize("$a\u0000$b".lowercase(), Normalizer.Form.NFD).replace(Regex("\\p{M}"), "")
        .split('\u0000').map { it.replace(Regex("[^a-z0-9]+"), " ").trim() }.let { it[0] == it[1] }

    fun stesso(a: Elemento, b: Elemento) = stesso(a.nome, b.nome) && vicini(a.dove, b.dove, esatto(a.nome, b.nome))

    data class Incrociato(val nome: String, val dove: String, val voci: List<Elemento>, val mappa: Mappa.Luogo?) {
        val domini get() = (voci.flatMap { v -> v.fonti.map { it.dominio.lowercase().removePrefix("www.") } } + listOfNotNull(mappa?.let { MAPPA })).distinct()
        val caselle get() = (voci.map { it.casella } + listOfNotNull(mappa?.let { "mappa" })).distinct()
        val livello get() = voci.flatMap { it.fonti }.minOfOrNull { AFondo.livello(it.url).ordinal }?.let { AFondo.Livello.entries[it] }
    }

    /** Raggruppa gli elementi uguali, aggancia i luoghi della mappa, e ordina per conferme indipendenti. */
    fun incrocia(elementi: List<Elemento>, luoghi: List<Mappa.Luogo> = emptyList()): List<Incrociato> {
        val gruppi = mutableListOf<MutableList<Elemento>>()
        elementi.forEach { e -> gruppi.firstOrNull { g -> g.any { stesso(it, e) } }?.add(e) ?: gruppi.add(mutableListOf(e)) }
        val usati = mutableSetOf<Mappa.Luogo>()
        val dalWeb = gruppi.map { g ->
            val l = luoghi.firstOrNull { it !in usati && g.any { e -> stesso(e.nome, it.nome) && vicini(e.dove, it.dove, esatto(e.nome, it.nome)) } }?.also { usati += it }
            Incrociato(g.first().nome, g.map { it.dove }.firstOrNull { it.isNotBlank() } ?: l?.dove.orEmpty(), g, l)
        }
        val soloMappa = luoghi.filter { it !in usati }.map { Incrociato(it.nome, it.dove, emptyList(), it) }
        return (dalWeb.withIndex().sortedWith(compareByDescending<IndexedValue<Incrociato>> { it.value.domini.size }
            .thenByDescending { it.value.caselle.size }.thenBy { it.value.livello?.ordinal ?: 9 }.thenBy { it.index }).map { it.value }) + soloMappa
    }

    // Due fonti che danno numeri diversi sulla stessa cosa (un prezzo, un conteggio): si dice, non si sceglie. I voti con
    // la barra (4,5/5 e 9/10) hanno scale diverse e non si confrontano.
    private val NUMERO = Regex("(?<![/\\d])(\\d{1,3}(?:[.\\s]\\d{3})+|\\d+)(?:,(\\d+))?(?!\\s*/)")

    // Il primo numero che non sia un anno: «censimento 2024: 1.100» confronta 1.100, non 2024.
    fun numeri(dati: List<String>): List<Double> = dati.filter { '/' !in it }.mapNotNull { d ->
        NUMERO.findAll(d).map { m -> m.groupValues[1] to (m.groupValues[1].replace(".", "").replace(" ", "") +
            (m.groupValues[2].takeIf { it.isNotEmpty() }?.let { ".$it" } ?: "")).toDoubleOrNull() }
            .firstOrNull { (grezzo, v) -> v != null && !(grezzo.length == 4 && v in 1900.0..2100.0) }?.second
    }

    fun avvisi(i: Incrociato): List<String> = buildList {
        val dati = i.voci.map { it.dato }.filter { it.isNotBlank() }
        val n = numeri(dati)
        if (n.size >= 2 && n.min() > 0 && n.max() / n.min() > 1.15) add("numeri diversi fra le fonti")
        val chiuso = Regex("chius[oa] (definitivamente|per sempre)|non più attiv|cessat", RegexOption.IGNORE_CASE)
        if (dati.any { chiuso.containsMatchIn(it) } && dati.any { !chiuso.containsMatchIn(it) }) add("una fonte lo dice chiuso, un'altra no")
    }

    fun etichetta(i: Incrociato): String {
        val n = i.domini.size
        val dove = i.caselle.joinToString(", ")
        return (if (n >= 2) "$n fonti indipendenti ($dove)" else "una sola fonte ($dove)") +
            (i.livello?.let { " · migliore ${it.sigla}" } ?: "") + avvisi(i).joinToString("") { " · ⚠ $it" }
    }

    /** La scheda dell'incrocio: in cima ciò che più fonti confermano; i posti solo sulla mappa contati in fondo. */
    fun scheda(incrociati: List<Incrociato>, massimo: Int = 12): String = buildString {
        val conWeb = incrociati.filter { it.voci.isNotEmpty() }
        val soloMappa = incrociati.filter { it.voci.isEmpty() }
        if (conWeb.isEmpty() && soloMappa.isEmpty()) { append("Nessun elemento da incrociare."); return@buildString }
        conWeb.take(massimo).forEachIndexed { k, i ->
            val dati = i.voci.filter { it.dato.isNotBlank() }.distinctBy { it.dato }.take(3)
                .joinToString("; ") { v -> (v.fonti.firstOrNull()?.dominio?.removePrefix("www.")?.let { "$it: " } ?: "") + Testi.corto(v.dato, 90) }
            val mappa = i.mappa?.let { "mappa: ${listOf(it.categoria, it.dove, "%.0f km".format(it.km)).filter { s -> s.isNotBlank() }.joinToString(", ")}" }
            appendLine("${k + 1}. ${i.nome}" + (if (i.dove.isNotBlank()) " — ${i.dove}" else ""))
            listOfNotNull(dati.ifBlank { null }, mappa).forEach { appendLine("   $it") }
            appendLine("   ${etichetta(i)}")
        }
        if (conWeb.size > massimo) appendLine("(altri ${conWeb.size - massimo} con meno conferme)")
        if (soloMappa.isNotEmpty()) appendLine("Sulla mappa, senza nessuna fonte sul web: ${soloMappa.size}" +
            " (${soloMappa.take(8).joinToString(", ") { "${it.nome}${if (it.dove.isNotBlank()) ", ${it.dove}" else ""}" }}${if (soloMappa.size > 8) ", …" else ""})")
    }.trimEnd()
}
