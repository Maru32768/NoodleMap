resource "cloudflare_r2_bucket" "visit_images" {
  account_id    = var.cloudflare_account_id
  name          = var.bucket_name
  location      = var.bucket_location
  storage_class = "Standard"
}

# Browsers load the images with plain <img> requests, so no CORS rules are needed.
resource "cloudflare_r2_custom_domain" "visit_images" {
  account_id  = var.cloudflare_account_id
  zone_id     = var.cloudflare_zone_id
  bucket_name = cloudflare_r2_bucket.visit_images.name
  domain      = var.custom_domain
  enabled     = true
  min_tls     = "1.2"
}
