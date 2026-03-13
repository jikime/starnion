import * as fs from 'fs';
import * as path from 'path';

interface GenerateBackendOptions {
  mappingFile: string;
  outputDir: string;
  framework: string;
}

interface PageMapping {
  id: string;
  database?: {
    queries: Array<{
      raw: string;
      table: string;
      type: string;
      columns?: string[];
    }>;
  };
  output: {
    backend?: {
      entity?: string;
      repository?: string;
      controller?: string;
      endpoint?: string;
    };
  };
}

interface Mapping {
  project: {
    name: string;
  };
  pages: PageMapping[];
  database?: {
    tables: Array<{
      name: string;
      columns: Array<{
        name: string;
        type: string;
        nullable?: boolean;
        primary?: boolean;
      }>;
    }>;
  };
}

/**
 * 테이블 이름을 Entity 이름으로 변환
 */
function toEntityName(tableName: string): string {
  return tableName
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * 테이블 이름을 camelCase로 변환
 */
function toCamelCase(tableName: string): string {
  const entity = toEntityName(tableName);
  return entity.charAt(0).toLowerCase() + entity.slice(1);
}

/**
 * SQL 타입을 Java 타입으로 매핑
 */
function sqlTypeToJava(sqlType: string): string {
  const type = sqlType.toUpperCase();

  if (type.includes('BIGINT')) return 'Long';
  if (type.includes('INT') && !type.includes('POINT')) return 'Integer';
  if (type.includes('SMALLINT') || type.includes('TINYINT')) return 'Integer';
  if (type.includes('DECIMAL') || type.includes('NUMERIC')) return 'BigDecimal';
  if (type.includes('FLOAT') || type.includes('DOUBLE') || type.includes('REAL')) return 'Double';
  if (type.includes('BOOL')) return 'Boolean';
  if (type.includes('DATE') && !type.includes('TIME')) return 'LocalDate';
  if (type.includes('DATETIME') || type.includes('TIMESTAMP')) return 'LocalDateTime';
  if (type.includes('TIME') && !type.includes('DATE')) return 'LocalTime';
  if (type.includes('TEXT') || type.includes('CLOB')) return 'String';
  if (type.includes('BLOB') || type.includes('BINARY')) return 'byte[]';
  if (type.includes('JSON')) return 'String';
  if (type.includes('VARCHAR') || type.includes('CHAR')) return 'String';

  return 'String';
}

/**
 * Java Entity 생성 (스키마 정보 활용)
 */
function generateJavaEntity(
  tableName: string,
  columns?: Array<{ name: string; type: string; nullable?: boolean; primary?: boolean }>
): string {
  const entityName = toEntityName(tableName);

  let fieldDefinitions = '';
  let imports = new Set<string>([
    'jakarta.persistence.*',
    'lombok.Data',
    'lombok.NoArgsConstructor',
    'lombok.AllArgsConstructor',
  ]);

  if (columns && columns.length > 0) {
    for (const col of columns) {
      const javaType = sqlTypeToJava(col.type);
      const fieldName = toCamelCase(col.name);

      // 필요한 import 추가
      if (javaType === 'LocalDateTime' || javaType === 'LocalDate' || javaType === 'LocalTime') {
        imports.add(`java.time.${javaType}`);
      }
      if (javaType === 'BigDecimal') {
        imports.add('java.math.BigDecimal');
      }

      if (col.primary) {
        fieldDefinitions += `
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private ${javaType} ${fieldName};
`;
      } else {
        const nullableAnnotation = col.nullable ? '' : '';
        fieldDefinitions += `
    @Column(name = "${col.name}"${col.nullable ? '' : ', nullable = false'})
    private ${javaType} ${fieldName};
`;
      }
    }
  } else {
    // 스키마 정보 없는 경우 기본 필드
    fieldDefinitions = `
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // TODO: Add columns based on database schema

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
`;
    imports.add('java.time.LocalDateTime');
  }

  const importStatements = Array.from(imports)
    .map((i) => `import ${i};`)
    .join('\n');

  return `package com.example.entity;

${importStatements}

@Entity
@Table(name = "${tableName}")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ${entityName} {
${fieldDefinitions}
}
`;
}

/**
 * Java Repository 생성
 */
function generateJavaRepository(tableName: string): string {
  const entityName = toEntityName(tableName);

  return `package com.example.repository;

import com.example.entity.${entityName};
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ${entityName}Repository extends JpaRepository<${entityName}, Long> {

    // TODO: Add custom query methods based on SQL analysis

}
`;
}

/**
 * Java Controller 생성
 */
function generateJavaController(tableName: string): string {
  const entityName = toEntityName(tableName);
  const varName = toCamelCase(tableName);

  return `package com.example.controller;

import com.example.entity.${entityName};
import com.example.repository.${entityName}Repository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/${tableName}")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")  // TODO: Configure CORS properly for production
public class ${entityName}Controller {

    private final ${entityName}Repository ${varName}Repository;

    @GetMapping
    public ResponseEntity<List<${entityName}>> getAll() {
        List<${entityName}> ${varName}s = ${varName}Repository.findAll();
        return ResponseEntity.ok(${varName}s);
    }

    @GetMapping("/{id}")
    public ResponseEntity<${entityName}> getById(@PathVariable Long id) {
        return ${varName}Repository.findById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<${entityName}> create(@RequestBody ${entityName} ${varName}) {
        ${entityName} saved = ${varName}Repository.save(${varName});
        return ResponseEntity.ok(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<${entityName}> update(@PathVariable Long id, @RequestBody ${entityName} ${varName}) {
        if (!${varName}Repository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        ${varName}.setId(id);
        ${entityName} updated = ${varName}Repository.save(${varName});
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!${varName}Repository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        ${varName}Repository.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
`;
}

/**
 * Spring Boot application.properties 생성
 */
function generateApplicationProperties(): string {
  return `# Server Configuration
server.port=8080

# Database Configuration
# TODO: Update with your database settings
spring.datasource.url=jdbc:mysql://localhost:3306/smart_rebuild
spring.datasource.username=root
spring.datasource.password=

# JPA Configuration
spring.jpa.hibernate.ddl-auto=validate
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.format_sql=true

# CORS Configuration
# spring.mvc.cors.allowed-origins=http://localhost:3893
`;
}

/**
 * pom.xml 생성
 */
function generatePomXml(projectName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>${projectName}</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
    </parent>

    <properties>
        <java.version>21</java.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
`;
}

/**
 * Spring Boot Application 클래스 생성
 */
function generateApplication(): string {
  return `package com.example;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
`;
}

/**
 * Backend 생성 메인 함수
 */
export async function generateBackend(options: GenerateBackendOptions): Promise<void> {
  const { mappingFile, outputDir, framework } = options;

  console.log('🔧 Backend 생성 시작');

  // 매핑 파일 로드
  if (!fs.existsSync(mappingFile)) {
    throw new Error(`Mapping file not found: ${mappingFile}`);
  }

  const mapping: Mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf-8'));
  console.log(`📋 매핑 로드`);

  // 출력 디렉토리 생성
  fs.mkdirSync(outputDir, { recursive: true });

  if (framework === 'java') {
    await generateJavaBackend(mapping, outputDir);
  } else {
    console.log(`⚠️ 지원하지 않는 프레임워크: ${framework}`);
    console.log(`   지원 프레임워크: java`);
  }
}

/**
 * Java Spring Boot 백엔드 생성
 */
async function generateJavaBackend(mapping: Mapping, outputDir: string): Promise<void> {
  let entityCount = 0;
  const generatedTables = new Set<string>();

  // DB 스키마에서 테이블 정보 가져오기
  const tableSchemas = new Map<string, Array<{ name: string; type: string; nullable?: boolean; primary?: boolean }>>();
  if (mapping.database?.tables) {
    for (const table of mapping.database.tables) {
      tableSchemas.set(table.name, table.columns);
    }
  }

  // 페이지에서 사용하는 테이블 수집
  for (const page of mapping.pages) {
    if (page.database?.queries) {
      for (const query of page.database.queries) {
        if (generatedTables.has(query.table)) continue;
        generatedTables.add(query.table);

        const entityName = toEntityName(query.table);
        const columns = tableSchemas.get(query.table);

        // Entity
        const entityDir = path.join(outputDir, 'src/main/java/com/example/entity');
        fs.mkdirSync(entityDir, { recursive: true });
        fs.writeFileSync(
          path.join(entityDir, `${entityName}.java`),
          generateJavaEntity(query.table, columns)
        );

        // Repository
        const repoDir = path.join(outputDir, 'src/main/java/com/example/repository');
        fs.mkdirSync(repoDir, { recursive: true });
        fs.writeFileSync(
          path.join(repoDir, `${entityName}Repository.java`),
          generateJavaRepository(query.table)
        );

        // Controller
        const ctrlDir = path.join(outputDir, 'src/main/java/com/example/controller');
        fs.mkdirSync(ctrlDir, { recursive: true });
        fs.writeFileSync(
          path.join(ctrlDir, `${entityName}Controller.java`),
          generateJavaController(query.table)
        );

        entityCount++;
        console.log(`   ✓ ${entityName}: Entity, Repository, Controller`);
      }
    }
  }

  // Application.java
  const appDir = path.join(outputDir, 'src/main/java/com/example');
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'Application.java'), generateApplication());

  // application.properties
  const resourcesDir = path.join(outputDir, 'src/main/resources');
  fs.mkdirSync(resourcesDir, { recursive: true });
  fs.writeFileSync(path.join(resourcesDir, 'application.properties'), generateApplicationProperties());

  // pom.xml
  fs.writeFileSync(path.join(outputDir, 'pom.xml'), generatePomXml(mapping.project.name));

  console.log(`\n✅ Backend 생성 완료!`);
  console.log(`📦 Entity/Repository/Controller: ${entityCount}개`);
  console.log(`📁 출력 경로: ${outputDir}`);
  console.log(`\n💡 다음 단계: 'generate connect' 실행하여 프론트엔드 연동`);
}
