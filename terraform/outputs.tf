output "basemap_bucket_name" {
  value = module.basemap_r2.bucket_name
}

output "basemap_custom_domain" {
  value = module.basemap_r2.custom_domain
}

output "basemap_pmtiles_url" {
  value = module.basemap_r2.pmtiles_url
}

output "og_images_bucket_name" {
  value = module.og_images_r2.bucket_name
}

output "og_images_public_base_url" {
  value = module.og_images_r2.public_base_url
}

output "visit_images_bucket_name" {
  value = module.visit_images_r2.bucket_name
}

output "visit_images_public_base_url" {
  value = module.visit_images_r2.public_base_url
}
