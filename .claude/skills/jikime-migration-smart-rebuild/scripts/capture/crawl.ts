import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

interface CaptureOptions {
  outputDir: string;
  maxPages?: number;
  concurrency?: number;
  authFile?: string;
  exclude?: string[];
  timeout?: number;
  login?: boolean;  // 로그인 필요 시 true
  dedupeByTemplate?: boolean;  // 템플릿 기준 중복 제거 (기본: true)
  prefetch?: boolean;  // 🔴 Lazy Capture: true면 모든 페이지 미리 캡처, false면 링크만 수집 (기본: false)
}

interface PageResult {
  id?: number;       // 페이지 번호 (1-based, 저장 시 할당)
  url: string;
  template?: string;  // 템플릿 패턴 (예: /customer/nt_list.php)
  urlPattern?: string;  // URL 패턴 (예: /customer/nt_list.php?page={page})
  title: string;
  h1: string;
  captured: boolean;  // 🔴 Lazy Capture: HTML + 스크린샷 캡처 여부
  screenshot: string | null;  // 캡처되면 파일명, 미캡처 시 null
  html: string | null;        // 캡처되면 파일명, 미캡처 시 null
  capturedAt: string | null;  // 캡처 시간
  links: string[];
  images: string[];  // 페이지 내 이미지 URL 목록
  skippedUrls?: string[];  // 같은 템플릿으로 스킵된 URL들
}

interface Sitemap {
  baseUrl: string;
  createdAt: string;       // sitemap 생성 시간
  updatedAt: string;       // 마지막 업데이트 시간
  totalPages: number;
  totalTemplates: number;  // 고유 템플릿 수
  skippedUrls: number;     // 스킵된 URL 수
  dedupeByTemplate: boolean;
  summary: {
    pending: number;
    in_progress: number;
    completed: number;
    captured: number;      // 🔴 Lazy Capture: 캡처 완료된 페이지 수
  };
  pages: PageResult[];
}

/**
 * 사용자 입력 대기
 */
function waitForUserInput(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * URL을 안전한 파일명으로 변환
 */
function urlToFilename(url: string): string {
  return url
    .replace(/https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 80);
}

/**
 * URL에서 템플릿 추출 (쿼리 파라미터 완전 무시)
 * 예: /customer/nt_view.php?idx=644&page=1 → /customer/nt_view.php
 * 예: /review/sty_list.php?s_orderby=sty_idx&page=7 → /review/sty_list.php
 */
function extractTemplate(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname;  // 쿼리 파라미터 완전 무시
  } catch {
    // URL 파싱 실패 시 ? 이전 부분만 반환
    return url.split('?')[0];
  }
}

/**
 * URL 패턴 추출 (파라미터 키만 플레이스홀더로)
 * 예: /customer/nt_view.php?idx=644&page=1 → /customer/nt_view.php?idx={idx}&page={page}
 */
function extractUrlPattern(url: string): string {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    const patternParams: string[] = [];

    params.forEach((_, key) => {
      patternParams.push(`${key}={${key}}`);
    });

    if (patternParams.length > 0) {
      return `${urlObj.pathname}?${patternParams.join('&')}`;
    }
    return urlObj.pathname;
  } catch {
    return url;
  }
}

/**
 * 쿼리 파라미터가 있는지 확인
 */
function hasQueryParams(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.search.length > 0;
  } catch {
    return url.includes('?');
  }
}

/**
 * Lazy loading 이미지를 로드하기 위한 자동 스크롤
 */
async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const maxHeight = 50000;

      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= document.body.scrollHeight || totalHeight >= maxHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
    });
  });
}

/**
 * 단일 페이지 캡처 (또는 링크만 수집)
 * @param prefetch - true: 스크린샷 + HTML 캡처, false: 링크만 수집 (Lazy Capture)
 */
