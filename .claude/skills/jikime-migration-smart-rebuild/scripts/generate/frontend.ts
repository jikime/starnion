/**
 * Frontend Generation Guide Generator
 *
 * 이 스크립트는 실제 React 코드를 생성하지 않습니다.
 * 대신 Claude Code가 각 페이지를 직접 생성할 수 있도록 가이드 정보를 준비합니다.
 *
 * 워크플로우:
 * 1. 이 스크립트 실행 → frontend-guide.json 생성
 * 2. Claude Code가 가이드를 읽고 한 페이지씩:
 *    a. HTML 파일 읽기 (구조, 텍스트, 이미지 URL 추출)
 *    b. 스크린샷 읽기 (시각적 레이아웃, 색상, 간격 확인)
 *    c. React/Next.js 코드 직접 작성
 */

import * as fs from 'fs';
import * as path from 'path';
import { extractContentFromHtml, ExtractedContent } from './html-extractor';

interface GenerateFrontendOptions {
  mappingFile?: string;
  sitemapFile?: string;  // sitemap.json 직접 사용
  outputDir: string;
  captureDir: string;
  framework?: string;
}

interface PageInfo {
  id: string;
  url: string;
  template: string;
  title: string;

  // 파일 경로 (Claude Code가 읽을 파일들)
  files: {
    html: string;       // HTML 파일 경로
    screenshot: string; // 스크린샷 경로
  };

  // HTML에서 추출한 콘텐츠 요약 (참고용)
  contentSummary: {
    headings: string[];
    paragraphCount: number;
    imageCount: number;
    formCount: number;
    tableCount: number;
    listCount: number;
  };

  // 이미지 URL 목록 (sitemap.json에서)
  images: string[];

  // 생성할 파일 경로
  outputPath: string;
}

interface FrontendGuide {
  generatedAt: string;
  captureDir: string;
  outputDir: string;
  framework: string;
  totalPages: number;

  // Claude Code를 위한 지침
  instructions: {
    critical: string[];
    workflow: string[];
  };

  // 페이지 목록
  pages: PageInfo[];
}

/**
 * URL을 Next.js App Router 경로로 변환
 */
