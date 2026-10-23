package dev.marulabs.noodlemap.visits

import dev.marulabs.noodlemap.db.FindAllVisitSummaries
import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.errors.FieldError
import dev.marulabs.noodlemap.errors.FieldErrorType
import dev.marulabs.noodlemap.generated.models.VisitLogInput
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Test

class VisitsTest {

    private val shop = UUID.randomUUID()

    private fun row(visitedOn: String?, rate: Double?, createdAt: String, id: UUID = UUID.randomUUID()) =
        FindAllVisitSummaries(id, shop, visitedOn, rate, createdAt)

    private val order = latestFirst<FindAllVisitSummaries>({ it.visited_on }, { it.created_at }, { it.id })

    @Test
    fun `latest order puts dated visits first, newest date first, then the most recently created`() {
        val rows = listOf(
            row(null, 1.0, "2025-01-01 00:00:00.000"),
            row("2024-01-01", 2.0, "2020-01-01 00:00:00.000"),
            row(null, 3.0, "2026-01-01 00:00:00.000"),
            row("2024-01-01", 4.0, "2021-01-01 00:00:00.000"),
            row("2025-06-30", 5.0, "2019-01-01 00:00:00.000"),
            row(null, 6.0, "2025-01-01 00:00:00.001"),
        )

        rows.sortedWith(order).map { it.rate } shouldBe listOf(5.0, 4.0, 2.0, 3.0, 6.0, 1.0)
    }

    @Test
    fun `exact ties are broken by id, whatever order the rows come in`() {
        val low = row(null, 1.0, "2025-01-01 00:00:00.000", UUID.fromString("00000000-0000-4000-8000-000000000001"))
        val high = row(null, 2.0, "2025-01-01 00:00:00.000", UUID.fromString("00000000-0000-4000-8000-000000000002"))

        listOf(low, high).sortedWith(order) shouldBe listOf(high, low)
        listOf(high, low).sortedWith(order) shouldBe listOf(high, low)
        summarize(listOf(low, high)).rate shouldBe 2.0
        summarize(listOf(high, low)).rate shouldBe 2.0
    }

    @Test
    fun `summary counts every visit and takes the rate of the latest rated one`() {
        summarize(emptyList()) shouldBe VisitSummary(0, null)
        summarize(emptyList()).eaten shouldBe false
        val rows = listOf(
            row("2025-01-01", null, "2025-01-01 00:00:00.000"),
            row(null, 90.0, "2026-01-01 00:00:00.000"),
            row("2024-01-01", 0.0, "2024-01-01 00:00:00.000"),
        )

        summarize(rows) shouldBe VisitSummary(3, 0.0)
        summarize(rows).eaten shouldBe true
        summarize(rows.take(1)) shouldBe VisitSummary(1, null)
    }

    private val today = LocalDate.of(2026, 10, 23)

    private fun errorsOf(input: VisitLogInput): List<FieldError> =
        shouldThrow<DomainException.InvalidRequestWithFields> { normalizeVisit(input, today) }.fieldErrors

    @Test
    fun `a visit date may be at most tomorrow`() {
        normalizeVisit(VisitLogInput(visitedOn = " 2026-10-24 ", isLimitedMenu = false), today).visitedOn shouldBe "2026-10-24"
        errorsOf(VisitLogInput(visitedOn = "2026-10-25", isLimitedMenu = false)) shouldBe
            listOf(FieldError("visitedOn", FieldErrorType.OUT_OF_RANGE))
    }

    @Test
    fun `lengths are counted in characters, not UTF-16 units`() {
        // 𩸽 (hokke) is one character but two UTF-16 units.
        normalizeVisit(VisitLogInput(menuName = "𩸽".repeat(200), isLimitedMenu = false), today).menuName shouldBe "𩸽".repeat(200)
        errorsOf(VisitLogInput(menuName = "𩸽".repeat(201), isLimitedMenu = false)) shouldBe
            listOf(FieldError("menuName", FieldErrorType.TOO_LONG))
    }
}
