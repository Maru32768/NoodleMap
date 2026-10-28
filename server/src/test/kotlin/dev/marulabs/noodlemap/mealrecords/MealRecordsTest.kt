package dev.marulabs.noodlemap.mealrecords

import dev.marulabs.noodlemap.errors.DomainException
import dev.marulabs.noodlemap.errors.FieldError
import dev.marulabs.noodlemap.errors.FieldErrorType
import dev.marulabs.noodlemap.generated.models.MenuItem
import dev.marulabs.noodlemap.generated.models.MenuItemInput
import dev.marulabs.noodlemap.generated.models.MealRecordInput
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Test

class MealRecordsTest {

    private val shop = UUID.randomUUID()

    private data class Row(val eatenOn: String?, val rate: Double?, val createdAt: String, val id: UUID)

    private fun row(eatenOn: String?, rate: Double?, createdAt: String, id: UUID = UUID.randomUUID()) =
        Row(eatenOn, rate, createdAt, id)

    private val order = latestFirst<Row>({ it.eatenOn }, { it.createdAt }, { it.id })

    @Test
    fun `latest order puts dated mealRecords first, newest date first, then the most recently created`() {
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
    }

    private val today = LocalDate.of(2026, 10, 23)

    private fun errorsOf(input: MealRecordInput): List<FieldError> =
        shouldThrow<DomainException.InvalidRequestWithFields> { normalizeMealRecord(input, today) }.fieldErrors

    @Test
    fun `a mealRecord date may be at most tomorrow`() {
        normalizeMealRecord(MealRecordInput(shopIds = listOf(shop.toString()), eatenOn = " 2026-10-24 "), today).eatenOn shouldBe "2026-10-24"
        errorsOf(MealRecordInput(shopIds = listOf(shop.toString()), eatenOn = "2026-10-25")) shouldBe
            listOf(FieldError("eatenOn", FieldErrorType.OUT_OF_RANGE))
    }

    @Test
    fun `lengths are counted in characters, not UTF-16 units`() {
        // 𩸽 (hokke) is one character but two UTF-16 units.
        normalizeMealRecord(MealRecordInput(shopIds = listOf(shop.toString()), menuItems = listOf(MenuItemInput("𩸽".repeat(200)))), today).menuItems.single().name shouldBe
            "𩸽".repeat(200)
        errorsOf(MealRecordInput(shopIds = listOf(shop.toString()), menuItems = listOf(MenuItemInput("𩸽".repeat(201))))) shouldBe
            listOf(FieldError("menuItems", FieldErrorType.TOO_LONG, "menuItems[0].name"))
    }

    @Test
    fun `menu names with control characters are rejected before they reach the database`() {
        for (name in listOf("麺\u0000", "\u0000麺", "つけ\n麺", "\u007f")) {
            errorsOf(MealRecordInput(shopIds = listOf(shop.toString()), menuItems = listOf(MenuItemInput("ok"), MenuItemInput(name)))) shouldBe
                listOf(FieldError("menuItems", FieldErrorType.INVALID_FORMAT, "menuItems[1].name"))
        }
    }

    @Test
    fun `the total price sums the priced items and is absent when none has a price`() {
        totalPrice(emptyList()) shouldBe null
        totalPrice(listOf(MenuItem("ラーメン", false))) shouldBe null
        totalPrice(listOf(MenuItem("ラーメン", false, 1000), MenuItem("替え玉", false), MenuItem("限定", true, 0))) shouldBe 1000
        totalPrice(listOf(MenuItem("a", false, 10_000_000), MenuItem("b", false, 10_000_000))) shouldBe 20_000_000
    }
}
