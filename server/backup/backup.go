package backup

import (
	"compress/gzip"
	"context"
	"database/sql"
	"fmt"
	"io"
	"log"
	"os"
	"path"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type Config struct {
	// SnapshotPath is the local path for the VACUUM INTO snapshot (same disk as DB).
	SnapshotPath string
	// S3 fields are optional. If S3Bucket is empty, only the local snapshot is kept.
	S3Bucket  string
	S3Prefix  string
	AWSRegion string
}

// Run creates a consistent SQLite snapshot via VACUUM INTO, then optionally uploads
// it to S3 as a gzip-compressed file. It is safe to call while the DB is open and
// being written to.
func Run(ctx context.Context, db *sql.DB, cfg Config) error {
	// Remove any leftover snapshot from the previous run.
	if err := os.Remove(cfg.SnapshotPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove old snapshot: %w", err)
	}

	if _, err := db.ExecContext(ctx, "VACUUM INTO ?", cfg.SnapshotPath); err != nil {
		return fmt.Errorf("vacuum into: %w", err)
	}
	log.Printf("backup: snapshot written to %s", cfg.SnapshotPath)

	if cfg.S3Bucket == "" {
		log.Println("backup: S3 not configured, keeping local snapshot only")
		return nil
	}

	return uploadToS3(ctx, cfg)
}

func uploadToS3(ctx context.Context, cfg Config) error {
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(cfg.AWSRegion))
	if err != nil {
		return fmt.Errorf("load aws config: %w", err)
	}

	now := time.Now().UTC()
	filename := fmt.Sprintf("noodle_map-%s.db.gz", now.Format("20060102-150405"))
	datePrefix := fmt.Sprintf("%04d/%02d/%02d", now.Year(), int(now.Month()), now.Day())
	key := path.Join(cfg.S3Prefix, datePrefix, filename)

	log.Printf("backup: uploading to s3://%s/%s", cfg.S3Bucket, key)

	f, err := os.Open(cfg.SnapshotPath)
	if err != nil {
		return fmt.Errorf("open snapshot: %w", err)
	}
	defer f.Close()

	pr, pw := io.Pipe()
	gz := gzip.NewWriter(pw)
	go func() {
		defer pw.Close()
		defer gz.Close()
		if _, err := io.Copy(gz, f); err != nil {
			pw.CloseWithError(err)
		}
	}()

	s3Client := s3.NewFromConfig(awsCfg)
	uploader := manager.NewUploader(s3Client)
	if _, err := uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket: aws.String(cfg.S3Bucket),
		Key:    aws.String(key),
		Body:   pr,
	}); err != nil {
		return fmt.Errorf("upload: %w", err)
	}

	log.Printf("backup: uploaded to s3://%s/%s", cfg.S3Bucket, key)
	return nil
}
