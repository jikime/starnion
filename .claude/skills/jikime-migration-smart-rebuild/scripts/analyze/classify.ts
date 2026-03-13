import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { extractSchema, DatabaseSchema } from './schema-extractor';
import {
  detectFramework,
  getMatchStrategy,
  FrameworkType,
  FrameworkDetectionResult,
} from './frameworks';

interface AnalyzeOptions {
  sourcePath: string;
  capturePath: string;
  outputFile: string;
  dbSchemaFile?: string;
  dbFromEnv?: boolean;
  envPath?: string;
  manualMappingFile?: string;
  framework?: FrameworkType; // 수동 지정 (자동 감지 오버라이드)
}

interface PageAnalysis {
  path: string;
  type: 'static' | 'dynamic';
  reason: string[];
  dbQueries: ExtractedQuery[];
}

interface ExtractedQuery {
  raw: string;
  table: string;
  type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  columns?: string[];
  conditions?: string;
}

interface CapturedPage {
  url: string;
  screenshot: string;
  html: string;
  title: string;
}

interface PageMapping {
  id: string;
  capture: {
    url: string;
    screenshot: string;
    html: string;
  };
  source: {
    file: string | null;
    type: 'static' | 'dynamic' | 'unknown';
    reason: string[];
  };
  database?: {
    queries: ExtractedQuery[];
  };
  output: {
    backend?: {
      entity?: string;
      repository?: string;
      controller?: string;
      endpoint?: string;
    };
    frontend: {
      path: string;
      type: 'static-page' | 'dynamic-page';
      apiCalls?: string[];
    };
  };
}

interface Mapping {
  project: {
    name: string;
    sourceUrl: string;
    sourcePath: string;
  };
  framework: {
    detected: FrameworkType;
    version?: string;
    confidence: number;
    indicators: string[];
  };
  summary: {
    totalPages: number;
    static: number;
    dynamic: number;
    unknown: number;
  };
  pages: PageMapping[];
  database?: {
    source?: string;
    extractedAt?: string;
    tables: Array<{
      name: string;
      columns: Array<{
        name: string;
        type: string;
        nullable?: boolean;
        primary?: boolean;
        unique?: boolean;
        default?: string;
        length?: number;
      }>;
    }>;
  };
}

/**
 * SQL 쿼리 추출
 */
