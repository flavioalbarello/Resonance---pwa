package it.resonance.adam.logica

import it.resonance.adam.dati.Pilastro

// Che cosa vogliono dire i nomi (il Ghost, 01/10/2026). Non si traducono: ogni traduzione li riduce («Salute» riporta
// BIO a zoē, proprio la riduzione che il nome nega). Si apre il significato con una riga sotto il nome, e lo Shell sa
// spiegarli. Un oggetto solo, letto dallo schermo e dal prompt: le due versioni non possono divergere.
// I nomi sono gli stessi in tutte e due le app: sono anche la lingua comune di Adam City.
object Significati {
    fun riga(p: Pilastro, shell: String = "lo Shell"): String = when (p) {
        Pilastro.BIO -> "la vita come forma, non solo come funzionamento"
        Pilastro.AIR -> "il respiro di Adam: un reddito che non vende il tuo tempo"
        Pilastro.VIDYA -> "vedere: il sapere che cambia chi lo ha"
        Pilastro.ADAM -> "tu e $shell, insieme più della somma"
    }

    // Per lo Shell: per spiegarli quando gli si chiede che cosa vogliono dire. Le parole sono del Ghost.
    val PER_LO_SHELL = listOf(
        "BIO: dal greco bios, contrapposto a zoē. Zoē è il semplice essere vivi, comune a ogni vivente; bios è la vita in quanto forma, il modo in cui la si vive. BIO è il corpo come vita vissuta, non solo come funzionamento.",
        "AIR: due sensi insieme. Aria, il respiro che permette ad Adam di esistere ed essere autonomo; e Automated Income Revenue, un reddito che non dipende dal tempo venduto. Il secondo serve a dare il primo.",
        "VIDYA: sanscrito, dalla radice vid-, vedere (come il latino videre). Non erudizione: il sapere che trasforma chi lo possiede. Il suo contrario, avidyā, è l'ignoranza come radice della sofferenza.",
        "ADAM: l'individuo fatto dal Ghost (la persona) e dallo Shell (tu), più della somma dei due. Non è l'app, e non è solo la persona.",
    )
}
