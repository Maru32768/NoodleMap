package main

const (
	DbPathEnv      = "DB_PATH"
	ServerPortEnv  = "SERVER_PORT"
	TokenSecretEnv = "TOKEN_SECRET"

	// Optional — omit to disable S3 backup.
	BackupPathEnv = "BACKUP_PATH" // defaults to DB_PATH + ".bak"
	AWSRegionEnv  = "AWS_REGION"
	S3BucketEnv   = "S3_BUCKET"
	S3PrefixEnv   = "S3_PREFIX"
)
