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

## OGP images

`module.og_images_r2` creates the `noodle-map-og-images` bucket served at
`https://og.noodle-map.marulabs.dev`. The backend writes share-card PNGs there
under `og/shops/<id>/<hash>.png`. Create an R2 API token with Object Read & Write
on that bucket only, then set on the Render backend:

- `OG_R2_BUCKET=noodle-map-og-images`
- `OG_R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com`
- `OG_R2_ACCESS_KEY_ID` / `OG_R2_SECRET_ACCESS_KEY` from the token
- `OG_R2_PUBLIC_BASE_URL=https://og.noodle-map.marulabs.dev`

Set all five or none; with none the backend renders each image on request.

## Visit images

`module.visit_images_r2` creates the `noodle-map-visit-images` bucket served at
`https://images.noodle-map.marulabs.dev`. The backend stores the photos of visit
logs there as JPEGs under `visits/<visit_id>/<image_id>.jpg`. Create an R2 API
token with Object Read & Write on that bucket only, then set on the Render backend:

- `VISIT_IMAGES_R2_BUCKET=noodle-map-visit-images`
- `VISIT_IMAGES_R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com`
- `VISIT_IMAGES_R2_ACCESS_KEY_ID` / `VISIT_IMAGES_R2_SECRET_ACCESS_KEY` from the token
- `VISIT_IMAGES_R2_PUBLIC_BASE_URL=https://images.noodle-map.marulabs.dev`

Set all five or none. With none, an https site boots but refuses image uploads
(503 `visit_images_storage_unconfigured`); only an http `PUBLIC_BASE_URL` (local
development, e2e) stores the images on the local disk next to the database.
