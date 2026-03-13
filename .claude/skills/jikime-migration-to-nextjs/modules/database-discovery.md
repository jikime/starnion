# Database Discovery Algorithm

Detection patterns for identifying database layer and ORM/schema tools in migration projects.

## Detection Priority

1. **Dependency file analysis** (primary: package.json, requirements.txt, go.mod, composer.json, Gemfile)
2. **Schema/config files** (secondary: schema.prisma, ormconfig.json, drizzle.config.ts, models.py)
3. **Environment variables** (tertiary: .env DATABASE_URL, DB_HOST, MONGODB_URI)
4. **Migration directories** (quaternary: prisma/migrations/, alembic/versions/, db/migrate/)
5. **Import statement analysis** (quinary)

## ORM Detection Rules

### Prisma

```yaml
prisma:
  package_json:
    - "prisma": "*"
    - "@prisma/client": "*"
  schema_files:
    - prisma/schema.prisma
  migration_dirs:
    - prisma/migrations/
  env_patterns:
    - DATABASE_URL
  version_detection: '"prisma": "^X.'
```

### Drizzle

```yaml
drizzle:
  package_json:
    - "drizzle-orm": "*"
    - "drizzle-kit": "*"
  config_files:
    - drizzle.config.ts
    - drizzle.config.js
  schema_patterns:
    - "**/*schema*.ts"
    - "**/*table*.ts"
    - "src/db/schema.ts"
  migration_dirs:
    - drizzle/
```

### TypeORM

```yaml
typeorm:
  package_json:
    - "typeorm": "*"
  config_files:
    - ormconfig.json
    - ormconfig.ts
    - data-source.ts
  file_patterns:
    - "**/*.entity.ts"
    - "**/*.entity.js"
  migration_dirs:
    - src/migrations/
    - migrations/
```

### Sequelize

```yaml
sequelize:
  package_json:
    - "sequelize": "*"
    - "sequelize-cli": "*"
  config_files:
    - .sequelizerc
    - config/database.js
    - config/config.json
  file_patterns:
    - "**/*.model.js"
    - "**/*.model.ts"
  migration_dirs:
    - db/migrations/
    - migrations/
```

### Mongoose

```yaml
mongoose:
  package_json:
    - "mongoose": "*"
  file_patterns:
    - "**/*.model.js"
    - "**/*.model.ts"
    - "**/*.schema.js"
    - "**/*.schema.ts"
  import_patterns:
    - "from 'mongoose'"
    - "require('mongoose')"
```

### Django ORM

```yaml
django:
  requirements:
    - "django"
    - "Django"
  file_patterns:
    - "**/models.py"
    - "**/migrations/*.py"
  config_files:
    - settings.py  # DATABASES section
    - "*/settings/*.py"
```

### SQLAlchemy

```yaml
sqlalchemy:
  requirements:
    - "sqlalchemy"
    - "SQLAlchemy"
    - "flask-sqlalchemy"
    - "Flask-SQLAlchemy"
  file_patterns:
    - "**/models.py"
    - "**/models/*.py"
  migration_dirs:
    - alembic/
    - migrations/versions/
  config_files:
    - alembic.ini
```

### GORM

```yaml
gorm:
  go_mod:
    - "gorm.io/gorm"
    - "gorm.io/driver/postgres"
    - "gorm.io/driver/mysql"
    - "gorm.io/driver/sqlite"
  file_patterns:
    - "**/*model*.go"
    - "**/models/*.go"
  import_patterns:
    - "gorm.io/gorm"
```

### Eloquent (Laravel)

```yaml
eloquent:
  composer_json:
    - "laravel/framework"
    - "illuminate/database"
  file_patterns:
    - "app/Models/*.php"
    - "database/migrations/*.php"
  config_files:
    - config/database.php
```

## Database Type Detection Rules

### PostgreSQL

```yaml
postgresql:
  env_patterns:
    - "DATABASE_URL=postgres://"
    - "DATABASE_URL=postgresql://"
    - "DB_CONNECTION=pgsql"
    - "DB_HOST=*.rds.amazonaws.com"  # AWS RDS common
  package_indicators:
    node: ["pg", "pg-promise", "postgres"]
    python: ["psycopg2", "psycopg2-binary", "asyncpg"]
    go: ["gorm.io/driver/postgres", "github.com/lib/pq", "github.com/jackc/pgx"]
    php: []  # detected via config/database.php
  prisma_datasource: 'provider = "postgresql"'
  drizzle_driver: "drizzle-orm/pg-core"
```

### MySQL

```yaml
mysql:
  env_patterns:
    - "DATABASE_URL=mysql://"
    - "DB_CONNECTION=mysql"
  package_indicators:
    node: ["mysql2", "mysql"]
    python: ["mysqlclient", "pymysql", "mysql-connector-python"]
    go: ["gorm.io/driver/mysql", "github.com/go-sql-driver/mysql"]
    php: []  # detected via config/database.php
  prisma_datasource: 'provider = "mysql"'
  drizzle_driver: "drizzle-orm/mysql-core"
```

### SQLite

