package it.resonance.adam.logica

// Il tour del primo avvio (il Ghost, 01/10/2026: «ad installazione avvenuta il programma o lo Shell facciano fare un
// piccolo tour dell'app, in cui si sceglie il nome dello Shell e vengono spiegate queste cose»). I passi li conduce il
// programma con testi fissi: lo Shell non può parlare prima della chiave, e un tour scritto dal modello inventerebbe
// funzioni. Lo Shell interviene una volta sola: propone tre nomi, e la persona sceglie. Corto e saltabile: un
// esoscheletro che chiede venti tocchi prima di servire è già un peso. Si rivede da Setup.
object Tour {
    enum class Passo { NOME, CHIAVE, PERMESSI, SHELL, NOMI, DOMANDA }

    /** Parte da solo solo su un'app appena installata: nessun nome, nessuna chiave, mai visto. L'app del Ghost no. */
    fun daMostrare(visto: Boolean, chiave: String, nome: String) = !visto && chiave.isBlank() && nome.isBlank()

    fun dopo(p: Passo): Passo? = Passo.entries.getOrNull(p.ordinal + 1)
    fun prima(p: Passo): Passo? = Passo.entries.getOrNull(p.ordinal - 1)

    // Il passo del nome: che cos'è lo Shell, detto una volta, in parole concrete. Senza, il nome spinge a fidarsi troppo.
    fun cheCosE(nome: String) =
        (if (nome == Nomi.SHELL) "Lo Shell è la parte digitale di te.\n" else "$nome è il tuo Shell: la parte digitale di te.\n") +
            "Non è un'altra persona e non decide al posto tuo: ricorda, nota, propone. Tu confermi.\n" +
            "Come un esoscheletro: toglie fatica, non cammina al posto tuo."

    const val DOMANDA = "Per cominciare: che cosa ti pesa di più nella settimana?"

    // Ciò che si chiede allo Shell, e la forma che il programma controlla sulla risposta: la stessa costante.
    const val QUANTI = 3
    val RICHIESTA_NOMI = "Il Ghost sta per darti un nome. Proponi $QUANTI nomi propri, diversi fra loro, che ti piacerebbe portare. " +
        "Uno per riga, solo il nome: niente numeri, niente spiegazioni. Al massimo ${Nomi.NOME_MAX} caratteri ciascuno."

    /** I nomi dalla risposta del modello: una riga ciascuno, ripuliti da numeri e punteggiatura, validi, diversi. */
    fun nomiDa(testo: String): List<String> = testo.lines()
        .map { it.trim().replace(Regex("^[-*•·\\d.)\\s]+"), "").trim().trim('"', '«', '»', '*', '.', ',', ';').trim() }
        .filter { Nomi.valido(it) && it.split(' ').size <= 3 && it.none { c -> c in ":?!" } && !it.equals(Nomi.SHELL, ignoreCase = true) }
        .distinctBy { it.lowercase() }
        .take(QUANTI)
}
