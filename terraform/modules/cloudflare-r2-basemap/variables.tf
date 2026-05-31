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
  description = "R2 bucket name for basemap archives."
  default     = "noodle-map-basemap"
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
  description = "Public custom domain attached to the R2 bucket."
  default     = "tiles.noodle-map.marulabs.dev"
}

variable "allowed_origins" {
  type        = list(string)
  description = "Browser origins allowed to fetch PMTiles from the R2 custom domain."
  default = [
    "https://noodle-map.marulabs.dev",
  ]
}

variable "pmtiles_object_key" {
  type        = string
  description = "Default PMTiles object key used only for the Terraform output."
  default     = "maps/japan-light-20251201-v1.pmtiles"
}
