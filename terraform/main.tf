terraform {
  required_version = ">= 1.15.5"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.19"
    }
  }
}

provider "cloudflare" {}

module "basemap_r2" {
  source = "./modules/cloudflare-r2-basemap"

  cloudflare_account_id = "27f0188849b71a6222f1aa078299a54a"
  cloudflare_zone_id    = "724b74db75b1a43f6253f8a50d384a26"
}

module "og_images_r2" {
  source = "./modules/cloudflare-r2-og-images"

  cloudflare_account_id = "27f0188849b71a6222f1aa078299a54a"
  cloudflare_zone_id    = "724b74db75b1a43f6253f8a50d384a26"
}

module "meal_record_images_r2" {
  source = "./modules/cloudflare-r2-meal-record-images"

  cloudflare_account_id = "27f0188849b71a6222f1aa078299a54a"
  cloudflare_zone_id    = "724b74db75b1a43f6253f8a50d384a26"
}

removed {
  from = module.visit_images_r2.cloudflare_r2_bucket.visit_images
  lifecycle {
    destroy = false
  }
}

import {
  to = module.meal_record_images_r2.cloudflare_r2_bucket.meal_record_images
  id = "27f0188849b71a6222f1aa078299a54a/noodle-map-meal-record-images/default"
}

moved {
  from = module.visit_images_r2.cloudflare_r2_custom_domain.visit_images
  to   = module.meal_record_images_r2.cloudflare_r2_custom_domain.meal_record_images
}

module "backups_r2" {
  source = "./modules/cloudflare-r2-backups"

  cloudflare_account_id = "27f0188849b71a6222f1aa078299a54a"
}
