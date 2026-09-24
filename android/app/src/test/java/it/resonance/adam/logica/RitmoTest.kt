package it.resonance.adam.logica

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.DayOfWeek
import java.time.LocalDateTime
import java.time.LocalTime

class RitmoTest {
    private val ora = LocalDateTime.of(2026, 9, 23, 8, 0) // mercoledì

    @Test fun orarioGiaPassatoVaADomani() {
        assertEquals(LocalDateTime.of(2026, 9, 24, 7, 30), Ritmo.prossimo(ora, LocalTime.of(7, 30)))
    }

    @Test fun orarioAncoraDaVenireEOggi() {
        assertEquals(LocalDateTime.of(2026, 9, 23, 21, 30), Ritmo.prossimo(ora, LocalTime.of(21, 30)))
    }

    @Test fun settimanaleCadeSulGiornoGiusto() {
        assertEquals(LocalDateTime.of(2026, 9, 27, 18, 0), Ritmo.prossimo(ora, LocalTime.of(18, 0), DayOfWeek.SUNDAY))
    }

    @Test fun orarioStortoUsaIlPredefinito() {
        assertEquals(LocalTime.of(7, 30), Ritmo.leggiOrario("sette", LocalTime.of(7, 30)))
        assertEquals(LocalTime.of(6, 5), Ritmo.leggiOrario("6:05", LocalTime.of(7, 30)))
    }

    @Test fun ilRegistroTieneLeUltimeRigheInCima() {
        var r = ""
        (1..10).forEach { r = Ritmo.annota(r, "riga $it") }
        val righe = r.lines()
        assertEquals(Ritmo.RIGHE_REGISTRO, righe.size)
        assertEquals("riga 10", righe.first())
        assertEquals("gio 24/9 21:31 · Sera: arrivato", Ritmo.riga(Battito.SERA, LocalDateTime.of(2026, 9, 24, 21, 31), "arrivato"))
    }
}
