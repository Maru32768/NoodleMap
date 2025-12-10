package main

import (
	"github.com/caarlos0/env/v11"
)

type Envs struct {
	DbHost       string `env:"DB_HOST,notEmpty"`
	DbPort       string `env:"DB_PORT,notEmpty"`
	DbUser       string `env:"DB_USER,notEmpty"`
	DbPassword   string `env:"DB_PASSWORD,notEmpty"`
	DbName       string `env:"DB_NAME,notEmpty"`
	DbSslMode    string `env:"DB_SSL_MODE,notEmpty"`
	AwsRegion    string `env:"AWS_REGION,notEmpty"`
	S3Bucket     string `env:"S3_BUCKET,notEmpty"`
	S3Prefix     string `env:"S3_PREFIX,notEmpty"`
	RestoreS3Key string `env:"RESTORE_S3_KEY"` // 特定のオブジェクトキーを指定する場合に使用(未指定なら最新)
	BackupDbName string `env:"BACKUP_DB_NAME"` // S3 上のバックアップ元 DB 名(未指定なら DbName)
}

func loadEnvs() (*Envs, error) {
	var envs Envs
	if err := env.Parse(&envs); err != nil {
		return nil, err
	}

	return &envs, nil
}
