terraform {
  backend "s3" {
    bucket = "noodle-map-terraform-state"
    key    = "noodle-map/terraform.tfstate"
    region = "auto"

    endpoints = {
      s3 = "https://27f0188849b71a6222f1aa078299a54a.r2.cloudflarestorage.com"
    }

    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}
