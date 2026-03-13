import * as fs from 'fs';
import * as path from 'path';

interface ConnectOptions {
  mappingFile: string;
  frontendDir: string;
  apiBaseUrl: string;
}

interface PageMapping {
  id: string;
  database?: {
    queries: Array<{
      table: string;
    }>;
  };
  output: {
    frontend: {
      path: string;
      type: 'static-page' | 'dynamic-page';
      apiCalls?: string[];
    };
  };
}

interface Mapping {
  pages: PageMapping[];
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
 * Mock 데이터가 있는 페이지를 실제 API 호출로 교체
 */
function replaceMockWithApi(
  content: string,
  entityName: string,
  apiEndpoint: string,
  apiBaseUrl: string
): string {
  const varName = entityName.charAt(0).toLowerCase() + entityName.slice(1);

  // Mock 데이터 블록 제거
  const mockDataPattern = new RegExp(
    `// ⚠️ MOCK DATA[\\s\\S]*?const mock${entityName}s[\\s\\S]*?\\];`,
    'g'
  );
  content = content.replace(mockDataPattern, '');

  // Mock 함수를 실제 API 호출로 교체
  const mockFunctionPattern = new RegExp(
    `// ⚠️ MOCK FUNCTION[\\s\\S]*?async function get${entityName}s\\(\\)[\\s\\S]*?\\}`,
    'g'
  );

  const realApiFunction = `async function get${entityName}s(): Promise<${entityName}[]> {
  const res = await fetch(\`${apiBaseUrl}${apiEndpoint}\`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('Failed to fetch ${varName}s');
  }

  return res.json();
}`;

  content = content.replace(mockFunctionPattern, realApiFunction);

  // Mock Data 배너 제거
  const bannerPattern = /\s*{\/\* Mock Data Banner \*\/}[\s\S]*?<\/div>/g;
  content = content.replace(bannerPattern, '');

  // 헤더 주석 업데이트
  content = content.replace(
    '// Type: Dynamic Page (Mock Data)',
    '// Type: Dynamic Page (Connected to API)'
  );
  content = content.replace(
    '// TODO: Replace mock data with real API call after backend is ready',
    '// ✅ Connected to backend API'
  );

  return content;
}

/**
 * Frontend와 Backend 연동 메인 함수
 */
export async function connectFrontendToBackend(options: ConnectOptions): Promise<void> {
  const { mappingFile, frontendDir, apiBaseUrl } = options;

  console.log('🔗 Frontend-Backend 연동 시작');

  // 매핑 파일 로드
  if (!fs.existsSync(mappingFile)) {
    throw new Error(`Mapping file not found: ${mappingFile}`);
  }

  const mapping: Mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf-8'));
  console.log(`📋 매핑 로드`);

  let connectedCount = 0;
  let skippedCount = 0;

  for (const page of mapping.pages) {
    // 동적 페이지만 처리
    if (page.output.frontend.type !== 'dynamic-page') {
      skippedCount++;
      continue;
    }

    const frontendPath = path.join(frontendDir, page.output.frontend.path);

    if (!fs.existsSync(frontendPath)) {
      console.log(`   ⚠️ 파일 없음: ${page.output.frontend.path}`);
      continue;
    }

    // 파일 읽기
    let content = fs.readFileSync(frontendPath, 'utf-8');

    // Mock 데이터가 있는지 확인
    if (!content.includes('MOCK DATA') && !content.includes('MOCK FUNCTION')) {
      console.log(`   ⏭️ 이미 연동됨: ${page.output.frontend.path}`);
      continue;
    }

    // API 정보 추출
    const apiEndpoint = page.output.frontend.apiCalls?.[0] || '/api/items';
    const table = page.database?.queries?.[0]?.table || 'Item';
    const entityName = toEntityName(table);

    // Mock → API 교체
    content = replaceMockWithApi(content, entityName, apiEndpoint, apiBaseUrl);

    // 파일 저장
    fs.writeFileSync(frontendPath, content);
    connectedCount++;
    console.log(`   ✓ 연동 완료: ${page.output.frontend.path} → ${apiEndpoint}`);
  }

  // .env.local 파일 생성/업데이트
  const envPath = path.join(frontendDir, '.env.local');
  const envContent = `# API Configuration
API_URL=${apiBaseUrl}
NEXT_PUBLIC_API_URL=${apiBaseUrl}
`;
  fs.writeFileSync(envPath, envContent);

  console.log(`\n✅ 연동 완료!`);
  console.log(`🔗 연동된 페이지: ${connectedCount}개`);
  console.log(`⏭️ 스킵 (정적 페이지): ${skippedCount}개`);
  console.log(`📁 Frontend: ${frontendDir}`);
  console.log(`🌐 API Base URL: ${apiBaseUrl}`);
  console.log(`\n💡 다음 단계:`);
  console.log(`   1. Backend 실행: cd ${path.dirname(frontendDir)}/backend && mvn spring-boot:run`);
  console.log(`   2. Frontend 실행: cd ${frontendDir} && npm run dev`);
}
