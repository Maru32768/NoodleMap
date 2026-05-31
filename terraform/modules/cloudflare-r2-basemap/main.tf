resource "cloudflare_r2_bucket" "basemap" {
  account_id    = var.cloudflare_account_id
  name          = var.bucket_name
  location      = var.bucket_location
  storage_class = "Standard"
}

resource "cloudflare_r2_bucket_cors" "basemap" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.basemap.name

  rules = [
    {
      id = "Allow noodle-map basemap reads"
      allowed = {
        methods = ["GET", "HEAD"]
        origins = var.allowed_origins
        headers = ["Range"]
      }
      expose_headers = [
        "Accept-Ranges",
        "Cache-Control",
        "Content-Length",
        "Content-Range",
        "ETag",
      ]
      max_age_seconds = 7200
    },
  ]
}

resource "cloudflare_r2_custom_domain" "basemap" {
  account_id  = var.cloudflare_account_id
  zone_id     = var.cloudflare_zone_id
  bucket_name = cloudflare_r2_bucket.basemap.name
  domain      = var.custom_domain
  enabled     = true
  min_tls     = "1.2"
}