async function capturePage(
  context: BrowserContext,
  url: string,
  baseUrl: string,
  outputDir: string,
  timeout: number,
  prefetch: boolean = false  // 🔴 Lazy Capture: 기본값 false (링크만 수집)
): Promise<PageResult | null> {
  const page = await context.newPage();

  try {
    console.log(prefetch ? `📸 캡처 중: ${url}` : `🔗 링크 수집 중: ${url}`);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: timeout || 60000,
    });

    // 추가 로딩 대기
    await page.waitForTimeout(2000);

    // Lazy loading 해결 (prefetch 모드에서만 전체 스크롤)
    if (prefetch) {
      await autoScroll(page);
      await page.waitForTimeout(500);
    }

    const filename = urlToFilename(url);
    let screenshotFile: string | null = null;
    let htmlFile: string | null = null;
    let capturedAt: string | null = null;

    // 🔴 Lazy Capture: prefetch가 true일 때만 스크린샷 + HTML 캡처
    if (prefetch) {
      // 스크린샷 저장
      await page.screenshot({
        path: path.join(outputDir, `${filename}.png`),
        fullPage: true,
      });

      // HTML 저장
      const html = await page.content();
      fs.writeFileSync(path.join(outputDir, `${filename}.html`), html);

      screenshotFile = `${filename}.png`;
      htmlFile = `${filename}.html`;
      capturedAt = new Date().toISOString();
    }

    // 페이지 정보 추출
    const pageInfo = await page.evaluate((base: string) => {
      const title = document.title;
      const h1 = document.querySelector('h1')?.innerText || '';

      // 링크 추출
      const links = [...document.querySelectorAll('a[href]')]
        .map((a) => (a as HTMLAnchorElement).href)
        .filter(
          (href) =>
            href.startsWith(base) &&
            !href.includes('#') &&
            !href.match(/\.(pdf|jpg|png|gif|zip|doc|docx)$/i) &&
            !href.includes('mailto:') &&
            !href.includes('tel:')
        );

      // 이미지 URL 추출 (절대 경로로 변환)
      const images = [...document.querySelectorAll('img[src]')]
        .map((img) => {
          const src = (img as HTMLImageElement).src;
          // 이미 절대 경로이거나 data URL인 경우 그대로 반환
          if (src.startsWith('http') || src.startsWith('data:')) {
            return src;
          }
          // 상대 경로를 절대 경로로 변환
          try {
            return new URL(src, base).href;
          } catch {
            return src;
          }
        })
        .filter((src) =>
          src.startsWith('http') &&
          !src.includes('data:') &&
          src.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)
        );

      return { title, h1, links: [...new Set(links)], images: [...new Set(images)] };
    }, baseUrl);

    return {
      url,
      title: pageInfo.title,
      h1: pageInfo.h1,
      captured: prefetch,  // 🔴 Lazy Capture 상태
      screenshot: screenshotFile,
      html: htmlFile,
      capturedAt: capturedAt,
      links: pageInfo.links,
      images: pageInfo.images,
    };
  } catch (error) {
    console.error(`❌ 에러: ${url} - ${(error as Error).message}`);
    return null;
  } finally {
    await page.close();
  }
}

/**
 * 🔴 단일 페이지 캡처 (generate 단계에서 호출)
 * Lazy Capture 모드에서 특정 페이지만 캡처할 때 사용
 */
export async function captureSinglePage(
  url: string,
  outputDir: string,
  authFile?: string,
  timeout: number = 30000
): Promise<{ screenshot: string; html: string; capturedAt: string } | null> {
  const browser = await chromium.launch({ headless: true });

  const contextOptions: { storageState?: string } = {};
  if (authFile && fs.existsSync(authFile)) {
    contextOptions.storageState = authFile;
  }
  const context = await browser.newContext(contextOptions);

  try {
    const page = await context.newPage();

    console.log(`📸 페이지 캡처 중: ${url}`);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: timeout,
    });

    await page.waitForTimeout(2000);
    await autoScroll(page);
    await page.waitForTimeout(500);

    const filename = urlToFilename(url);

    // 스크린샷 저장
    await page.screenshot({
      path: path.join(outputDir, `${filename}.png`),
      fullPage: true,
    });

    // HTML 저장
    const html = await page.content();
    fs.writeFileSync(path.join(outputDir, `${filename}.html`), html);

    await page.close();

    return {
      screenshot: `${filename}.png`,
      html: `${filename}.html`,
      capturedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`❌ 캡처 에러: ${url} - ${(error as Error).message}`);
    return null;
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * 사이트 크롤링 및 캡처
 */
