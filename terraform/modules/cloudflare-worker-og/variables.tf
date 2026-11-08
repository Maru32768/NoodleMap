variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID that owns the Worker."
}

variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare zone ID that holds var.hostname."
}

variable "script" {
  type        = string
  description = "The Worker's ES module source (edge/og-worker.js)."
}

variable "script_name" {
  type        = string
  description = "Worker script name."
  default     = "noodle-map-og"
}

variable "hostname" {
  type        = string
  description = "Frontend hostname whose /search pages get shop OGP tags."
  default     = "noodle-map.marulabs.dev"
}

variable "backend_origin" {
  type        = string
  description = "Backend origin that serves /api/v1/og/shops/{id}."
  default     = "https://noodle-map-backend.onrender.com"
}