function urlToAppPath(url: string, template: string): string {
  try {
    const urlObj = new URL(url);
    let pathname = template || urlObj.pathname;

    // index 페이지 처리
    if (pathname === '/' || pathname === '/index.php' || pathname === '/index.html') {
      return 'app/page.tsx';
    }

    // .php, .html 확장자 제거
    pathname = pathname.replace(/\.(php|html|htm)$/, '');

    // 경로 정리
    pathname = pathname.replace(/^\//, '').replace(/\/$/, '');

    if (!pathname) {
      return 'app/page.tsx';
    }

    return `app/${pathname}/page.tsx`;
  } catch {
    return 'app/page.tsx';
  }
}

/**
 * Frontend Guide 생성
 */
export async function generateFrontendGuide(options: GenerateFrontendOptions): Promise<FrontendGuide> {
  const { sitemapFile, mappingFile, outputDir, captureDir, framework = 'nextjs16' } = options;

  console.log('📋 Frontend Guide 생성 시작');
  console.log(`   캡처 디렉토리: ${captureDir}`);
  console.log(`   출력 디렉토리: ${outputDir}`);

  // sitemap.json 또는 mapping.json 로드
  let pages: any[] = [];
  let baseUrl = '';

  if (sitemapFile && fs.existsSync(sitemapFile)) {
    const sitemap = JSON.parse(fs.readFileSync(sitemapFile, 'utf-8'));
    pages = sitemap.pages || [];
    baseUrl = sitemap.baseUrl || '';
    console.log(`   sitemap.json 로드: ${pages.length}개 페이지`);
  } else if (mappingFile && fs.existsSync(mappingFile)) {
    const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf-8'));
    pages = mapping.pages || [];
    baseUrl = mapping.project?.sourceUrl || '';
    console.log(`   mapping.json 로드: ${pages.length}개 페이지`);
  } else {
    throw new Error('sitemap.json 또는 mapping.json이 필요합니다.');
  }

  // 출력 디렉토리 생성
  fs.mkdirSync(outputDir, { recursive: true });

  const pageInfos: PageInfo[] = [];

  for (const page of pages) {
    // sitemap.json 형식과 mapping.json 형식 모두 지원
    const url = page.url || page.capture?.url || '';
    const template = page.template || '';
    const htmlFile = page.html || page.capture?.html || '';
    const screenshotFile = page.screenshot || page.capture?.screenshot || '';
    const title = page.title || '';
    const images = page.images || [];

    const htmlPath = path.join(captureDir, htmlFile);
    const screenshotPath = path.join(captureDir, screenshotFile);

    // HTML에서 콘텐츠 추출 (요약용)
    let contentSummary = {
      headings: [] as string[],
      paragraphCount: 0,
      imageCount: 0,
      formCount: 0,
      tableCount: 0,
      listCount: 0,
    };

    if (fs.existsSync(htmlPath)) {
      try {
        const extracted = extractContentFromHtml(htmlPath, baseUrl || url);
        contentSummary = {
          headings: extracted.headings.slice(0, 5).map(h => `H${h.level}: ${h.text.substring(0, 50)}`),
          paragraphCount: extracted.paragraphs.length,
          imageCount: extracted.images.length,
          formCount: extracted.forms.length,
          tableCount: extracted.tables.length,
          listCount: extracted.lists.length,
        };
      } catch (error) {
        console.warn(`   ⚠️ HTML 분석 실패: ${htmlFile}`);
      }
    }

    const outputPath = urlToAppPath(url, template);

    pageInfos.push({
      id: htmlFile.replace('.html', ''),
      url,
      template,
      title,
      files: {
        html: htmlPath,
        screenshot: screenshotPath,
      },
      contentSummary,
      images,
      outputPath,
    });

    console.log(`   ✓ ${template || url} → ${outputPath}`);
  }

  const guide: FrontendGuide = {
    generatedAt: new Date().toISOString(),
    captureDir,
    outputDir,
    framework,
    totalPages: pageInfos.length,

    instructions: {
      critical: [
        '❌ 번역 금지: 원본 텍스트를 절대 번역하지 마세요. 영어는 영어로, 한글은 한글로 그대로 유지',
        '❌ 내용 창작 금지: HTML에서 추출한 실제 콘텐츠만 사용. 상상으로 텍스트를 만들지 마세요',
        '✅ 이미지 URL 사용: images 배열에 있는 실제 이미지 URL 또는 HTML의 <img src="...">를 그대로 사용',
        '✅ 레이아웃 복제: 스크린샷의 시각적 레이아웃을 최대한 동일하게 재현',
        '✅ HTML 구조 참고: <header>, <nav>, <main>, <aside>, <footer> 구조와 CSS 클래스 참고',
      ],
      workflow: [
        '1. 페이지별로 순차 처리 (한 번에 하나씩)',
        '2. HTML 파일 읽기 (Read 도구) - 구조, 텍스트, 이미지 URL 추출',
        '3. 스크린샷 읽기 (Read 도구) - 시각적 레이아웃, 색상, 간격 확인',
        '4. React/Next.js 코드 작성 (Write 도구) - outputPath에 저장',
        '5. 결과 확인 후 다음 페이지로',
      ],
    },

    pages: pageInfos,
  };

  // frontend-guide.json 저장
  const guidePath = path.join(outputDir, 'frontend-guide.json');
  fs.writeFileSync(guidePath, JSON.stringify(guide, null, 2));
  console.log(`\n✅ Frontend Guide 생성 완료!`);
  console.log(`📄 가이드 파일: ${guidePath}`);
  console.log(`📊 총 ${pageInfos.length}개 페이지`);
  console.log(`\n💡 다음 단계: Claude Code가 가이드를 읽고 각 페이지를 직접 생성합니다.`);

  return guide;
}

/**
 * Next.js 프로젝트 기본 구조 생성
 */
export function createNextjsStructure(outputDir: string): void {
  console.log('\n📁 Next.js 프로젝트 구조 생성...');

  // app 디렉토리
  const appDir = path.join(outputDir, 'app');
  fs.mkdirSync(appDir, { recursive: true });

  // layout.tsx
  const layoutContent = `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Smart Rebuild App',
  description: 'Generated by Smart Rebuild',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
`;
  fs.writeFileSync(path.join(appDir, 'layout.tsx'), layoutContent);
  console.log('   ✓ app/layout.tsx');

  // globals.css (Tailwind v4)
  const globalsCssContent = `@import "tailwindcss";

/*
 * Smart Rebuild - Global Styles
 *
 * 이 파일은 기본 템플릿입니다.
 * 스크린샷에서 추출한 색상을 아래에 추가하세요.
 */

@theme {
  /* Primary Colors - 스크린샷에서 추출한 색상으로 교체하세요 */
  --color-primary: #3b82f6;
  --color-primary-dark: #2563eb;
  --color-primary-light: #60a5fa;

  /* Secondary Colors */
  --color-secondary: #6b7280;

  /* Background Colors */
  --color-bg-main: #ffffff;
  --color-bg-alt: #f9fafb;

  /* Text Colors */
  --color-text-primary: #111827;
  --color-text-secondary: #6b7280;
}
`;
  fs.writeFileSync(path.join(appDir, 'globals.css'), globalsCssContent);
  console.log('   ✓ app/globals.css');

  // public 디렉토리
  const publicDir = path.join(outputDir, 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  console.log('   ✓ public/');

  // package.json
  const packageJson = {
    name: 'smart-rebuild-app',
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'next dev --turbopack --port 3893',
      build: 'next build',
      start: 'next start --port 3893',
      lint: 'next lint',
    },
    dependencies: {
      next: '^15.0.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
    devDependencies: {
      '@types/node': '^20',
      '@types/react': '^19',
      '@types/react-dom': '^19',
      typescript: '^5',
      tailwindcss: '^4.0.0',
    },
  };
  fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify(packageJson, null, 2));
  console.log('   ✓ package.json');

  // tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: 'ES2017',
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      plugins: [{ name: 'next' }],
      paths: {
        '@/*': ['./*'],
      },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  };
  fs.writeFileSync(path.join(outputDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
  console.log('   ✓ tsconfig.json');

  // next.config.ts
  const nextConfig = `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 외부 이미지 도메인 허용 (캡처된 사이트의 이미지)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
`;
  fs.writeFileSync(path.join(outputDir, 'next.config.ts'), nextConfig);
  console.log('   ✓ next.config.ts');

  console.log('\n✅ Next.js 프로젝트 구조 생성 완료!');
}

// CLI 실행
if (require.main === module) {
  const args = process.argv.slice(2);

  // 인자 파싱
  let sitemapFile = '';
  let mappingFile = '';
  let outputDir = './frontend-output';
  let captureDir = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sitemap' && args[i + 1]) {
      sitemapFile = args[++i];
    } else if (args[i] === '--mapping' && args[i + 1]) {
      mappingFile = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      outputDir = args[++i];
    } else if (args[i] === '--capture' && args[i + 1]) {
      captureDir = args[++i];
    }
  }

  // captureDir 기본값
  if (!captureDir) {
    if (sitemapFile) {
      captureDir = path.dirname(sitemapFile);
    } else if (mappingFile) {
      captureDir = path.dirname(mappingFile);
    }
  }

  if (!sitemapFile && !mappingFile) {
    console.log('Usage: npx ts-node frontend.ts --sitemap <sitemap.json> --output <dir>');
    console.log('   or: npx ts-node frontend.ts --mapping <mapping.json> --output <dir>');
    process.exit(1);
  }

  // Next.js 구조 먼저 생성
  createNextjsStructure(outputDir);

  // 가이드 생성
  generateFrontendGuide({
    sitemapFile,
    mappingFile,
    outputDir,
    captureDir,
  }).catch(console.error);
}
