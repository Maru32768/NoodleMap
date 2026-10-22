package dev.marulabs.noodlemap.common

import io.kotest.matchers.shouldBe
import java.time.Instant
import org.junit.jupiter.api.Test

class TimesTest {

    @Test
    fun `ShopDate encode keeps valid ISO dates and drops everything else`() {
        ShopDate.encode("2024-02-29") shouldBe "2024-02-29"
        ShopDate.encode("  2024-01-05\t") shouldBe "2024-01-05"
        listOf(null, "", "   ", "2023-02-29", "2024-1-5", "2024/01/05", "2024-01-05T00:00:00").forEach {
            ShopDate.encode(it) shouldBe null
        }
    }

    @Test
    fun `ShopDate decode reads the calendar date from new and legacy values`() {
        ShopDate.decode("2024-01-05") shouldBe "2024-01-05"
        ShopDate.decode("2024-01-05 00:00:00+09:00") shouldBe "2024-01-05"
        ShopDate.decode(null) shouldBe null
        ShopDate.decode("2024-01") shouldBe null
    }

    @Test
    fun `SessionTime formats instants as sortable UTC text`() {
        SessionTime.format(Instant.parse("2024-01-05T23:59:59.900Z")) shouldBe "2024-01-05 23:59:59"
    }

    @Test
    fun `SessionTime parseOrNull reads stored, legacy, ISO and short values and rejects garbage`() {
        val t = Instant.parse("2024-01-05T23:59:59Z")
        SessionTime.parseOrNull("2024-01-05 23:59:59") shouldBe t
        SessionTime.parseOrNull("2024-01-05 23:59:59.123456 +0000 UTC") shouldBe t
        SessionTime.parseOrNull("2024-01-05T23:59:59Z") shouldBe t
        SessionTime.parseOrNull("2024-01-05 23:59") shouldBe Instant.parse("2024-01-05T23:59:00Z")
        SessionTime.parseOrNull("2024-01-05") shouldBe Instant.parse("2024-01-05T00:00:00Z")
        listOf("", "garbage", "2024-13-45 99:99:99").forEach { SessionTime.parseOrNull(it) shouldBe null }
    }
}
