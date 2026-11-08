# Noodle Map Terraform

This root module manages Cloudflare resources used by Noodle Map.

## Setup

Create a Cloudflare API token with these permissions:

- Account: Workers R2 Storage Read
- Account: Workers R2 Storage Write
- Zone: DNS Read
- Account: Workers Scripts Edit
- Zone: Workers Routes Edit (with the zone in Zone Resources)

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

## Shared application R2 connection

Create one R2 API token with Object Read & Write scoped to the three application
buckets: `noodle-map-backups`, `noodle-map-og-images`, and
`noodle-map-meal-record-images`. Exclude `noodle-map-terraform-state`; keep its
`AWS_*` credentials separate. Set the shared connection on the Render backend:

- `R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com` (no bucket suffix)
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` from the application token

Set all three connection values or none. Any enabled R2 feature requires the
shared connection, while each feature below can be enabled independently.
When replacing the old per-feature connection variables, set these shared values
and remove the old `BACKUP_R2_*`, `OG_R2_*`, and `MEAL_RECORD_IMAGES_R2_*` endpoint and
credential variables. Keep the bucket, prefix, and public URL variables below.

## OGP images

`module.og_images_r2` creates the `noodle-map-og-images` bucket served at
`https://og.noodle-map.marulabs.dev`. The backend writes share-card PNGs there
under `og/shops/<id>/<hash>.png`. Set on the Render backend:

- `OG_R2_BUCKET=noodle-map-og-images`
- `OG_R2_PUBLIC_BASE_URL=https://og.noodle-map.marulabs.dev`

Set both feature values or neither; with neither the backend renders each image
on request.

## OGP tags for shared shop URLs

A shop's URL is the search page, `/search?shop=<id>`, which the static site serves
as the same `index.html` for every shop. `module.og_worker` deploys
[`edge/og-worker.js`](../edge/og-worker.js) on the route
`noodle-map.marulabs.dev/search*`. For a request with `shop`, it fetches the shop's
tags from the backend (`GET /api/v1/og/shops/<id>`) and replaces the site's tags in
`index.html` with them. If the shop is unknown, or the backend fails or takes more
than 2 seconds, the page is served unchanged.

Routes run only on proxied hostnames. Do these once in the Cloudflare dashboard,
after Render shows the custom domain's certificate as issued:

1. Set SSL/TLS encryption to Full for the hostname. Render asks for Full; a
   Configuration Rule can set it for `noodle-map.marulabs.dev` only, without
   changing the rest of the zone.
2. Set the `noodle-map.marulabs.dev` CNAME record to Proxied. Render does not
   support IPv6, so the zone must have no AAAA record for the hostname.

Test the Worker with `npm install` and `npm test` from `edge/`. After `terraform
apply`, check it with a request that does not run JavaScript:

```bash
curl -s "https://noodle-map.marulabs.dev/search?shop=<id>" | grep og:title
```

## Database backups

`module.backups_r2` creates the private `noodle-map-backups` bucket. It has no
custom domain; keep its public development URL disabled. Set on the Render backend:

- `BACKUP_R2_BUCKET=noodle-map-backups`
- `BACKUP_R2_PREFIX=db-backup` (optional)

Set the bucket to enable remote backups; without it only the local SQLite
snapshot is written. The prefix can remain configured without a bucket.
A public base URL is never required. Existing S3
objects are not migrated by Terraform or by the application. See
[`sqlite-remote-access.md`](../docs/sqlite-remote-access.md) for manual backups
and restore commands.

## Meal record images

`module.meal_record_images_r2` creates the `noodle-map-meal-record-images` bucket served at
`https://images.noodle-map.marulabs.dev`. The backend stores record photos there as
JPEGs under `meal-records/<meal_record_id>/<image_id>.jpg`. Set on the Render backend:

- `MEAL_RECORD_IMAGES_R2_BUCKET=noodle-map-meal-record-images`
- `MEAL_RECORD_IMAGES_R2_PUBLIC_BASE_URL=https://images.noodle-map.marulabs.dev`

Set both feature values or neither. With neither, an https site boots but refuses image uploads
(503 `meal_record_images_storage_unconfigured`); only an http `PUBLIC_BASE_URL` (local
development, e2e) stores the images on the local disk next to the database.

For existing images, follow [Migrate existing records and images](../docs/migrate-meal-records.md)
before applying the image-domain change. The root module imports the prepared new bucket,
retains the old bucket without destruction, and moves the custom domain only at cutover.
