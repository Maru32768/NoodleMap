resource "cloudflare_workers_script" "og" {
  account_id         = var.cloudflare_account_id
  script_name        = var.script_name
  content            = var.script
  main_module        = "og-worker.js"
  compatibility_date = "2026-10-01"

  bindings = [{
    name = "BACKEND_ORIGIN"
    type = "plain_text"
    text = var.backend_origin
  }]
}

# Routes run only on proxied hostnames: the DNS record for var.hostname must be Proxied.
resource "cloudflare_workers_route" "og" {
  zone_id = var.cloudflare_zone_id
  pattern = "${var.hostname}/search*"
  script  = cloudflare_workers_script.og.script_name
}
