import * as fs from 'fs';
import * as path from 'path';

export interface Column {
  name: string;
  type: string;
  nullable?: boolean;
  primary?: boolean;
  unique?: boolean;
  default?: string;
  length?: number;
  references?: {
    table: string;
    column: string;
  };
}

export interface Table {
  name: string;
  columns: Column[];
  primaryKey?: string[];
  indexes?: Array<{
    name: string;
    columns: string[];
    unique: boolean;
  }>;
}

export interface DatabaseSchema {
  source: 'database' | 'prisma' | 'sql' | 'json';
  extractedAt: string;
  tables: Table[];
}

/**
 * SQL 타입을 Java 타입으로 매핑
 */
export function sqlTypeToJava(sqlType: string): string {
  const type = sqlType.toUpperCase();

  if (type.includes('INT') && !type.includes('POINT')) return 'Long';
  if (type.includes('BIGINT')) return 'Long';
  if (type.includes('SMALLINT') || type.includes('TINYINT')) return 'Integer';
  if (type.includes('DECIMAL') || type.includes('NUMERIC')) return 'BigDecimal';
  if (type.includes('FLOAT') || type.includes('DOUBLE') || type.includes('REAL')) return 'Double';
  if (type.includes('BOOL')) return 'Boolean';
  if (type.includes('DATE') && !type.includes('TIME')) return 'LocalDate';
  if (type.includes('DATETIME') || type.includes('TIMESTAMP')) return 'LocalDateTime';
  if (type.includes('TIME') && !type.includes('DATE')) return 'LocalTime';
  if (type.includes('TEXT') || type.includes('CLOB')) return 'String'; // @Lob
  if (type.includes('BLOB') || type.includes('BINARY')) return 'byte[]';
  if (type.includes('JSON')) return 'String'; // JSON column
  if (type.includes('ENUM')) return 'String'; // Will be converted to enum
  if (type.includes('VARCHAR') || type.includes('CHAR')) return 'String';

  return 'String'; // Default
}

/**
 * Prisma 타입을 SQL 타입으로 매핑
 */
function prismaTypeToSql(prismaType: string): string {
  const typeMap: Record<string, string> = {
    'String': 'VARCHAR(255)',
    'Int': 'INT',
    'BigInt': 'BIGINT',
    'Float': 'DOUBLE',
    'Decimal': 'DECIMAL(10,2)',
    'Boolean': 'BOOLEAN',
    'DateTime': 'DATETIME',
    'Json': 'JSON',
    'Bytes': 'BLOB',
  };

  return typeMap[prismaType] || 'VARCHAR(255)';
}

/**
 * DATABASE_URL에서 스키마 추출 (MySQL/PostgreSQL)
 */
export async function extractFromDatabase(databaseUrl: string): Promise<DatabaseSchema> {
  const url = new URL(databaseUrl);
  const protocol = url.protocol.replace(':', '');

  console.log(`🔌 데이터베이스 연결 중: ${protocol}://${url.host}${url.pathname}`);

  let tables: Table[] = [];

  if (protocol === 'mysql' || protocol === 'mariadb') {
    tables = await extractMySqlSchema(databaseUrl);
  } else if (protocol === 'postgresql' || protocol === 'postgres') {
    tables = await extractPostgresSchema(databaseUrl);
  } else {
    throw new Error(`지원하지 않는 데이터베이스: ${protocol}`);
  }

  return {
    source: 'database',
    extractedAt: new Date().toISOString(),
    tables,
  };
}

/**
 * MySQL 스키마 추출
 */
async function extractMySqlSchema(databaseUrl: string): Promise<Table[]> {
  // Dynamic import for mysql2
  let mysql: any;
  try {
    mysql = await import('mysql2/promise');
  } catch {
    throw new Error('mysql2 패키지가 필요합니다: npm install mysql2');
  }

  const connection = await mysql.createConnection(databaseUrl);
  const tables: Table[] = [];

  try {
    // 테이블 목록 조회
    const [tableRows] = await connection.execute(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`
    );

    for (const tableRow of tableRows as any[]) {
      const tableName = tableRow.TABLE_NAME;

      // 컬럼 정보 조회
      const [columnRows] = await connection.execute(
        `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH,
                IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [tableName]
      );

      const columns: Column[] = (columnRows as any[]).map(row => ({
        name: row.COLUMN_NAME,
        type: row.DATA_TYPE.toUpperCase() +
              (row.CHARACTER_MAXIMUM_LENGTH ? `(${row.CHARACTER_MAXIMUM_LENGTH})` : ''),
        nullable: row.IS_NULLABLE === 'YES',
        primary: row.COLUMN_KEY === 'PRI',
        unique: row.COLUMN_KEY === 'UNI',
        default: row.COLUMN_DEFAULT,
        length: row.CHARACTER_MAXIMUM_LENGTH,
      }));

      tables.push({ name: tableName, columns });
    }

    console.log(`✅ MySQL 스키마 추출 완료: ${tables.length}개 테이블`);
  } finally {
    await connection.end();
  }

  return tables;
}