export async function crawlAndCapture(
  startUrl: string,
  options: CaptureOptions
): Promise<Sitemap> {
  const {
    outputDir,
    maxPages = 100,
    concurrency = 5,
    authFile,
    exclude = [],
    timeout = 30000,
    login = false,
    dedupeByTemplate = true,  // 기본값: 템플릿 기준 중복 제거 활성화
    prefetch = false,  // 🔴 Lazy Capture: 기본값 false (링크만 수집)
  } = options;

  // 출력 디렉토리 생성
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const baseUrl = new URL(startUrl).origin;
  const visited = new Set<string>();
  const visitedTemplates = new Set<string>();  // 캡처 완료된 템플릿
  const queuedTemplates = new Set<string>();   // 큐에 있는 템플릿 (아직 캡처 안 됨)
  const skippedByTemplate = new Map<string, string[]>();  // 템플릿별 스킵된 URL 기록
  const toVisit: string[] = [startUrl];
  const toVisitSet = new Set<string>([startUrl]);  // O(1) 조회용
  const results: PageResult[] = [];

  // 시작 URL의 템플릿을 큐에 등록
  const startTemplate = extractTemplate(startUrl);
  queuedTemplates.add(startTemplate);

  console.log(`\n🔧 [DEBUG] 템플릿 중복 제거 버전: v2.0`);
  console.log(`🔧 [DEBUG] 시작 URL: ${startUrl}`);
  console.log(`🔧 [DEBUG] 시작 템플릿: ${startTemplate}`);
  console.log(`🚀 크롤링 시작: ${baseUrl}`);
  console.log(`📁 출력 디렉토리: ${outputDir}`);
  console.log(`📄 최대 페이지: ${maxPages}`);
  console.log(`🔄 템플릿 중복 제거: ${dedupeByTemplate ? '활성화' : '비활성화'}`);
  console.log(`📸 캡처 모드: ${prefetch ? '즉시 캡처 (--prefetch)' : '🔴 Lazy Capture (링크만 수집)'}`);

  let browser: Browser;
  let context: BrowserContext;
  const sessionFile = path.join(outputDir, 'auth.json');

  // 로그인 모드: 브라우저 열고 사용자 로그인 대기
  if (login) {
    console.log(`\n🔐 로그인 모드 활성화`);
    browser = await chromium.launch({ headless: false });
    context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(startUrl);
    console.log(`📍 브라우저에서 로그인을 완료하세요.`);

    await waitForUserInput('✅ 로그인 완료 후 Enter를 누르세요...');

    // 세션 저장
    await context.storageState({ path: sessionFile });
    console.log(`💾 세션 저장 완료: ${sessionFile}`);
    await page.close();

    // headless 모드로 재시작하여 캡처 진행
    await context.close();
    await browser.close();

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ storageState: sessionFile });
    console.log(`\n🚀 캡처 시작...`);
  } else {
    browser = await chromium.launch({ headless: true });

    // 기존 인증 세션 사용
    const contextOptions: { storageState?: string } = {};
    if (authFile && fs.existsSync(authFile)) {
      contextOptions.storageState = authFile;
      console.log(`🔐 인증 세션 사용: ${authFile}`);
    }
    context = await browser.newContext(contextOptions);
  }

  // URL 제외 패턴 체크
  const shouldExclude = (url: string): boolean => {
    return exclude.some((pattern) => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return regex.test(url);
    });
  };

  while (toVisit.length > 0 && results.length < maxPages) {
    // 배치 처리 전에 먼저 템플릿 중복 제거 (동기적으로!)
    const batch: string[] = [];
    while (toVisit.length > 0 && batch.length < concurrency) {
      const url = toVisit.shift()!;
      toVisitSet.delete(url);

      if (visited.has(url) || shouldExclude(url)) continue;

      const template = extractTemplate(url);

      // 템플릿 기준 중복 제거 (쿼리 파라미터 무시)
      if (dedupeByTemplate) {
        if (visitedTemplates.has(template)) {
          // 같은 템플릿의 다른 URL은 스킵하고 기록만
          console.log(`⏭️  [SKIP] 중복 템플릿: ${template} (URL: ${url})`);
          if (!skippedByTemplate.has(template)) {
            skippedByTemplate.set(template, []);
          }
          skippedByTemplate.get(template)!.push(url);
          continue;
        }
        console.log(`✅ [NEW] 신규 템플릿: ${template}`);
        visitedTemplates.add(template);
        queuedTemplates.delete(template);  // 큐에서 캡처됨으로 이동
      }

      visited.add(url);
      batch.push(url);
    }

    if (batch.length === 0) continue;

    const promises = batch.map(async (url) => {
      const template = extractTemplate(url);
      // 🔴 Lazy Capture: prefetch 파라미터 전달
      const result = await capturePage(context, url, baseUrl, outputDir, timeout, prefetch);

      // 결과에 템플릿 정보 추가
      if (result) {
        result.template = template;
        result.urlPattern = hasQueryParams(url) ? extractUrlPattern(url) : template;
      }

      return result;
    });

    const batchResults = await Promise.all(promises);

    for (const result of batchResults) {
      if (!result) continue;

      // 스킵된 URL 정보 추가
      const skipped = skippedByTemplate.get(result.template);
      if (skipped && skipped.length > 0) {
        result.skippedUrls = [...skipped];
      }

      // 페이지 번호 할당 (1-based)
      result.id = results.length + 1;

      results.push(result);

      // 새로운 링크 추가 (템플릿 중복은 큐에 넣기 전에 필터링)
      for (const link of result.links) {
        if (visited.has(link) || toVisitSet.has(link) || shouldExclude(link)) continue;

        const linkTemplate = extractTemplate(link);

        // 템플릿 중복 제거: 이미 캡처했거나 큐에 있는 템플릿은 추가하지 않음
        if (dedupeByTemplate && (visitedTemplates.has(linkTemplate) || queuedTemplates.has(linkTemplate))) {
          // 스킵된 URL 기록
          if (!skippedByTemplate.has(linkTemplate)) {
            skippedByTemplate.set(linkTemplate, []);
          }
          skippedByTemplate.get(linkTemplate)!.push(link);
          // 첫 5개만 로그 출력 (너무 많으면 지저분해지므로)
          if (skippedByTemplate.get(linkTemplate)!.length <= 5) {
            console.log(`   ⏭️  큐 스킵: ${linkTemplate} (이미 ${visitedTemplates.has(linkTemplate) ? '캡처됨' : '큐에 있음'})`);
          }
          continue;
        }

        toVisit.push(link);
        toVisitSet.add(link);
        if (dedupeByTemplate) {
          queuedTemplates.add(linkTemplate);
        }
      }
    }

    console.log(`   진행: ${results.length}개 캡처, ${visitedTemplates.size}개 템플릿, ${toVisit.length}개 대기`);
  }

  await context.close();
  await browser.close();

  // 스킵된 URL 총 개수 계산
  let totalSkipped = 0;
  skippedByTemplate.forEach((urls) => {
    totalSkipped += urls.length;
  });

  // sitemap.json 저장 (페이지 번호 확정)
  const pagesWithId = results.map((page, index) => ({
    ...page,
    id: page.id ?? index + 1,  // 1-based 페이지 번호
    status: 'pending' as const,  // 초기 상태
  }));

  // 🔴 Lazy Capture: summary 계산
  const capturedCount = pagesWithId.filter(p => p.captured).length;

  const now = new Date().toISOString();
  const sitemap: Sitemap = {
    baseUrl,
    createdAt: now,
    updatedAt: now,
    totalPages: pagesWithId.length,
    totalTemplates: visitedTemplates.size,
    skippedUrls: totalSkipped,
    dedupeByTemplate,
    summary: {
      pending: pagesWithId.length,
      in_progress: 0,
      completed: 0,
      captured: capturedCount,  // 🔴 Lazy Capture: 캡처 완료된 페이지 수
    },
    pages: pagesWithId,
  };

  fs.writeFileSync(
    path.join(outputDir, 'sitemap.json'),
    JSON.stringify(sitemap, null, 2)
  );

  // 🔴 상태 파일 저장 (다음 단계에서 경로 정보 재사용)
  const stateFile = path.join(outputDir, '.smart-rebuild-state.json');
  const state = {
    version: '1.0',
    createdAt: now,
    updatedAt: now,
    captureDir: outputDir,
    baseUrl: baseUrl,
    totalPages: pagesWithId.length,
    // source는 analyze 단계에서 추가됨
  };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  console.log(`💾 상태 저장: ${stateFile}`);

  console.log(`\n✅ 크롤링 완료!`);
  console.log(`📊 총 ${results.length}개 페이지 발견 (${visitedTemplates.size}개 고유 템플릿)`);
  if (prefetch) {
    console.log(`📸 ${capturedCount}개 페이지 캡처 완료 (--prefetch 모드)`);
  } else {
    console.log(`🔗 Lazy Capture 모드: 링크만 수집됨 (캡처는 generate 단계에서 수행)`);
  }
  if (dedupeByTemplate && totalSkipped > 0) {
    console.log(`⏭️  ${totalSkipped}개 중복 URL 스킵 (템플릿 기준 중복 제거)`);
  }
  console.log(`📁 결과: ${outputDir}/sitemap.json`);

  // 🔴 다음 단계 안내 (직관적인 명령어 제공)
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📌 다음 단계:`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`\n  1️⃣  Phase 2: Analyze (레거시 소스 분석)`);
  console.log(`      /jikime:smart-rebuild analyze --source=<소스경로> --capture=${outputDir}`);
  console.log(`      예: /jikime:smart-rebuild analyze --source=./public_html --capture=${outputDir}`);
  console.log(`\n  2️⃣  Phase 3: Generate Frontend (소스 분석 없이 바로 페이지 생성)`);
  console.log(`      /jikime:smart-rebuild generate frontend --capture=${outputDir} --page 1`);
  console.log(`\n  💡 상태 파일 저장됨: ${outputDir}/.smart-rebuild-state.json`);
  console.log(`     (다음 단계에서 --capture 경로 자동 완성에 사용)`);
  console.log(`\n${'─'.repeat(60)}`);

  return sitemap;
}

