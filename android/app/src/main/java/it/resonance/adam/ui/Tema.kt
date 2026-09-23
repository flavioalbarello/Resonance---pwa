package it.resonance.adam.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import it.resonance.adam.dati.Pilastro

object Colori {
    val fondo = Color(0xFFFAF9F4)
    val fondo2 = Color(0xFFF0EEE3)
    val superficie = Color(0xFFFFFFFF)
    val inchiostro = Color(0xFF1C1B15)
    val tenue = Color(0xFF6E6A5C)
    val linea = Color(0x1A1C1B15)
    val bio = Color(0xFF12B76A)
    val air = Color(0xFF4F6BFF)
    val vidya = Color(0xFFE8672B)
    val ambra = Color(0xFFFFB020)
    val ambraInchiostro = Color(0xFF2A1A02)
    val allarme = Color(0xFFB4553A)
    val allarmeFondo = Color(0xFFF6E4DE)

    fun di(p: Pilastro) = when (p) { Pilastro.BIO -> bio; Pilastro.AIR -> air; Pilastro.VIDYA -> vidya; Pilastro.ADAM -> ambra }
}

@Composable
fun TemaResonance(contenuto: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Colori.ambra, onPrimary = Colori.ambraInchiostro,
            secondary = Colori.air, tertiary = Colori.vidya,
            background = Colori.fondo, onBackground = Colori.inchiostro,
            surface = Colori.superficie, onSurface = Colori.inchiostro,
            surfaceVariant = Colori.fondo2, onSurfaceVariant = Colori.tenue,
            error = Colori.allarme,
        ),
        content = contenuto,
    )
}
