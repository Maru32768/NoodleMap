# Migrate existing records and images

Stop writes while changing the backend, image storage, and database. The new API uses
`/api/v1/auth/meal-records`, and the frontend must be released with the backend.

## Prepare R2 images

The new bucket `noodle-map-meal-record-images` already exists in APAC with Standard storage.
It is already imported into Terraform state. The old bucket remains available for recovery.

Run the copy utility from the repository root with `CLOUDFLARE_API_TOKEN` available.
The Cloudflare token needs Account Workers R2 Storage Read and Write permissions.
This bearer token is separate from the backend's R2 S3 credentials. The command without
`--apply` only reports the planned copies.

```powershell
mise exec -- node scripts/migrate-meal-record-images.mjs --account-id 27f0188849b71a6222f1aa078299a54a --report .audit/meal-record-images-plan.json
mise exec -- node scripts/migrate-meal-record-images.mjs --account-id 27f0188849b71a6222f1aa078299a54a --apply --report .audit/meal-record-images-copy.json
mise exec -- node scripts/migrate-meal-record-images.mjs --account-id 27f0188849b71a6222f1aa078299a54a --verify --report .audit/meal-record-images-verified.json
```

The utility verifies bytes and metadata in the destination bucket. Each source image
gets both its original `visits/` key and a new `meal-records/` key, so cached URLs
continue to work after the domain moves. It never deletes source objects or overwrites
different destination objects. A partial copy can be run again.
Deleting an image through the new backend removes both keys from the new bucket.
The recovery bucket remains untouched.

## Switch the backend and public domain

1. Verify the new bucket with the command above after writes stop.
2. Back up SQLite and the current backend environment before starting the new server.
3. Scope the shared application R2 credentials to include `noodle-map-meal-record-images`,
   `noodle-map-og-images`, and `noodle-map-backups`. Keep Terraform state credentials separate.
4. Replace `VISIT_IMAGES_R2_BUCKET` with
   `MEAL_RECORD_IMAGES_R2_BUCKET=noodle-map-meal-record-images`.
5. Replace `VISIT_IMAGES_R2_PUBLIC_BASE_URL` with
   `MEAL_RECORD_IMAGES_R2_PUBLIC_BASE_URL=https://images.noodle-map.marulabs.dev`.
6. Run `terraform plan` from `terraform/`. Confirm the old bucket is forgotten without
   destruction, the new bucket is already managed, and only the image domain changes buckets.
   Apply this plan during the backend cutover, after the image verification succeeds.
7. Start the new backend and release the matching frontend. Migration `00017` renames
   tables and columns in one transaction and rewrites image keys without changing IDs,
   associations, menu order, captions, or timestamps.
8. Open an existing record image, its shop cover image, and an old cached image URL.
   Upload, reorder, and delete a new image to verify the application's R2 permissions.

To adopt the bucket in Terraform state before the cutover, use the import command.
This changes Terraform state without moving the image custom domain. A targeted plan
cannot isolate the bucket while the domain address has a pending move.

```powershell
terraform import module.meal_record_images_r2.cloudflare_r2_bucket.meal_record_images 27f0188849b71a6222f1aa078299a54a/noodle-map-meal-record-images/default
```

Terraform's `removed` block retains the old bucket and its objects. The new bucket has
`prevent_destroy`. Do not delete the old bucket as part of this migration.

## Migrate local development images

The local store copies JPEGs from `visit-images/visits/<record-id>/<image-id>.jpg`
next to SQLite into `meal-record-images/meal-records/<record-id>/<image-id>.jpg`
before serving requests. Copies use temporary files and atomic moves. Existing copies
must match their sources byte for byte. The server refuses conflicting copies and
symbolic links. Restarting after interruption resumes the migration.
After every copy succeeds, an atomic completion marker prevents future restarts from
restoring images that the application has since deleted.

Keep the old image directory with the SQLite backup until the migrated records and
images have been checked. Old directories are never deleted automatically.

## Restore the previous version

Keep writes stopped. Restore the pre-migration SQLite backup and previous backend
environment, reconnect the image custom domain to the old bucket, and restore the
matching frontend and backend versions. Migration `00017` has no automatic down migration.
After writes resume on the new version, take a new backup before planning any rollback.
