package main

import (
	"compress/gzip"
	"context"
	"database/sql"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path"
	"time"

	_ "github.com/lib/pq"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

const (
	dbRetryTimes    = 5
	dbRetryInterval = 10 * time.Second

	// 1 回のバックアップに許容する最大時間
	backupTimeout = 30 * time.Minute
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	// 環境変数読み込み
	envs, err := loadEnvs()
	if err != nil {
		log.Fatalln("failed to load envs:", err)
	}

	// DB 接続（接続確認用）
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		envs.DbHost,
		envs.DbPort,
		envs.DbUser,
		envs.DbPassword,
		envs.DbName,
		envs.DbSslMode,
	)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalln("failed to open db:", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			log.Println("failed to close db:", err)
		}
	}()

	// DB 生存確認リトライ
	for i := 1; i <= dbRetryTimes; i++ {
		if err := db.Ping(); err != nil {
			if i == dbRetryTimes {
				log.Fatalln("failed to ping db:", err)
			}
			log.Printf("Waiting DB for %s. retry=%d err=%s\n", dbRetryInterval, i, err)
			time.Sleep(dbRetryInterval)
		} else {
			break
		}
	}

	// バックアップ実行
	ctx, cancel := context.WithTimeout(context.Background(), backupTimeout)
	defer cancel()

	awsCfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(envs.AwsRegion))
	if err != nil {
		log.Fatalln("failed to load aws config:", err)
	}

	s3Client := s3.NewFromConfig(awsCfg)

	if err := backupPostgresToS3(ctx, envs, s3Client); err != nil {
		log.Fatalln("backup failed:", err)
	}

	log.Println("backup finished successfully")
}

// backupPostgresToS3 は pg_dump の出力を gzip 圧縮しつつ S3 にストリーミングアップロードする
func backupPostgresToS3(ctx context.Context, envs *Envs, s3Client *s3.Client) error {
	now := time.Now().UTC()

	// ファイル名とキーを組み立て
	filename := fmt.Sprintf("%s-%s.dump.gz", envs.DbName, now.Format("20060102-150405"))
	datePrefix := fmt.Sprintf("%04d/%02d/%02d", now.Year(), int(now.Month()), now.Day())

	// s3://<bucket>/<S3Prefix>/<dbName>/YYYY/MM/DD/<filename>
	key := path.Join(envs.S3Prefix, envs.DbName, datePrefix, filename)

	log.Printf("start backup: db=%s s3://%s/%s", envs.DbName, envs.S3Bucket, key)

	// pg_dump コマンドを準備
	dumpCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	cmd := exec.CommandContext(
		dumpCtx,
		"pg_dump",
		"-h", envs.DbHost,
		"-p", envs.DbPort,
		"-U", envs.DbUser,
		"-d", envs.DbName,
		"-Fc", // カスタムフォーマット
	)

	// パスワードと SSL 設定は環境変数で渡す
	env := os.Environ()
	env = append(env, "PGPASSWORD="+envs.DbPassword)
	if envs.DbSslMode != "" {
		env = append(env, "PGSSLMODE="+envs.DbSslMode)
	}
	cmd.Env = env
	cmd.Stderr = os.Stderr

	// pg_dump stdout -> gzip -> io.Pipe -> S3
	pr, pw := io.Pipe()
	gz := gzip.NewWriter(pw)

	cmd.Stdout = gz

	// pg_dump 実行（別 goroutine）
	go func() {
		defer func() {
			_ = gz.Close()
			_ = pw.Close()
		}()

		if err := cmd.Run(); err != nil {
			log.Printf("pg_dump error: %v", err)
			_ = pw.CloseWithError(err)
			return
		}
		log.Println("pg_dump finished")
	}()

	uploader := manager.NewUploader(s3Client)

	_, err := uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket: aws.String(envs.S3Bucket),
		Key:    aws.String(key),
		Body:   pr,
	})
	if err != nil {
		return fmt.Errorf("s3 upload error: %w", err)
	}

	log.Printf("backup uploaded: s3://%s/%s", envs.S3Bucket, key)
	return nil
}