/**
 * PostgreSQL 스키마 추출
 */
async function extractPostgresSchema(databaseUrl: string): Promise<Table[]> {
  // Dynamic import for pg
  let pg: any;
  try {
    pg = await import('pg');
  } catch {
    throw new Error('pg 패키지가 필요합니다: npm install pg');
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const tables: Table[] = [];

  try {
    // 테이블 목록 조회
    const tableResult = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );

    for (const tableRow of tableResult.rows) {
      const tableName = tableRow.tablename;

      // 컬럼 정보 조회
      const columnResult = await client.query(
        `SELECT column_name, data_type, character_maximum_length,
                is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [tableName]
      );

      // Primary key 조회
      const pkResult = await client.query(
        `SELECT a.attname
         FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         WHERE i.indrelid = $1::regclass AND i.indisprimary`,
        [tableName]
      );
      const primaryKeys = pkResult.rows.map((r: any) => r.attname);

      const columns: Column[] = columnResult.rows.map((row: any) => ({
        name: row.column_name,
        type: row.data_type.toUpperCase() +
              (row.character_maximum_length ? `(${row.character_maximum_length})` : ''),
        nullable: row.is_nullable === 'YES',
        primary: primaryKeys.includes(row.column_name),
        default: row.column_default,
        length: row.character_maximum_length,
      }));

      tables.push({ name: tableName, columns });
    }

    console.log(`✅ PostgreSQL 스키마 추출 완료: ${tables.length}개 테이블`);
  } finally {
    await client.end();
  }

  return tables;
}

/**
 * Prisma 스키마 파일에서 추출
 */
export function extractFromPrisma(schemaPath: string): DatabaseSchema {
  console.log(`📄 Prisma 스키마 파싱: ${schemaPath}`);

  const content = fs.readFileSync(schemaPath, 'utf-8');
  const tables: Table[] = [];

  // model 블록 파싱
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let match;

  while ((match = modelRegex.exec(content)) !== null) {
    const modelName = match[1];
    const modelBody = match[2];

    const columns: Column[] = [];
    const lines = modelBody.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//') && !l.startsWith('@@'));

    for (const line of lines) {
      // 필드 파싱: fieldName Type @attr
      const fieldMatch = line.match(/^(\w+)\s+(\w+)(\?)?(\[\])?\s*(.*)?$/);
      if (!fieldMatch) continue;

      const [, fieldName, fieldType, optional, isArray, attributes = ''] = fieldMatch;

      // 관계 필드 스킵 (다른 모델 참조)
      if (fieldType[0] === fieldType[0].toUpperCase() && !['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes'].includes(fieldType)) {
        continue;
      }

      const column: Column = {
        name: fieldName,
        type: prismaTypeToSql(fieldType),
        nullable: !!optional,
        primary: attributes.includes('@id'),
        unique: attributes.includes('@unique'),
      };

      // @default 파싱
      const defaultMatch = attributes.match(/@default\(([^)]+)\)/);
      if (defaultMatch) {
        column.default = defaultMatch[1];
      }

      // @db.VarChar(n) 파싱
      const dbTypeMatch = attributes.match(/@db\.(\w+)(?:\((\d+)\))?/);
      if (dbTypeMatch) {
        column.type = dbTypeMatch[1].toUpperCase();
        if (dbTypeMatch[2]) {
          column.type += `(${dbTypeMatch[2]})`;
          column.length = parseInt(dbTypeMatch[2]);
        }
      }

      columns.push(column);
    }

    // 테이블 이름 (@@map 또는 모델명의 snake_case)
    const tableNameMatch = modelBody.match(/@@map\(["'](\w+)["']\)/);
    const tableName = tableNameMatch ? tableNameMatch[1] : toSnakeCase(modelName);

    tables.push({ name: tableName, columns });
  }

  console.log(`✅ Prisma 스키마 파싱 완료: ${tables.length}개 테이블`);

  return {
    source: 'prisma',
    extractedAt: new Date().toISOString(),
    tables,
  };
}

/**
 * SQL dump 파일에서 추출
 */
export function extractFromSqlDump(sqlPath: string): DatabaseSchema {
  console.log(`📄 SQL dump 파싱: ${sqlPath}`);

  const content = fs.readFileSync(sqlPath, 'utf-8');
  const tables: Table[] = [];

  // CREATE TABLE 문 파싱
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([^;]+)\)/gi;
  let match;

  while ((match = createTableRegex.exec(content)) !== null) {
    const tableName = match[1];
    const tableBody = match[2];

    const columns: Column[] = [];
    const lines = tableBody.split(',').map(l => l.trim());

    for (const line of lines) {
      // PRIMARY KEY, INDEX 등 제약조건 스킵
      if (/^(PRIMARY|UNIQUE|INDEX|KEY|FOREIGN|CONSTRAINT|CHECK)/i.test(line)) {
        continue;
      }

      // 컬럼 정의 파싱
      const columnMatch = line.match(/^[`"']?(\w+)[`"']?\s+(\w+)(?:\(([^)]+)\))?\s*(.*)?$/i);
      if (!columnMatch) continue;

      const [, columnName, dataType, typeParams, attributes = ''] = columnMatch;

      let type = dataType.toUpperCase();
      let length: number | undefined;

      if (typeParams) {
        if (/^\d+$/.test(typeParams)) {
          length = parseInt(typeParams);
          type += `(${length})`;
        } else {
          type += `(${typeParams})`;
        }
      }

      const column: Column = {
        name: columnName,
        type,
        length,
        nullable: !attributes.toUpperCase().includes('NOT NULL'),
        primary: attributes.toUpperCase().includes('PRIMARY KEY'),
        unique: attributes.toUpperCase().includes('UNIQUE'),
      };

      // DEFAULT 값 파싱
      const defaultMatch = attributes.match(/DEFAULT\s+([^\s,]+)/i);
      if (defaultMatch) {
        column.default = defaultMatch[1].replace(/['"]/g, '');
      }

      // AUTO_INCREMENT 체크
      if (attributes.toUpperCase().includes('AUTO_INCREMENT') ||
          attributes.toUpperCase().includes('SERIAL')) {
        column.primary = true;
      }

      columns.push(column);
    }

    if (columns.length > 0) {
      tables.push({ name: tableName, columns });
    }
  }

  console.log(`✅ SQL dump 파싱 완료: ${tables.length}개 테이블`);

  return {
    source: 'sql',
    extractedAt: new Date().toISOString(),
    tables,
  };
}

/**
 * JSON 스키마 파일에서 로드
 */
export function extractFromJson(jsonPath: string): DatabaseSchema {
  console.log(`📄 JSON 스키마 로드: ${jsonPath}`);

  const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  // 이미 DatabaseSchema 형식인 경우
  if (content.tables && Array.isArray(content.tables)) {
    return {
      source: 'json',
      extractedAt: new Date().toISOString(),
      tables: content.tables,
    };
  }

  throw new Error('Invalid JSON schema format');
}

/**
 * 환경변수에서 DATABASE_URL 읽기
 */
export function getDatabaseUrlFromEnv(envPath?: string): string | null {
  // .env 파일이 지정된 경우
  if (envPath && fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/DATABASE_URL\s*=\s*["']?([^"'\n]+)["']?/);
    if (match) return match[1];
  }

  // 환경변수에서 직접 읽기
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // 기본 .env 파일 확인
  const defaultEnvPaths = ['.env', '.env.local', '.env.development'];
  for (const envFile of defaultEnvPaths) {
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf-8');
      const match = content.match(/DATABASE_URL\s*=\s*["']?([^"'\n]+)["']?/);
      if (match) return match[1];
    }
  }

  return null;
}

/**
 * 스키마 소스 자동 감지 및 추출
 */
export async function extractSchema(options: {
  fromEnv?: boolean;
  envPath?: string;
  schemaFile?: string;
}): Promise<DatabaseSchema | null> {
  const { fromEnv, envPath, schemaFile } = options;

  // 1. DATABASE_URL에서 추출
  if (fromEnv) {
    const dbUrl = getDatabaseUrlFromEnv(envPath);
    if (dbUrl) {
      return await extractFromDatabase(dbUrl);
    }
    console.warn('⚠️ DATABASE_URL을 찾을 수 없습니다');
    return null;
  }

  // 2. 스키마 파일에서 추출
  if (schemaFile) {
    if (!fs.existsSync(schemaFile)) {
      throw new Error(`스키마 파일을 찾을 수 없습니다: ${schemaFile}`);
    }

    const ext = path.extname(schemaFile).toLowerCase();

    if (ext === '.prisma' || schemaFile.includes('schema.prisma')) {
      return extractFromPrisma(schemaFile);
    }

    if (ext === '.sql') {
      return extractFromSqlDump(schemaFile);
    }

    if (ext === '.json') {
      return extractFromJson(schemaFile);
    }

    throw new Error(`지원하지 않는 스키마 파일 형식: ${ext}`);
  }

  // 3. 자동 감지
  const autoDetectPaths = [
    'prisma/schema.prisma',
    'schema.prisma',
    'database/schema.sql',
    'schema.sql',
    'db-schema.json',
  ];

  for (const detectPath of autoDetectPaths) {
    if (fs.existsSync(detectPath)) {
      console.log(`🔍 스키마 파일 자동 감지: ${detectPath}`);
      return extractSchema({ schemaFile: detectPath });
    }
  }

  return null;
}

/**
 * CamelCase to snake_case
 */
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter, index) =>
    index === 0 ? letter.toLowerCase() : '_' + letter.toLowerCase()
  );
}
