# Database snapshots contain private application data. Do not attach a public domain.
resource "cloudflare_r2_bucket" "backups" {
  account_id    = var.cloudflare_account_id
  name          = var.bucket_name
  location      = var.bucket_location
  storage_class = "Standard"
}