```yaml
sqlite:
  env_patterns:
    - "DATABASE_URL=file:"
    - "DB_CONNECTION=sqlite"
  file_patterns:
    - "*.db"
    - "*.sqlite"
    - "*.sqlite3"
  package_indicators:
    node: ["better-sqlite3", "sql.js", "sqlite3"]
    python: []  # built-in sqlite3
    go: ["gorm.io/driver/sqlite", "github.com/mattn/go-sqlite3"]
  prisma_datasource: 'provider = "sqlite"'
  drizzle_driver: "drizzle-orm/better-sqlite3"
```

### MongoDB

```yaml
mongodb:
  env_patterns:
    - "MONGODB_URI="
    - "MONGO_URL="
    - "DATABASE_URL=mongodb://"
    - "DATABASE_URL=mongodb+srv://"
  package_indicators:
    node: ["mongodb", "mongoose"]
    python: ["pymongo", "motor", "mongoengine"]
    go: ["go.mongodb.org/mongo-driver"]
  prisma_datasource: 'provider = "mongodb"'
```

### Redis

```yaml
redis:
  env_patterns:
    - "REDIS_URL="
    - "REDIS_HOST="
    - "REDIS_URI="
  package_indicators:
    node: ["redis", "ioredis", "@upstash/redis"]
    python: ["redis", "aioredis"]
    go: ["github.com/redis/go-redis", "github.com/gomodule/redigo"]
  usage_patterns:
    - cache
    - session_store
    - pub_sub
    - queue
```

## Detection Logic

```python
def detect_database(project_path):
    """Detect database type and ORM from project structure."""

    # 1. Load dependency manifest
    pkg = load_package_manifest(project_path)
    # Supports: package.json, requirements.txt, go.mod, composer.json, Gemfile
    deps = extract_all_dependencies(pkg)

    # 2. ORM detection (priority order)
    orm_checks = [
        ("prisma",     ["prisma", "@prisma/client"]),
        ("drizzle",    ["drizzle-orm", "drizzle-kit"]),
        ("typeorm",    ["typeorm"]),
        ("sequelize",  ["sequelize"]),
        ("mongoose",   ["mongoose"]),
        ("django",     ["django", "Django"]),
        ("sqlalchemy", ["sqlalchemy", "SQLAlchemy", "flask-sqlalchemy"]),
        ("gorm",       ["gorm.io/gorm"]),
        ("eloquent",   ["laravel/framework", "illuminate/database"]),
    ]

    detected_orm = "none"
    orm_version = "unknown"
    for orm_name, indicators in orm_checks:
        for ind in indicators:
            if ind in deps:
                detected_orm = orm_name
                orm_version = deps[ind]
                break
        if detected_orm != "none":
            break

    # 3. Database type detection (layered)
    db_type = "none"

    # 3a. Check environment variables
    db_type = detect_db_from_env(project_path)

    # 3b. Check schema files (e.g., prisma datasource provider)
    if db_type == "none":
        db_type = detect_db_from_schema(project_path, detected_orm)

    # 3c. Check driver packages
    if db_type == "none":
        db_type = detect_db_from_packages(deps)

    # 4. Detect additional data services (Redis, etc.)
    additional_services = detect_additional_services(deps, project_path)

    return {
        "db_type": db_type,
        "db_orm": detected_orm,
        "db_orm_version": orm_version,
        "additional_services": additional_services
    }


def detect_db_from_env(project_path):
    """Parse .env file for database connection strings."""
    env_file = f"{project_path}/.env"
    if not exists(env_file):
        env_file = f"{project_path}/.env.example"

    if exists(env_file):
        content = read(env_file)
        if "postgres://" in content or "postgresql://" in content:
            return "postgresql"
        if "mysql://" in content:
            return "mysql"
        if "mongodb://" in content or "mongodb+srv://" in content:
            return "mongodb"
        if "DB_CONNECTION=sqlite" in content:
            return "sqlite"

    return "none"


def detect_db_from_schema(project_path, orm):
    """Detect database type from ORM schema files."""
    if orm == "prisma":
        schema = read(f"{project_path}/prisma/schema.prisma")
        if 'provider = "postgresql"' in schema:
            return "postgresql"
        if 'provider = "mysql"' in schema:
            return "mysql"
        if 'provider = "sqlite"' in schema:
            return "sqlite"
        if 'provider = "mongodb"' in schema:
            return "mongodb"

    if orm == "django":
        settings = read_django_settings(project_path)
        engine = settings.get("DATABASES", {}).get("default", {}).get("ENGINE", "")
        if "postgresql" in engine:
            return "postgresql"
        if "mysql" in engine:
            return "mysql"
        if "sqlite" in engine:
            return "sqlite"

    return "none"
```

## Multiple Database Support

Some projects use multiple databases. The discovery should detect all of them:

```yaml
# Example: Primary DB + Cache
databases:
  primary:
    type: postgresql
    orm: prisma
    usage: main_data_store
  cache:
    type: redis
    driver: ioredis
    usage: session_store, query_cache
```

When multiple databases are detected, set `db_type` to the primary database and list additional services separately.

## No Database Detected

When no database indicators are found:
- Set `db_type: none` and `db_orm: none`
- This is common for frontend-only projects
- All downstream phases should gracefully skip database-related steps

---

Version: 1.0.0
Source: jikime-migration-to-nextjs SKILL.md