function extractQueries(content: string): ExtractedQuery[] {
  const queries: ExtractedQuery[] = [];

  // SELECT 쿼리
  const selectPattern = /SELECT\s+([\w\s,*`]+)\s+FROM\s+[`']?(\w+)[`']?(?:\s+WHERE\s+(.+?))?(?:;|$|ORDER|LIMIT|GROUP)/gi;
  let match;

  while ((match = selectPattern.exec(content)) !== null) {
    queries.push({
      raw: match[0].trim(),
      type: 'SELECT',
      columns: match[1].split(',').map((c) => c.trim()),
      table: match[2],
      conditions: match[3]?.trim(),
    });
  }

  // INSERT 쿼리
  const insertPattern = /INSERT\s+INTO\s+[`']?(\w+)[`']?/gi;
  while ((match = insertPattern.exec(content)) !== null) {
    queries.push({
      raw: match[0].trim(),
      type: 'INSERT',
      table: match[1],
    });
  }

  // UPDATE 쿼리
  const updatePattern = /UPDATE\s+[`']?(\w+)[`']?\s+SET/gi;
  while ((match = updatePattern.exec(content)) !== null) {
    queries.push({
      raw: match[0].trim(),
      type: 'UPDATE',
      table: match[1],
    });
  }

  // DELETE 쿼리
  const deletePattern = /DELETE\s+FROM\s+[`']?(\w+)[`']?/gi;
  while ((match = deletePattern.exec(content)) !== null) {
    queries.push({
      raw: match[0].trim(),
      type: 'DELETE',
      table: match[1],
    });
  }

  return queries;
}

/**
 * 페이지 분류 (정적/동적)
 */
function classifyPage(filePath: string): PageAnalysis {
  const content = fs.readFileSync(filePath, 'utf-8');
  const reasons: string[] = [];
  const dbQueries = extractQueries(content);

  // 1. SQL 쿼리 체크
  if (dbQueries.length > 0) {
    reasons.push(`SQL 쿼리 ${dbQueries.length}개 발견`);
  }

  // 2. DB 연결 함수 체크
  const dbPatterns = [
    { pattern: /mysqli_query|mysqli_fetch/g, name: 'mysqli' },
    { pattern: /\$pdo->query|\$pdo->prepare/g, name: 'PDO' },
    { pattern: /\$wpdb->/g, name: 'WordPress DB' },
    { pattern: /\$this->db->get|\$this->db->query/g, name: 'CodeIgniter' },
    { pattern: /DB::table|DB::select/g, name: 'Laravel' },
  ];

  for (const { pattern, name } of dbPatterns) {
    if (pattern.test(content)) {
      reasons.push(`${name} 사용`);
    }
  }

  // 3. 세션 체크
  if (/\$_SESSION|session_start\s*\(/g.test(content)) {
    reasons.push('세션 사용');
  }

  // 4. POST 처리 체크
  if (/\$_POST\s*\[|\$_REQUEST\s*\[/g.test(content)) {
    reasons.push('POST 데이터 처리');
  }

  // 5. 동적 파라미터 체크
  if (/\$_GET\s*\[/g.test(content)) {
    reasons.push('GET 파라미터 사용');
  }

  return {
    path: filePath,
    type: reasons.length > 0 ? 'dynamic' : 'static',
    reason: reasons,
    dbQueries,
  };
}

/**
 * 약어 매핑 사전 (순수 PHP 프로젝트용)
 * URL 키워드 → 파일명 접두사
 */
const ABBREVIATION_MAP: Record<string, string[]> = {
  notice: ['nt_', 'notice_'],
  story: ['sty_', 'story_'],
  review: ['sty_', 'review_'],
  qa: ['qa_', 'qna_'],
  qna: ['qa_', 'qna_'],
  faq: ['faq_'],
  product: ['pd_', 'prod_', 'products_'],
  member: ['mb_', 'mem_', 'member_'],
  board: ['bd_', 'board_'],
  gallery: ['gal_', 'gallery_'],
  news: ['news_'],
  event: ['ev_', 'event_'],
};

/**
 * 백업 파일 패턴 체크 (YYYYMMDD 포함 파일)
 */
function isBackupFile(fileName: string): boolean {
  // _YYYYMMDD.php 또는 _YYYYMMDD_N.php 패턴
  return /_(20\d{6}(_\d+)?|back|bak|old)\.php$/i.test(fileName);
}

/**
 * 유효한 PHP 파일 필터링 (백업 파일 제외)
 */
function filterValidPhpFiles(files: string[]): string[] {
  return files.filter((f) => {
    const fileName = path.basename(f);
    // 백업 파일 제외
    if (isBackupFile(fileName)) return false;
    // 숨김 파일 제외
    if (fileName.startsWith('.')) return false;
    // lib, include 폴더 제외
    if (f.includes('/_lib/') || f.includes('/include/') || f.includes('/lib/')) return false;
    return true;
  });
}

/**
 * URL과 소스 파일 매칭 (순수 PHP 최적화 버전)
 */
function matchUrlToSource(
  url: string,
  sourcePath: string,
  phpFiles: string[],
  manualMapping?: Record<string, string>
): string | null {
  const urlObj = new URL(url);
  let urlPath = urlObj.pathname;

  // 수동 매핑 체크
  if (manualMapping && manualMapping[url]) {
    const manualFile = path.join(sourcePath, manualMapping[url]);
    if (fs.existsSync(manualFile)) return manualFile;
  }

  // 백업 파일 제외한 유효 파일 목록
  const validFiles = filterValidPhpFiles(phpFiles);

  // URL에서 .php 확장자 제거 (있는 경우)
  if (urlPath.endsWith('.php')) {
    urlPath = urlPath.slice(0, -4);
  }

  // 경로 정규화
  if (urlPath === '/') urlPath = '/index';
  if (urlPath.endsWith('/')) urlPath = urlPath.slice(0, -1);

  // URL 경로 파싱
  const urlSegments = urlPath.split('/').filter(Boolean);
  const urlFolder = urlSegments.length > 1 ? urlSegments[0] : '';
  const urlName = urlSegments[urlSegments.length - 1] || 'index';
  const urlNameLower = urlName.toLowerCase();

  // 1. 직접 매칭 (path.php) - .php 확장자가 있었던 URL도 처리
  const directMatch = path.join(sourcePath, `${urlPath}.php`);
  if (fs.existsSync(directMatch) && !isBackupFile(directMatch)) {
    return directMatch;
  }

  // 2. index.php 매칭 (path/index.php)
  const indexMatch = path.join(sourcePath, urlPath, 'index.php');
  if (fs.existsSync(indexMatch)) return indexMatch;

  // 3. 쿼리 파라미터 기반 (index.php?page=about → about.php)
  const pageParam = urlObj.searchParams.get('page');
  if (pageParam) {
    const pageMatch = path.join(sourcePath, `${pageParam}.php`);
    if (fs.existsSync(pageMatch) && !isBackupFile(pageMatch)) {
      return pageMatch;
    }
  }

  // 4. 폴더 기반 매칭 (가장 중요한 로직)
  if (urlFolder) {
    // 같은 폴더 내 유효 파일들만 찾기
    const folderFiles = validFiles.filter(
      (f) => f.startsWith(urlFolder + '/') || f.startsWith(urlFolder + path.sep)
    );

    // 4-1. 정확한 파일명 매칭
    for (const file of folderFiles) {
      const fileName = path.basename(file, '.php').toLowerCase();
      if (fileName === urlNameLower) {
        return path.join(sourcePath, file);
      }
    }

    // 4-2. 약어 매핑 적용
    const abbreviations = ABBREVIATION_MAP[urlNameLower] || [];
    for (const abbr of abbreviations) {
      for (const file of folderFiles) {
        const fileName = path.basename(file, '.php').toLowerCase();
        // 약어 + list 패턴 (예: notice → nt_list)
        if (fileName === `${abbr}list` || fileName === `${abbr.slice(0, -1)}_list`) {
          return path.join(sourcePath, file);
        }
      }
    }

    // 4-3. 액션 패턴 매칭 (list, view, write)
    for (const file of folderFiles) {
      const fileName = path.basename(file, '.php').toLowerCase();

      // URL이 폴더명과 같으면 기본 list 파일 반환
      if (urlNameLower === urlFolder && fileName.includes('list')) {
        return path.join(sourcePath, file);
      }

      // list, view 등 액션 키워드 포함 시
      if (urlNameLower.includes('list') && fileName.includes('list')) {
        return path.join(sourcePath, file);
      }
      if (urlNameLower.includes('view') && (fileName.includes('view') || fileName.includes('detail'))) {
        return path.join(sourcePath, file);
      }
      if (urlNameLower.includes('write') && fileName.includes('write')) {
        return path.join(sourcePath, file);
      }
    }

    // 4-4. 파일명이 URL 이름을 포함하거나 URL 이름이 파일명을 포함
    for (const file of folderFiles) {
      const fileName = path.basename(file, '.php').toLowerCase();
      if (fileName.includes(urlNameLower) || urlNameLower.includes(fileName)) {
        return path.join(sourcePath, file);
      }
    }

    // 4-5. 폴더에 유효한 파일이 하나만 있으면 그것을 사용
    const nonIndexFiles = folderFiles.filter((f) => !path.basename(f).toLowerCase().includes('index'));
    if (nonIndexFiles.length === 1) {
      return path.join(sourcePath, nonIndexFiles[0]);
    }

    // 4-6. 폴더 내 첫 번째 list 파일 반환 (기본 페이지로 간주)
    const listFile = folderFiles.find((f) => path.basename(f).toLowerCase().includes('list'));
    if (listFile) {
      return path.join(sourcePath, listFile);
    }
  }

  // 5. 전체 파일에서 유사도 매칭 (폴더 무관)
  const normalizedUrlName = urlNameLower.replace(/-/g, '_');
  for (const file of validFiles) {
    const fileName = path.basename(file, '.php').toLowerCase();

    // 정확히 일치 (하이픈 → 언더스코어 변환 포함)
    if (fileName === normalizedUrlName) {
      return path.join(sourcePath, file);
    }
  }

  // 6. 부분 매칭 (키워드 기반)
  const keywords = urlName.toLowerCase().split(/[-_]/).filter((k) => k.length > 2);
  if (keywords.length > 0) {
    for (const file of validFiles) {
      const fileName = path.basename(file, '.php').toLowerCase();
      const matchCount = keywords.filter((k) => fileName.includes(k)).length;
      if (matchCount >= Math.ceil(keywords.length / 2)) {
        return path.join(sourcePath, file);
      }
    }
  }

  // 7. 약어 매핑 전역 검색
  for (const [keyword, prefixes] of Object.entries(ABBREVIATION_MAP)) {
    if (urlNameLower.includes(keyword)) {
      for (const prefix of prefixes) {
        for (const file of validFiles) {
          const fileName = path.basename(file, '.php').toLowerCase();
          if (fileName.startsWith(prefix)) {
            return path.join(sourcePath, file);
          }
        }
      }
    }
  }

  return null;
}

/**
 * 소스 분석 및 매핑 생성
 */
export async function analyzeSource(options: AnalyzeOptions): Promise<Mapping> {
  const { sourcePath, capturePath, outputFile, dbSchemaFile, dbFromEnv, envPath, manualMappingFile, framework } = options;

  console.log('🔍 소스 분석 시작');

  // 1. 프레임워크 감지
  console.log('🔎 프레임워크 감지 중...');
  const detectedFramework = detectFramework(sourcePath);
  const activeFramework = framework || detectedFramework.type;
  const matchStrategy = getMatchStrategy(activeFramework);

  console.log(`📦 프레임워크: ${activeFramework} (신뢰도: ${detectedFramework.confidence}%)`);
  if (detectedFramework.version) {
    console.log(`   버전: ${detectedFramework.version}`);
  }
  detectedFramework.indicators.forEach((ind) => console.log(`   • ${ind}`));

  // sitemap.json 로드
  const sitemapPath = path.join(capturePath, 'sitemap.json');
  if (!fs.existsSync(sitemapPath)) {
    throw new Error(`sitemap.json not found at ${sitemapPath}`);
  }

  const sitemap = JSON.parse(fs.readFileSync(sitemapPath, 'utf-8'));
  const capturedPages: CapturedPage[] = sitemap.pages;

  // 수동 매핑 로드
  let manualMapping: Record<string, string> = {};
  if (manualMappingFile && fs.existsSync(manualMappingFile)) {
    manualMapping = JSON.parse(fs.readFileSync(manualMappingFile, 'utf-8'));
    console.log(`📋 수동 매핑 로드: ${Object.keys(manualMapping).length}개`);
  }

  // PHP 파일 분석
  const phpFiles = await glob('**/*.php', { cwd: sourcePath });
  console.log(`📂 소스 파일: ${phpFiles.length}개`);

  const pageAnalyses = new Map<string, PageAnalysis>();
  for (const file of phpFiles) {
    const fullPath = path.join(sourcePath, file);
    pageAnalyses.set(fullPath, classifyPage(fullPath));
  }

  // 매핑 생성
  const pages: PageMapping[] = [];
  let staticCount = 0;
  let dynamicCount = 0;
  let unknownCount = 0;

  console.log(`🔗 URL-소스 매칭 전략: ${matchStrategy.name}`);

  for (let i = 0; i < capturedPages.length; i++) {
    const captured = capturedPages[i];

    // 수동 매핑 우선 체크
    let sourceFile: string | null = null;
    if (manualMapping[captured.url]) {
      const manualFile = path.join(sourcePath, manualMapping[captured.url]);
      if (fs.existsSync(manualFile)) {
        sourceFile = manualFile;
      }
    }

    // 프레임워크 전략으로 매칭 (PHP Pure는 기존 함수 사용, 다른 프레임워크는 전략 패턴)
    if (!sourceFile) {
      if (activeFramework === 'php-pure') {
        sourceFile = matchUrlToSource(captured.url, sourcePath, phpFiles, manualMapping);
      } else {
        sourceFile = matchStrategy.match(captured.url, sourcePath, phpFiles);
      }
    }

    let pageType: 'static' | 'dynamic' | 'unknown' = 'unknown';
    let reasons: string[] = [];
    let queries: ExtractedQuery[] = [];

    if (sourceFile && pageAnalyses.has(sourceFile)) {
      const analysis = pageAnalyses.get(sourceFile)!;
      pageType = analysis.type;
      reasons = analysis.reason;
      queries = analysis.dbQueries;
    }

    // 카운트 업데이트
    if (pageType === 'static') staticCount++;
    else if (pageType === 'dynamic') dynamicCount++;
    else unknownCount++;

    // 출력 경로 생성 (.php 확장자 제거)
    let urlPath = new URL(captured.url).pathname || '/';
    if (urlPath.endsWith('.php')) {
      urlPath = urlPath.slice(0, -4); // .php 제거
    }
    const frontendPath = urlPath === '/' ? '/app/page.tsx' : `/app${urlPath}/page.tsx`;

    const pageMapping: PageMapping = {
      id: `page_${String(i + 1).padStart(3, '0')}`,
      capture: {
        url: captured.url,
        screenshot: captured.screenshot,
        html: captured.html,
      },
      source: {
        file: sourceFile ? path.relative(sourcePath, sourceFile) : null,
        type: pageType,
        reason: reasons,
      },
      output: {
        frontend: {
          path: frontendPath,
          type: pageType === 'dynamic' ? 'dynamic-page' : 'static-page',
        },
      },
    };

    // 동적 페이지인 경우 백엔드 정보 추가
    if (pageType === 'dynamic' && queries.length > 0) {
      const tables = [...new Set(queries.map((q) => q.table))];
      const mainTable = tables[0];
      const entityName = mainTable.charAt(0).toUpperCase() + mainTable.slice(1);

      pageMapping.database = { queries };
      pageMapping.output.backend = {
        entity: `${entityName}.java`,
        repository: `${entityName}Repository.java`,
        controller: `${entityName}Controller.java`,
        endpoint: `GET /api/${mainTable}`,
      };
      pageMapping.output.frontend.apiCalls = [`GET /api/${mainTable}`];
    }

    pages.push(pageMapping);
  }

  // 매핑 결과 생성
  const mapping: Mapping = {
    project: {
      name: path.basename(sourcePath),
      sourceUrl: sitemap.baseUrl,
      sourcePath,
    },
    framework: {
      detected: activeFramework,
      version: detectedFramework.version,
      confidence: detectedFramework.confidence,
      indicators: detectedFramework.indicators,
    },
    summary: {
      totalPages: pages.length,
      static: staticCount,
      dynamic: dynamicCount,
      unknown: unknownCount,
    },
    pages,
  };

  // DB 스키마 추출
  let dbSchema: DatabaseSchema | null = null;

  try {
    if (dbFromEnv) {
      // 환경변수에서 DATABASE_URL 읽어서 추출
      dbSchema = await extractSchema({ fromEnv: true, envPath });
    } else if (dbSchemaFile) {
      // 스키마 파일에서 추출 (prisma, sql, json 자동 감지)
      dbSchema = await extractSchema({ schemaFile: dbSchemaFile });
    } else {
      // 자동 감지 시도 (prisma/schema.prisma, schema.sql 등)
      dbSchema = await extractSchema({});
    }
  } catch (error) {
    console.warn(`⚠️ DB 스키마 추출 실패: ${(error as Error).message}`);
  }

  if (dbSchema) {
    mapping.database = {
      source: dbSchema.source,
      extractedAt: dbSchema.extractedAt,
      tables: dbSchema.tables,
    };
    console.log(`🗄️ DB 스키마: ${dbSchema.tables.length}개 테이블 (${dbSchema.source})`);
  }

  // 결과 저장
  fs.writeFileSync(outputFile, JSON.stringify(mapping, null, 2));

  // 🔴 상태 파일 업데이트 (이전 capture 정보 + source 정보 추가)
  const stateFile = path.join(capturePath, '.smart-rebuild-state.json');
  let state: Record<string, unknown> = {};
  if (fs.existsSync(stateFile)) {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  }
  state.updatedAt = new Date().toISOString();
  state.sourceDir = sourcePath;
  state.mappingFile = outputFile;
  state.framework = activeFramework;
  state.summary = { static: staticCount, dynamic: dynamicCount, unknown: unknownCount };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  console.log(`💾 상태 업데이트: ${stateFile}`);

  console.log(`\n✅ 분석 완료!`);
  console.log(`📊 정적: ${staticCount}, 동적: ${dynamicCount}, 미확인: ${unknownCount}`);
  console.log(`📁 결과: ${outputFile}`);

  // 🔴 다음 단계 안내 (직관적인 명령어 제공)
  const outputDir = path.dirname(outputFile);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📌 다음 단계:`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`\n  1️⃣  Phase 3: Generate Frontend (페이지 생성)`);
  console.log(`      /jikime:smart-rebuild generate frontend --mapping=${outputFile} --capture=${capturePath} --page 1`);
  console.log(`\n  2️⃣  전체 진행 상황 확인`);
  console.log(`      /jikime:smart-rebuild generate frontend --status --capture=${capturePath}`);
  if (dynamicCount > 0) {
    console.log(`\n  💡 동적 페이지 ${dynamicCount}개 발견 - 백엔드 연동이 필요합니다.`);
    console.log(`      /jikime:smart-rebuild backend-init --framework spring-boot`);
  }
  console.log(`\n  💾 상태 파일 업데이트됨: ${stateFile}`);
  console.log(`     (경로 정보가 저장되어 다음 단계에서 자동 완성됩니다)`);
  console.log(`\n${'─'.repeat(60)}`);

  return mapping;
}
