package main

import (
	"compress/gzip"
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// S3 上の最新バックアップのキーを探す
func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	// env.go のローダーを使用
	envs, err := loadEnvs()
	if err != nil {
		log.Fatalf("failed to load envs: %v", err)
	}

	ctx := context.Background()

	awsCfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(envs.AwsRegion))
	if err != nil {
		log.Fatalf("failed to load aws config: %v", err)
	}

	s3Client := s3.NewFromConfig(awsCfg)

	if err := restoreFromS3(ctx, envs, s3Client); err != nil {
		log.Fatalf("restore failed: %v", err)
	}
}

func findLatestBackupKey(ctx context.Context, envs *Envs, s3Client *s3.Client) (string, error) {
	dbName := envs.BackupDbName
	if dbName == "" {
		dbName = envs.DbName
	}
	prefix := path.Join(envs.S3Prefix, dbName) + "/"

	log.Printf("listing backups under s3://%s/%s\n", envs.S3Bucket, prefix)

	var continuationToken *string
	var latestObj *s3types.Object

	for {
		out, err := s3Client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(envs.S3Bucket),
			Prefix:            aws.String(prefix),
			ContinuationToken: continuationToken,
		})
		if err != nil {
			return "", fmt.Errorf("ListObjectsV2 error: %w", err)
		}

		for _, obj := range out.Contents {
			if obj.Key == nil || obj.LastModified == nil {
				continue
			}
			if latestObj == nil || obj.LastModified.After(*latestObj.LastModified) {
				latestObj = &obj
			}
		}

		if *out.IsTruncated && out.NextContinuationToken != nil {
			continuationToken = out.NextContinuationToken
		} else {
			break
		}
	}

	if latestObj == nil || latestObj.Key == nil {
		return "", fmt.Errorf("no backup objects found under prefix %s", prefix)
	}

	log.Printf("latest backup: s3://%s/%s (LastModified=%s)\n",
		envs.S3Bucket, aws.ToString(latestObj.Key), latestObj.LastModified.Format(time.RFC3339))

	return aws.ToString(latestObj.Key), nil
}

// S3 の .dump.gz を取得し、gunzip → pg_restore にストリーミングで流し込む
func restoreFromS3(ctx context.Context, envs *Envs, s3Client *s3.Client) error {
	key := envs.RestoreS3Key
	if key == "" {
		var err error
		key, err = findLatestBackupKey(ctx, envs, s3Client)
		if err != nil {
			return err
		}
	} else {
		log.Printf("using specified backup key: s3://%s/%s\n", envs.S3Bucket, key)
	}

	getOut, err := s3Client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(envs.S3Bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("GetObject error: %w", err)
	}
	defer getOut.Body.Close()

	gzReader, err := gzip.NewReader(getOut.Body)
	if err != nil {
		return fmt.Errorf("failed to create gzip reader: %w", err)
	}
	defer gzReader.Close()

	restoreCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	cmd := exec.CommandContext(
		restoreCtx,
		"pg_restore",
		"--clean",
		"--if-exists",
		"--no-owner",
		"--no-privileges",
		"-h", envs.DbHost,
		"-p", envs.DbPort,
		"-U", envs.DbUser,
		"-d", envs.DbName,
	)

	env := os.Environ()
	env = append(env, "PGPASSWORD="+envs.DbPassword)
	if envs.DbSslMode != "" {
		env = append(env, "PGSSLMODE="+envs.DbSslMode)
	}
	cmd.Env = env

	cmd.Stdin = gzReader
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	log.Printf("starting pg_restore into DB_NAME=%s\n", envs.DbName)

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("pg_restore error: %w", err)
	}

	log.Println("restore finished successfully")
	return nil
}
