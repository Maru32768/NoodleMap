package main

const (
	DbPathEnv              = "DB_PATH"
	ServerPortEnv          = "SERVER_PORT"
	GoogleOAuthClientIdEnv = "GOOGLE_OAUTH_CLIENT_ID"
	AdminEmailEnv          = "ADMIN_EMAIL"
	AuthCookieSecureEnv    = "AUTH_COOKIE_SECURE"

	// Optional — omit to disable S3 backup.
	BackupPathEnv = "BACKUP_PATH" // defaults to DB_PATH + ".bak"
	AWSRegionEnv  = "AWS_REGION"
	S3BucketEnv   = "S3_BUCKET"
	S3PrefixEnv   = "S3_PREFIX"
)
