package dev.marulabs.noodlemap.generated.controllers

import dev.marulabs.noodlemap.generated.models.AddShopRequest
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.generated.models.UpdateShopRequest
import io.ktor.http.Headers
import io.ktor.http.Parameters
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.plugins.BadRequestException
import io.ktor.server.plugins.MissingRequestParameterException
import io.ktor.server.plugins.ParameterConversionException
import io.ktor.server.request.receive
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.util.converters.ConversionService
import io.ktor.util.converters.DefaultConversionService
import io.ktor.util.reflect.typeInfo
import kotlin.Any
import kotlin.String

public interface ApiV1AuthShopsController {
  /**
   * Route is expected to respond with [dev.marulabs.noodlemap.generated.models.Shop].
   * Use [dev.marulabs.noodlemap.generated.controllers.TypedApplicationCall.respondTyped] to send
   * the response.
   *
   * @param addShopRequest 
   * @param call Decorated ApplicationCall with additional typed respond methods
   */
  public suspend fun addShop(addShopRequest: AddShopRequest, call: TypedApplicationCall<Shop>)

  /**
   * Route is expected to respond with status 200.
   * Use [io.ktor.server.response.respond] to send the response.
   *
   * @param updateShopRequest 
   * @param id 
   * @param call The Ktor application call
   */
  public suspend fun updateShop(
    id: String,
    updateShopRequest: UpdateShopRequest,
    call: ApplicationCall,
  )

  public companion object {
    /**
     * Mounts all routes for the ApiV1AuthShops resource
     *
     * - POST /api/v1/auth/shops 
     * - PUT /api/v1/auth/shops/{id} 
     */
    public fun Route.apiV1AuthShopsRoutes(controller: ApiV1AuthShopsController) {
      post("/api/v1/auth/shops") {
        val addShopRequest = call.receive<AddShopRequest>()
        controller.addShop(addShopRequest, TypedApplicationCall(call))
      }
      put("/api/v1/auth/shops/{id}") {
        val id = call.parameters.getTypedOrFail<kotlin.String>("id")
        val updateShopRequest = call.receive<UpdateShopRequest>()
        controller.updateShop(id, updateShopRequest, call)
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
