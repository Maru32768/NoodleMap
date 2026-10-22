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
            "http://192.168.0.1:8080/",
            "http://1.2.3.4./",
            "https://shop.123a/",
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
            "https://a.example:+80/",
            "https://a.example:８０/",
            "https://shop.123/",
            "https://shop.１２３/",
            "https://shop.0x1f/",
            "https://1.2.3.256/",
            "https://1.2.3/",
            "https://a b.example/",
            "https://a%41.example/",
            "https://a.example/\nx",
        ],
    )
    fun `rejects other schemes, userinfo, bad ports and bad hosts`(url: String) {
        isHttpUrl(url) shouldBe false
    }
}
