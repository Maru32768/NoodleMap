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
