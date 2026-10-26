variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID that owns the R2 bucket."
}

variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare zone ID for the custom domain."
}

variable "bucket_name" {
  type        = string
  description = "R2 bucket name for meal record images (the backend's MEAL_RECORD_IMAGES_R2_BUCKET)."
  default     = "noodle-map-meal-record-images"
}

variable "bucket_location" {
  type        = string
  description = "Best-effort R2 bucket location hint."
  default     = "apac"

  validation {
    condition     = contains(["apac", "eeur", "enam", "weur", "wnam", "oc"], var.bucket_location)
    error_message = "bucket_location must be one of apac, eeur, enam, weur, wnam, or oc."
  }
}

variable "custom_domain" {
  type        = string
  description = "Public custom domain attached to the R2 bucket (the backend's MEAL_RECORD_IMAGES_R2_PUBLIC_BASE_URL)."
  default     = "images.noodle-map.marulabs.dev"
}
