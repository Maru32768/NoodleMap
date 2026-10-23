package dev.marulabs.noodlemap.visits

import dev.marulabs.noodlemap.db.FindAllVisitSummaries
import io.kotest.matchers.shouldBe
import java.util.UUID
import org.junit.jupiter.api.Test

class VisitsTest {

    private val shop = UUID.randomUUID()

    private fun row(visitedOn: String?, rate: Double?, createdAt: String) = FindAllVisitSummaries(shop, visitedOn, rate, createdAt)

    @Test
    fun `latest order puts dated visits first, newest date first, then the most recently created`() {
        val rows = listOf(
            row(null, 1.0, "2025-01-01 00:00:00"),
            row("2024-01-01", 2.0, "2020-01-01 00:00:00"),
            row(null, 3.0, "2026-01-01 00:00:00"),
            row("2024-01-01", 4.0, "2021-01-01 00:00:00"),
            row("2025-06-30", 5.0, "2019-01-01 00:00:00"),
        )

        rows.sortedWith(latestFirst({ it.visited_on }, { it.created_at })).map { it.rate } shouldBe listOf(5.0, 4.0, 2.0, 3.0, 1.0)
    }

    @Test
    fun `ties keep the order the rows were read in`() {
        val rows = listOf(row(null, 1.0, "2025-01-01 00:00:00"), row(null, 2.0, "2025-01-01 00:00:00"))

        rows.sortedWith(latestFirst({ it.visited_on }, { it.created_at })).map { it.rate } shouldBe listOf(1.0, 2.0)
        summarize(rows).rate shouldBe 1.0
    }

    @Test
    fun `summary counts every visit and takes the rate of the latest rated one`() {
        summarize(emptyList()) shouldBe VisitSummary(0, null)
        summarize(emptyList()).eaten shouldBe false
        val rows = listOf(
            row("2025-01-01", null, "2025-01-01 00:00:00"),
            row(null, 90.0, "2026-01-01 00:00:00"),
            row("2024-01-01", 0.0, "2024-01-01 00:00:00"),
        )

        summarize(rows) shouldBe VisitSummary(3, 0.0)
        summarize(rows).eaten shouldBe true
        summarize(rows.take(1)) shouldBe VisitSummary(1, null)
    }
}
