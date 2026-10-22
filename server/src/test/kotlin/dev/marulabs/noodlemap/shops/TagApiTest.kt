package dev.marulabs.noodlemap.shops

import dev.marulabs.noodlemap.addShopRequest
import dev.marulabs.noodlemap.body
import dev.marulabs.noodlemap.encode
import dev.marulabs.noodlemap.errors.ErrorBody
import dev.marulabs.noodlemap.errors.ErrorType
import dev.marulabs.noodlemap.errors.FieldError
import dev.marulabs.noodlemap.errors.FieldErrorType
import dev.marulabs.noodlemap.generated.models.CategorySlug
import dev.marulabs.noodlemap.generated.models.SaveTagsRequest
import dev.marulabs.noodlemap.generated.models.Tag
import dev.marulabs.noodlemap.generated.models.TagInput
import dev.marulabs.noodlemap.generated.models.TagsResponse
import dev.marulabs.noodlemap.postJson
import dev.marulabs.noodlemap.putJson
import dev.marulabs.noodlemap.testApp
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpStatusCode
import org.junit.jupiter.api.Test

class TagApiTest {

    private suspend fun HttpClient.tags(): List<Tag> = get("/api/v1/tags").body<TagsResponse>().tags

    private suspend fun HttpClient.saveTags(token: String, vararg tags: TagInput): HttpResponse =
        putJson("/api/v1/auth/tags", encode(SaveTagsRequest(tags.toList())), token)

    private fun input(slug: String, sortOrder: Int = 0, label: String = slug, id: String? = null, color: String = "#000000") =
        TagInput(id = id, category = CategorySlug.UDON, label = label, slug = slug, color = color, sortOrder = sortOrder)

    @Test
    fun `save creates, updates and deletes tags in one call`() = testApp { t ->
        val res = client.saveTags(
            t.adminToken(),
            input("new-tag", sortOrder = 5, label = "New"),
            input("shoyu-renamed", sortOrder = 1, label = "Shoyu", id = SHOYU).copy(category = null, color = "#ffffff"),
        )

        res.status shouldBe HttpStatusCode.OK
        val saved = res.body<TagsResponse>().tags
        saved.map { it.slug } shouldContainExactly listOf("shoyu-renamed", "new-tag")
        saved[0] shouldBe Tag(id = SHOYU, category = null, label = "Shoyu", slug = "shoyu-renamed", color = "#ffffff", sortOrder = 1)
        saved[1].id shouldNotBe SHOYU
        client.tags() shouldBe saved
    }

    @Test
    fun `tags are ordered by sort order, then label`() = testApp { t ->
        val saved = client.saveTags(
            t.adminToken(),
            input("c", sortOrder = 2, label = "A"),
            input("b", sortOrder = 1, label = "Z"),
            input("a", sortOrder = 1, label = "M"),
        ).body<TagsResponse>().tags

        saved.map { it.slug } shouldContainExactly listOf("a", "b", "c")
    }

    @Test
    fun `duplicate slug is rejected with a field error and nothing changes`() = testApp { t ->
        val before = client.tags()

        val res = client.saveTags(t.adminToken(), input("same"), input("same"))

        res.status shouldBe HttpStatusCode.BadRequest
        res.body<ErrorBody>() shouldBe ErrorBody(ErrorType.INVALID_REQUEST, "duplicate slug", listOf(FieldError("slug", FieldErrorType.DUPLICATE)))
        client.tags() shouldBe before
    }

    @Test
    fun `blank label, slug or color is rejected`() = testApp { t ->
        val admin = t.adminToken()
        val before = client.tags()
        for (bad in listOf(input("ok", label = " "), input(" "), input("ok", color = ""))) {
            val res = client.saveTags(admin, bad)
            res.status shouldBe HttpStatusCode.BadRequest
            res.body<ErrorBody>() shouldBe ErrorBody(ErrorType.INVALID_REQUEST, "invalid tag")
        }
        client.tags() shouldBe before
    }

    @Test
    fun `malformed tag id is an invalid request, not a server error`() = testApp { t ->
        val before = client.tags()

        val res = client.saveTags(t.adminToken(), input("x", id = "not-a-uuid"))

        res.status shouldBe HttpStatusCode.BadRequest
        res.body<ErrorBody>() shouldBe ErrorBody(ErrorType.INVALID_REQUEST, "invalid request")
        client.tags() shouldBe before
    }

    @Test
    fun `deleting a tag removes it from shops`() = testApp { t ->
        val admin = t.adminToken()
        client.postJson("/api/v1/auth/shops", encode(addShopRequest(tagIds = listOf(SHOYU, SHIO))), admin)
        val keepShio = client.tags().single { it.id == SHIO }

        client.saveTags(admin, input(keepShio.slug, keepShio.sortOrder, keepShio.label, keepShio.id)).status shouldBe HttpStatusCode.OK

        client.tags() shouldHaveSize 1
        client.shops().single().tags.map { it.id } shouldContainExactly listOf(SHIO)
    }

    @Test
    fun `non-admin cannot save tags`() = testApp { t ->
        val before = client.tags()

        val res = client.saveTags(t.userToken())

        res.status shouldBe HttpStatusCode.Forbidden
        client.tags() shouldBe before
    }
}
