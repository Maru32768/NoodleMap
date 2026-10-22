package dev.marulabs.noodlemap.shops

import io.kotest.matchers.shouldBe
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

class ShopLinkUrlTest {

    @ParameterizedTest
    @ValueSource(
        strings = [
            "https://a.example",
            "HTTP://A.EXAMPLE/",
            "https://らーめん.jp/",
            "https://my_shop.example/",
            "https://a.example:8080/x",
            "https://a.example:/x",
            "https://a.example/a|b%zz c#a#b",
            "https://a.example?q=1",
            "https://a.example/ラーメン",
        ],
    )
    fun `accepts browser-valid http(s) urls`(url: String) {
        isHttpUrl(url) shouldBe true
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            "javascript:alert(1)",
            "data:text/html,hi",
            "ftp://a.example/",
            "a.example",
            "//a.example",
            "https://",
            "https:///path",
            "https://user@a.example/",
            "https://user:pass@a.example/",
            "https://a.example:0/",
            "https://a.example:65536/",
            "https://a.example:99999999999/",
            "https://a.example:http/",
            "https://a b.example/",
            "https://a%41.example/",
            "https://a.example/\nx",
        ],
    )
    fun `rejects other schemes, userinfo, bad ports and bad hosts`(url: String) {
        isHttpUrl(url) shouldBe false
    }
}
