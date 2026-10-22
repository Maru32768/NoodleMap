package dev.marulabs.noodlemap.og

import dev.marulabs.noodlemap.generated.models.CategorySlug
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.generated.models.Tag
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import java.time.LocalDate
import org.junit.jupiter.api.Test

class OgCardTest {

    private val today = LocalDate.of(2026, 10, 23)
    private val tag = Tag(id = "t1", label = "家系", slug = "iekei", color = "#8c2e21", sortOrder = 0)
    private val shop = Shop(
        id = "0f8e5d0c-1111-4222-8333-444455556666", name = "麺屋", lat = 35.0, lng = 139.0,
        postalCode = "160-0023", address = "日本、〒160-0023 東京都新宿区西新宿1-1", googlePlaceId = "p",
        eaten = true, rate = 70.0, favorite = false, category = CategorySlug.RAMEN, tags = listOf(tag),
    )

    private fun hash(s: Shop, day: LocalDate = today) = OgCard.of(s, day).hash()

    @Test
    fun `card reflects the shop`() {
        val card = OgCard.of(shop.copy(openedAt = "2026-06-01"), today)
        card.statuses.map { it.label } shouldBe listOf("食べた", "新店")
        card.hearts shouldBe 3.5
        card.area shouldBe "東京都新宿区"
        card.description() shouldBe "ラーメン・家系・食べた・新店・東京都新宿区"
        OgCard.of(shop.copy(eaten = false, rate = 0.0, category = CategorySlug.UDON), today).let {
            it.category shouldBe "うどん"
            it.statuses.map { s -> s.label } shouldBe listOf("気になる")
            it.hearts shouldBe 0.0
        }
    }

    @Test
    fun `hash is stable for the same render inputs`() {
        hash(shop) shouldBe hash(shop.copy())
        hash(shop).length shouldBe 16
        // Inputs the image does not show do not change it.
        hash(shop) shouldBe hash(shop.copy(lat = 1.0, nameKana = "めんや", postalCode = "000-0000", address = "東京都新宿区歌舞伎町"))
        // A later day with the same derived statuses keeps the hash.
        hash(shop, today.plusDays(30)) shouldBe hash(shop)
    }

    @Test
    fun `hash changes with every rendered input`() {
        val base = hash(shop)
        listOf(
            shop.copy(name = "麺屋2"),
            shop.copy(category = CategorySlug.UDON),
            shop.copy(eaten = false),
            shop.copy(rate = 90.0),
            shop.copy(tags = listOf(tag.copy(color = "#000000"))),
            shop.copy(tags = emptyList()),
            shop.copy(address = "大阪府大阪市北区梅田1-1"),
            shop.copy(closedAt = "2026-10-01"),
        ).forEach { hash(it) shouldNotBe base }
    }

    @Test
    fun `hash changes when a date-derived status changes`() {
        val opened = shop.copy(openedAt = "2025-10-23")
        // 新店 for 365 days after opening, then a regular shop.
        hash(opened, today) shouldNotBe hash(opened, today.plusDays(1))
        // 閉店予定 becomes 閉店 on the closing day.
        val closing = shop.copy(closedAt = "2026-11-01")
        hash(closing, LocalDate.of(2026, 10, 31)) shouldNotBe hash(closing, LocalDate.of(2026, 11, 1))
    }

    @Test
    fun `lifecycle chips mirror the web status rules`() {
        fun labels(opened: String?, closed: String?) = lifecycleChips(opened, closed, today).map { it.label }
        labels(null, null) shouldBe emptyList()
        labels("2026-12-01", null) shouldBe listOf("開店予定")
        labels("2026-12-01", "2027-01-01") shouldBe listOf("開店予定")
        labels(null, "2026-12-01") shouldBe listOf("閉店予定")
        labels("2026-10-01", "2026-12-01") shouldBe listOf("新店", "閉店予定")
        labels("2026-10-01", "2026-10-23") shouldBe listOf("閉店")
        labels("2020-01-01", null) shouldBe emptyList()
        labels("bad", "also bad") shouldBe emptyList()
    }

    @Test
    fun `area is prefecture plus municipality`() {
        mapOf(
            "東京都新宿区西新宿2-8-1" to "東京都新宿区",
            "日本、〒231-0017 神奈川県横浜市中区港町1丁目1" to "神奈川県横浜市中区",
            "大阪府大阪市北区梅田3-1-1" to "大阪府大阪市北区",
            "京都府京都市下京区東塩小路町" to "京都府京都市下京区",
            "北海道札幌市中央区北1条西2丁目" to "北海道札幌市中央区",
            "香川県高松市番町1-8-15" to "香川県高松市",
            "東京都町田市森野2-2-22" to "東京都町田市",
            "千葉県市川市八幡1-1-1" to "千葉県市川市",
            "北海道虻田郡ニセコ町字富士見" to "北海道虻田郡ニセコ町",
            "鹿児島県鹿児島市山下町11-1" to "鹿児島県鹿児島市",
            "Tokyo" to "",
            "" to "",
        ).forEach { (address, area) -> areaOf(address) shouldBe area }
    }
}
