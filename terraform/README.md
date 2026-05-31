# Noodle Map Terraform

This root module manages Cloudflare resources used by Noodle Map.

## Setup

Create a Cloudflare API token with these permissions:

- Account: Workers R2 Storage Read
- Account: Workers R2 Storage Write
- Zone: DNS Read

Set the token in your shell:

```powershell
$env:CLOUDFLARE_API_TOKEN="..."
```

Create the Terraform state bucket once before the first `terraform init`.
This bootstrap bucket is not managed by this root module.

```powershell
npx wrangler r2 bucket create noodle-map-terraform-state
```

Edit these fixed values before the first apply:

- `backend.tf`: replace the R2 backend endpoint account ID.
- `main.tf`: replace `cloudflare_account_id` and `cloudflare_zone_id`.

Set R2 S3 credentials for the Terraform backend:

```powershell
$env:AWS_ACCESS_KEY_ID="..."
$env:AWS_SECRET_ACCESS_KEY="..."
$env:AWS_REQUEST_CHECKSUM_CALCULATION="when_required"
$env:AWS_RESPONSE_CHECKSUM_VALIDATION="when_required"
```

## Apply

```powershell
terraform init
terraform plan
terraform apply
```

## Upload PMTiles

Generate and upload the basemap:

```bash
cd ../web
npm run basemap:extract
npm run basemap:upload:r2
```

Then set the frontend environment variable:

```env
VITE_BASEMAP_PMTILES_URL=https://tiles.noodle-map.marulabs.dev/maps/japan-light-20251201-v1.pmtiles
```

By default, the generate/upload scripts derive the object name from the
Protomaps source build date, for example `maps/japan-light-20251201-v1.pmtiles`.
Use a new object name for updates because the object is served with long-lived
immutable caching.
