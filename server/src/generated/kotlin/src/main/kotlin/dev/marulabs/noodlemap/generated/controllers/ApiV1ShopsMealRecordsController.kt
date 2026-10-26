package dev.marulabs.noodlemap.generated.controllers

import dev.marulabs.noodlemap.generated.models.MealRecordsResponse
import io.ktor.http.Headers
import io.ktor.http.Parameters
import io.ktor.server.application.call
import io.ktor.server.plugins.BadRequestException
import io.ktor.server.plugins.MissingRequestParameterException
import io.ktor.server.plugins.ParameterConversionException
import io.ktor.server.routing.Route
import io.ktor.server.routing.`get`
import io.ktor.util.converters.ConversionService
import io.ktor.util.converters.DefaultConversionService
import io.ktor.util.reflect.typeInfo
import kotlin.Any
import kotlin.String

public interface ApiV1ShopsMealRecordsController {
  /**
   * A shop's meal records, newest first. privateNote is included only for the admin.
   *
   * Route is expected to respond with
   * [dev.marulabs.noodlemap.generated.models.MealRecordsResponse].
   * Use [dev.marulabs.noodlemap.generated.controllers.TypedApplicationCall.respondTyped] to send
   * the response.
   *
   * @param id 
   * @param call Decorated ApplicationCall with additional typed respond methods
   */
  public suspend fun listMealRecords(id: String, call: TypedApplicationCall<MealRecordsResponse>)

  public companion object {
    /**
     * Mounts all routes for the ApiV1ShopsMealRecords resource
     *
     * - GET /api/v1/shops/{id}/meal-records A shop's meal records, newest first. privateNote is
     * included only for the admin.
     */
    public fun Route.apiV1ShopsMealRecordsRoutes(controller: ApiV1ShopsMealRecordsController) {
      `get`("/api/v1/shops/{id}/meal-records") {
        val id = call.parameters.getTypedOrFail<kotlin.String>("id")
        controller.listMealRecords(id, TypedApplicationCall(call))
      }
    }

    /**
     * Gets parameter value associated with this name or null if the name is not present.
     * Converting to type R using ConversionService.
     *
     * Throws:
     *   ParameterConversionException - when conversion from String to R fails
     */
    private inline fun <reified R : Any> Parameters.getTyped(name: String,
        conversionService: ConversionService = DefaultConversionService): R? {
      val values = getAll(name) ?: return null
      val typeInfo = typeInfo<R>()
      return try {
          @Suppress("UNCHECKED_CAST")
          conversionService.fromValues(values, typeInfo) as R
      } catch (cause: Exception) {
          throw ParameterConversionException(name, typeInfo.type.simpleName ?:
          typeInfo.type.toString(), cause)
      }
    }

    /**
     * Gets parameter value associated with this name or throws if the name is not present.
     * Converting to type R using ConversionService.
     *
     * Throws:
     *   MissingRequestParameterException - when parameter is missing
     *   ParameterConversionException - when conversion from String to R fails
     */
    private inline fun <reified R : Any> Parameters.getTypedOrFail(name: String,
        conversionService: ConversionService = DefaultConversionService): R {
      val values = getAll(name) ?: throw MissingRequestParameterException(name)
      val typeInfo = typeInfo<R>()
      return try {
          @Suppress("UNCHECKED_CAST")
          conversionService.fromValues(values, typeInfo) as R
      } catch (cause: Exception) {
          throw ParameterConversionException(name, typeInfo.type.simpleName ?:
          typeInfo.type.toString(), cause)
      }
    }

    /**
     * Gets first value from the list of values associated with a name.
     *
     * Throws:
     *   BadRequestException - when the name is not present
     */
    private fun Headers.getOrFail(name: String): String = this[name] ?: throw
        BadRequestException("Header " + name + " is required")
  }
}
