output "bucket_name" {
  value = cloudflare_r2_bucket.basemap.name
}

output "custom_domain" {
  value = cloudflare_r2_custom_domain.basemap.domain
}

output "pmtiles_url" {
  value = "https://${cloudflare_r2_custom_domain.basemap.domain}/${var.pmtiles_object_key}"
}
