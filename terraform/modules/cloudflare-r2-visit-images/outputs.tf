output "bucket_name" {
  value = cloudflare_r2_bucket.visit_images.name
}

output "public_base_url" {
  value = "https://${cloudflare_r2_custom_domain.visit_images.domain}"
}
