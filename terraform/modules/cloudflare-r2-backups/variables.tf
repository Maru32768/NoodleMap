variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID that owns the private backup bucket."
}

variable "bucket_name" {
  type        = string
  description = "Private R2 bucket for database backups (BACKUP_R2_BUCKET)."
  default     = "noodle-map-backups"
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
