package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite"
)

type schemaObject struct {
	Type    string
	Name    string
	TblName string
	SQL     string
}

func main() {
	outDir := flag.String("out", "data/sql/schema/current", "output schema snapshot directory")
	migrationsDir := flag.String("migrations", "data/sql/migrations", "goose migrations directory")
	flag.Parse()

	if err := run(*outDir, *migrationsDir); err != nil {
		log.Fatal(err)
	}
}

func run(outDir, migrationsDir string) error {
	tmpDir, err := os.MkdirTemp("", "noodle-map-schema-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmpDir)

	dbPath := filepath.Join(tmpDir, "schema.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	if err := goose.SetDialect("sqlite3"); err != nil {
		return err
	}
	if err := goose.Up(db, migrationsDir); err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}

	objects, err := loadSchemaObjects(db)
	if err != nil {
		return err
	}

	return writeSchemaFiles(outDir, objects)
}

func writeSchemaFiles(outDir string, objects []schemaObject) error {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}

	entries, err := os.ReadDir(outDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".sql" {
			continue
		}
		if err := os.Remove(filepath.Join(outDir, entry.Name())); err != nil {
			return err
		}
	}

	grouped := make(map[string][]schemaObject)
	var tableNames []string
	for _, object := range objects {
		if object.Type == "table" {
			tableNames = append(tableNames, object.Name)
		}
		if object.TblName != "" {
			grouped[object.TblName] = append(grouped[object.TblName], object)
		}
	}

	for _, tableName := range tableNames {
		path := filepath.Join(outDir, safeFileName(tableName)+".sql")
		if err := os.WriteFile(path, []byte(formatSchemaFile(tableName, grouped[tableName])), 0o644); err != nil {
			return err
		}
	}
	return nil
}

func loadSchemaObjects(db *sql.DB) ([]schemaObject, error) {
	rows, err := db.Query(`
select type, name, tbl_name, sql
from sqlite_schema
where sql is not null
  and name not like 'sqlite_%'
  and name <> 'goose_db_version'
order by
  case type
    when 'table' then 1
    when 'index' then 2
    when 'trigger' then 3
    when 'view' then 4
    else 5
  end,
  tbl_name,
  name
`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var objects []schemaObject
	for rows.Next() {
		var object schemaObject
		if err := rows.Scan(&object.Type, &object.Name, &object.TblName, &object.SQL); err != nil {
			return nil, err
		}
		objects = append(objects, object)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return objects, nil
}

func formatSchemaFile(tableName string, objects []schemaObject) string {
	var b strings.Builder
	b.WriteString("-- Current schema snapshot for ")
	b.WriteString(tableName)
	b.WriteString(", generated from goose migrations.\n")
	b.WriteString("-- Do not edit by hand. Run `npm run db:schema:dump` from the repository root.\n\n")

	for i, object := range objects {
		if i > 0 {
			b.WriteString("\n")
		}
		b.WriteString(normalizeSQL(object.SQL))
		b.WriteString(";\n")
	}
	return b.String()
}

var unsafeFileNameChar = regexp.MustCompile(`[^A-Za-z0-9_.-]+`)

func safeFileName(name string) string {
	safe := unsafeFileNameChar.ReplaceAllString(name, "_")
	return strings.Trim(safe, "_")
}

func normalizeSQL(sql string) string {
	normalized := strings.TrimSpace(sql)
	normalized = strings.ReplaceAll(normalized, "\r\n", "\n")
	normalized = strings.ReplaceAll(normalized, "\n,", ",\n    ")
	normalized = strings.ReplaceAll(normalized, ",\n     ", ",\n    ")
	return normalized
}
