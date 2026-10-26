output "bucket_name" {
  value = cloudflare_r2_bucket.meal_record_images.name
}

output "public_base_url" {
  value = "https://${cloudflare_r2_custom_domain.meal_record_images.domain}"
}
