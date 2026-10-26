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
        eaten = true, rate = 70.0, favorite = false, mealRecordCount = 3, category = CategorySlug.RAMEN, tags = listOf(tag), links = emptyList(),
    )

    private fun hash(s: Shop, day: LocalDate = today) = OgCard.of(s, null, day).hash()

    @Test
    fun `card reflects the shop`() {
        val card = OgCard.of(shop.copy(openedAt = "2026-06-01"), null, today)
        card.statuses.map { it.label } shouldBe listOf("食べた", "新店")
        card.hearts shouldBe 3.5
        card.mealRecordCountLabel shouldBe "3回訪問"
        card.area shouldBe "東京都新宿区"
        card.description() shouldBe "ラーメン・家系・食べた・新店・3回訪問・東京都新宿区"
        val wish = shop.copy(eaten = false, rate = 0.0, mealRecordCount = 0, wishLevel = "high", category = CategorySlug.UDON)
        OgCard.of(wish, null, today).let {
            it.category shouldBe "うどん"
            // The 気になる度 replaces the plain 気になる status.
            it.statuses.map { s -> s.label } shouldBe listOf("絶対行きたい")
            it.hearts shouldBe 0.0
            it.mealRecordCountLabel shouldBe null
            it.description() shouldBe "うどん・家系・絶対行きたい・東京都新宿区"
        }
        fun status(s: Shop) = OgCard.of(s, null, today).statuses.first().label
        status(wish.copy(wishLevel = "medium")) shouldBe "気になる"
        OgCard.of(wish.copy(wishLevel = "medium"), null, today).description() shouldBe "うどん・家系・気になる・東京都新宿区"
        status(wish.copy(wishLevel = "low")) shouldBe "ちょっと気になる"
        status(wish.copy(wishLevel = null)) shouldBe "気になる"
        // 気になる度 only means something before the shop is eaten.
        status(shop.copy(wishLevel = "high")) shouldBe "食べた"
    }

    @Test
    fun `hash is stable for the same render inputs`() {
        hash(shop) shouldBe hash(shop.copy())
        hash(shop).length shouldBe 16
        // Inputs the image does not show do not change it.
        hash(shop) shouldBe hash(shop.copy(lat = 1.0, nameKana = "めんや", postalCode = "000-0000", address = "東京都新宿区歌舞伎町"))
        // Rates drawn with the same hearts (70 and 79 are both 3.5) keep the hash.
        hash(shop) shouldBe hash(shop.copy(rate = 79.0))
        // 気になる度 is not drawn for an eaten shop.
        hash(shop) shouldBe hash(shop.copy(wishLevel = "high"))
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
            shop.copy(mealRecordCount = 4),
        ).forEach { hash(it) shouldNotBe base }
        val wish = shop.copy(eaten = false, rate = 0.0, mealRecordCount = 0)
        listOf(wish.copy(wishLevel = "low"), wish.copy(wishLevel = "high"), wish).map { hash(it) }.toSet().size shouldBe 3
        // Medium is drawn as the plain 気になる, so it shares the unset shop's image.
        hash(wish.copy(wishLevel = "medium")) shouldBe hash(wish)
    }

    @Test
    fun `hash changes when the cover photo changes`() {
        fun hash(coverPhotoKey: String?) = OgCard.of(shop, coverPhotoKey, today).hash()
        val first = "meal-records/0f8e5d0c-1111-4222-8333-444455556666/11111111-1111-4111-8111-111111111111.jpg"
        val second = "meal-records/0f8e5d0c-1111-4222-8333-444455556666/22222222-2222-4222-8222-222222222222.jpg"
        hash(first) shouldBe hash(first)
        setOf(hash(null), hash(first), hash(second)).size shouldBe 3
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
            "東京都東村山市本町1-2-3" to "東京都東村山市",
            "東京都武蔵村山市本町1-1-1" to "東京都武蔵村山市",
            "東京都羽村市緑ヶ丘5-2-1" to "東京都羽村市",
            "長野県大町市大町3887" to "長野県大町市",
            "新潟県十日町市千歳町3-3" to "新潟県十日町市",
            "奈良県大和郡山市北郡山町248-4" to "奈良県大和郡山市",
            "三重県四日市市諏訪町1-5" to "三重県四日市市",
            "広島県廿日市市下平良1-11-1" to "広島県廿日市市",
            "東京都新宿区市谷本村町5-1" to "東京都新宿区",
            "福岡県北九州市小倉北区城内1-1" to "福岡県北九州市小倉北区",
            "千葉県市川市市川1-1-1" to "千葉県市川市",
            "宮城県柴田郡村田町村田" to "宮城県柴田郡村田町",
            "北海道ニセコ町富士見" to "北海道ニセコ町",
            "北海道余市郡余市町黒川町1-1" to "北海道余市郡余市町",
            "富山県中新川郡上市町法音寺1" to "富山県中新川郡上市町",
            "栃木県芳賀郡市貝町市塙1280" to "栃木県芳賀郡市貝町",
            "奈良県大和郡山市筒井町800" to "奈良県大和郡山市",
            "愛知県名古屋市中村区名駅1-1-4" to "愛知県名古屋市中村区",
            "Tokyo" to "",
            "" to "",
        ).forEach { (address, area) -> areaOf(address) shouldBe area }
    }
}
