output "bucket_name" {
  value = cloudflare_r2_bucket.og_images.name
}

output "public_base_url" {
  value = "https://${cloudflare_r2_custom_domain.og_images.domain}"
}
