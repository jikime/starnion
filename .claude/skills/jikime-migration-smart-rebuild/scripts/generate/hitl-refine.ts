/**
 * HITL (Human-in-the-Loop) Visual Refinement for Smart Rebuild
 *
 * Claude Code 연동 UI 보정 워크플로우
 * - 스크립트는 캡처만 수행
 * - Claude Code가 AskUserQuestion으로 사용자 확인
 * - sitemap.json 기반 페이지/섹션 동적 로드
 *
 * 사용법:
 *   npx ts-node scripts/generate/hitl-refine.ts --capture <capture-dir>
 *   npx ts-node scripts/generate/hitl-refine.ts --capture ./capture --page 1
 *   npx ts-node scripts/generate/hitl-refine.ts --capture ./capture --responsive
 *   npx ts-node scripts/generate/hitl-refine.ts --capture ./capture --status
 *   npx ts-node scripts/generate/hitl-refine.ts --capture ./capture --approve=1
 *   npx ts-node scripts/generate/hitl-refine.ts --capture ./capture --skip=1
 *   npx ts-node scripts/generate/hitl-refine.ts --capture ./capture --reset
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// Types
// ============================================================

interface StyleComparison {
  property: string;
  original: string;
  local: string;
  status: 'match' | 'mismatch' | 'missing';
}

interface DOMComparison {
  selector: string;
  originalExists: boolean;
  localExists: boolean;
  styles: StyleComparison[];
  textMatch: boolean;
  originalText?: string;
  localText?: string;
  childCount: { original: number; local: number };
}

interface ComparisonHints {
  overallMatch: number;  // 0-100 percentage
  issues: string[];
  suggestions: string[];
  details: DOMComparison[];
}

interface Viewport {
  name: string;
  width: number;
  height: number;
  label: string;
}

interface SitemapPage {
  id?: number;         // 선택적 - 없으면 index + 1 사용
  url: string;         // 페이지 URL (필수)
  title: string;
  path?: string;       // URL path (없으면 url에서 추출)
  status?: 'pending' | 'in_progress' | 'completed' | 'skipped';
  sections?: SitemapSection[];
  html?: string;       // HTML 파일명 (예: www_example_com_.html)
  screenshot?: string; // 스크린샷 파일명 (예: www_example_com_.png)
}

interface SitemapSection {
  id: string;
  name: string;
  label: string;
  selector: string;
}

interface Sitemap {
  baseUrl: string;
  localUrl?: string;
  capturedAt: string;
  pages: SitemapPage[];
}

interface HITLSection {
  id: string;
  name: string;
  label: string;
  selector: string;
  status: 'pending' | 'in_progress' | 'done' | 'skipped';
  retries: number;
  lastCaptured?: string;
}

interface HITLState {
  pageId: number;
  pageUrl: string;
  pageTitle: string;
  localUrl: string;
  sections: HITLSection[];
  currentIndex: number;
  startedAt: string;
  updatedAt: string;
}

// ============================================================
// Configuration
// ============================================================

const VIEWPORTS: Viewport[] = [
  { name: 'desktop', width: 1920, height: 1080, label: '데스크톱 (1920x1080)' },
  { name: 'tablet', width: 768, height: 1024, label: '태블릿 (768x1024)' },
  { name: 'mobile', width: 375, height: 812, label: '모바일 (375x812)' },
];

const DEFAULT_LOCAL_URL = 'http://localhost:3893';
const MAX_RETRIES = 5;

// ============================================================
// Utility Functions
// ============================================================

function parseArgs(): {
  captureDir: string;
  pageId?: number;
  sectionId?: string;
  responsive: boolean;
  status: boolean;
  approve?: string;
  skip?: string;
  reset: boolean;
} {
  const args = process.argv.slice(2);

  // Helper: --key=value 또는 --key value 형식 모두 지원
  const getArgValue = (key: string, defaultValue: string): string => {
    // --key=value 형식 확인
    const equalArg = args.find(a => a.startsWith(`${key}=`));
    if (equalArg) {
      return equalArg.split('=')[1];
    }
    // --key value 형식 확인
    const idx = args.indexOf(key);
    if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
      return args[idx + 1];
    }
    return defaultValue;
  };

  const captureDir = getArgValue('--capture', './capture');
  const pageArg = args.find(a => a.startsWith('--page='))?.split('=')[1];
  const sectionArg = args.find(a => a.startsWith('--section='))?.split('=')[1];
  const approveArg = args.find(a => a.startsWith('--approve='))?.split('=')[1];
  const skipArg = args.find(a => a.startsWith('--skip='))?.split('=')[1];

  return {
    captureDir,
    pageId: pageArg ? parseInt(pageArg, 10) : undefined,
    sectionId: sectionArg,
    responsive: args.includes('--responsive'),
    status: args.includes('--status'),
    approve: approveArg,
    skip: skipArg,
    reset: args.includes('--reset'),
  };
}

function loadSitemap(captureDir: string): Sitemap | null {
  const sitemapPath = path.join(captureDir, 'sitemap.json');
  if (!fs.existsSync(sitemapPath)) {
    console.error(`❌ sitemap.json을 찾을 수 없음: ${sitemapPath}`);
    console.log('   먼저 capture 단계를 실행하세요: /jikime:smart-rebuild capture <url>');
    return null;
  }
  return JSON.parse(fs.readFileSync(sitemapPath, 'utf-8'));
}

function getHitlDir(captureDir: string): string {
  return path.join(captureDir, 'hitl');
}

function getPageDir(captureDir: string, pageId: number): string {
  const pageDir = path.join(getHitlDir(captureDir), `page_${pageId}`);
  if (!fs.existsSync(pageDir)) {
    fs.mkdirSync(pageDir, { recursive: true });
  }
  return pageDir;
}

function getSectionDir(captureDir: string, pageId: number, section: HITLSection): string {
  const sectionDir = path.join(getPageDir(captureDir, pageId), `section_${section.id}_${section.name}`);
  if (!fs.existsSync(sectionDir)) {
    fs.mkdirSync(sectionDir, { recursive: true });
  }
  return sectionDir;
}

function getStateFile(captureDir: string, pageId: number): string {
  return path.join(getPageDir(captureDir, pageId), 'state.json');
}

// 시맨틱 섹션 셀렉터 우선순위 (HTML에서 자동 감지)
const SEMANTIC_SECTION_SELECTORS = [
  { selector: 'header, #header, .header, [role="banner"]', name: 'header', label: '헤더' },
  { selector: 'nav, #nav, .nav, #gnb, .gnb, [role="navigation"]', name: 'nav', label: '내비게이션' },
  { selector: '.visual, .hero, .banner, .main-visual, #visual', name: 'visual', label: '메인 비주얼' },
  { selector: 'main, #main, .main, #content, .content, [role="main"]', name: 'main', label: '메인 콘텐츠' },
  { selector: 'section, .section', name: 'section', label: '섹션' },
  { selector: 'aside, #sidebar, .sidebar, [role="complementary"]', name: 'sidebar', label: '사이드바' },
  { selector: 'footer, #footer, .footer, [role="contentinfo"]', name: 'footer', label: '푸터' },
];

// HTML 파일에서 섹션 자동 감지
function detectSectionsFromHtml(captureDir: string, page: SitemapPage, pageIndex?: number): HITLSection[] {
  // HTML 파일 경로 찾기 (여러 가능한 형식 시도)
  let htmlFile = page.html;

  if (!htmlFile) {
    // page.html이 없으면 다른 형식 시도
    const pageId = page.id ?? (pageIndex !== undefined ? pageIndex + 1 : 1);
    htmlFile = `page_${pageId}.html`;
  }

  const htmlPath = path.join(captureDir, htmlFile);

  if (!fs.existsSync(htmlPath)) {
    console.log(`⚠️  HTML 파일을 찾을 수 없음: ${htmlPath}`);
    console.log('   전체 페이지를 하나의 섹션으로 처리합니다.');
    return [{
      id: '01',
      name: 'fullpage',
      label: '전체 페이지',
      selector: 'body',
      status: 'pending' as const,
      retries: 0,
    }];
  }

  const html = fs.readFileSync(htmlPath, 'utf-8');
  const sections: HITLSection[] = [];
  let sectionIndex = 1;

  // 시맨틱 셀렉터로 섹션 감지
  for (const { selector, name, label } of SEMANTIC_SECTION_SELECTORS) {
    // 간단한 태그/클래스/ID 존재 확인
    const selectors = selector.split(',').map(s => s.trim());

    for (const sel of selectors) {
      let found = false;

      if (sel.startsWith('#')) {
        // ID 셀렉터
        const id = sel.slice(1);
        found = html.includes(`id="${id}"`) || html.includes(`id='${id}'`);
      } else if (sel.startsWith('.')) {
        // 클래스 셀렉터
        const className = sel.slice(1);
        const classRegex = new RegExp(`class=["'][^"']*\\b${className}\\b[^"']*["']`, 'i');
        found = classRegex.test(html);
      } else if (sel.startsWith('[')) {
        // 속성 셀렉터 (예: [role="banner"])
        const attrMatch = sel.match(/\[(\w+)="([^"]+)"\]/);
        if (attrMatch) {
          found = html.includes(`${attrMatch[1]}="${attrMatch[2]}"`);
        }
      } else {
        // 태그 셀렉터
        found = html.includes(`<${sel}`) || html.includes(`<${sel} `);
      }

      if (found) {
        // 중복 방지 (같은 name의 섹션이 이미 있으면 스킵)
        if (!sections.find(s => s.name === name)) {
          sections.push({
            id: String(sectionIndex).padStart(2, '0'),
            name: name,
            label: label,
            selector: sel,
            status: 'pending' as const,
            retries: 0,
          });
          sectionIndex++;
        }
        break; // 이 셀렉터 그룹에서 하나 찾으면 다음 그룹으로
      }
    }
  }

  // 추가: .m1, .m2 같은 패턴 감지 (레거시 사이트에서 흔함)
  const mSectionRegex = /class=["'][^"']*\b(m\d+)\b[^"']*["']/gi;
  let match;
  while ((match = mSectionRegex.exec(html)) !== null) {
    const className = match[1];
    if (!sections.find(s => s.selector === `.${className}`)) {
      sections.push({
        id: String(sectionIndex).padStart(2, '0'),
        name: className,
        label: `섹션 ${className}`,
        selector: `.${className}`,
        status: 'pending' as const,
        retries: 0,
      });
      sectionIndex++;
    }
  }

  // 섹션을 찾지 못한 경우 전체 페이지로 폴백
  if (sections.length === 0) {
    console.log('⚠️  시맨틱 섹션을 감지하지 못함. 전체 페이지를 하나의 섹션으로 처리합니다.');
    return [{
      id: '01',
      name: 'fullpage',
      label: '전체 페이지',
      selector: 'body',
      status: 'pending' as const,
      retries: 0,
    }];
  }

  console.log(`✅ ${sections.length}개 섹션 감지됨:`);
  sections.forEach(s => console.log(`   - ${s.id} ${s.name}: ${s.selector}`));

  return sections;
}

function loadPageState(captureDir: string, pageId: number, sitemap: Sitemap): HITLState | null {
  const stateFile = getStateFile(captureDir, pageId);

  // 페이지 찾기: id가 있으면 id로, 없으면 index로 (1-based)
  let page: SitemapPage | undefined;
  let actualPageId = pageId;

  // 먼저 id로 찾기 시도
  page = sitemap.pages.find(p => p.id === pageId);

  // id가 없으면 index로 찾기 (pageId는 1-based)
  if (!page && pageId > 0 && pageId <= sitemap.pages.length) {
    page = sitemap.pages[pageId - 1];
    actualPageId = pageId;
    console.log(`📍 페이지 ${pageId} (index: ${pageId - 1})를 사용합니다.`);
  }

  if (!page) {
    console.error(`❌ 페이지 ${pageId}를 찾을 수 없음 (총 ${sitemap.pages.length}개 페이지)`);
    return null;
  }

  if (fs.existsSync(stateFile)) {
    return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  }

  // URL에서 path 추출 (page.path가 없는 경우)
  let pagePath: string;
  try {
    const urlObj = new URL(page.url);
    pagePath = page.path || urlObj.pathname;
  } catch {
    pagePath = page.path || '/';
  }

  // Priority 1: sitemap.json에 sections가 정의되어 있으면 사용
  // Priority 2: HTML 파일에서 시맨틱 섹션 자동 감지
  // Priority 3: 전체 페이지를 하나의 섹션으로 처리
  let sections: HITLSection[];

  if (page.sections && page.sections.length > 0) {
    console.log(`📋 sitemap.json에서 ${page.sections.length}개 섹션 로드`);
    sections = page.sections.map((s, idx) => ({
      id: s.id || String(idx + 1).padStart(2, '0'),
      name: s.name,
      label: s.label,
      selector: s.selector,
      status: 'pending' as const,
      retries: 0,
    }));
  } else {
    console.log('🔍 HTML 파일에서 섹션 자동 감지 중...');
    // actualPageId는 1-based이므로 0-based 인덱스를 전달
    sections = detectSectionsFromHtml(captureDir, page, actualPageId - 1);
  }

  // 페이지 URL 결정
  const pageUrl = page.url.startsWith('http') ? page.url : new URL(pagePath, sitemap.baseUrl).toString();

  return {
    pageId: actualPageId,
    pageUrl,
    pageTitle: page.title || `Page ${actualPageId}`,
    localUrl: sitemap.localUrl || DEFAULT_LOCAL_URL,
    sections,
    currentIndex: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function savePageState(captureDir: string, state: HITLState): void {
  const hitlDir = getHitlDir(captureDir);
  if (!fs.existsSync(hitlDir)) {
    fs.mkdirSync(hitlDir, { recursive: true });
  }
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(getStateFile(captureDir, state.pageId), JSON.stringify(state, null, 2));
}

function printStatus(captureDir: string, sitemap: Sitemap, pageId?: number): void {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 HITL 진행 상황');
  console.log('═'.repeat(60));

  // pageId가 지정된 경우 해당 페이지만, 아니면 모든 페이지
  let pagesToShow: { page: SitemapPage; index: number }[] = [];

  if (pageId) {
    // id로 찾거나 index로 찾기 (1-based)
    const foundByIdIndex = sitemap.pages.findIndex(p => p.id === pageId);
    if (foundByIdIndex !== -1) {
      pagesToShow.push({ page: sitemap.pages[foundByIdIndex], index: foundByIdIndex });
    } else if (pageId > 0 && pageId <= sitemap.pages.length) {
      pagesToShow.push({ page: sitemap.pages[pageId - 1], index: pageId - 1 });
    }
  } else {
    pagesToShow = sitemap.pages.map((page, index) => ({ page, index }));
  }

  if (pagesToShow.length === 0) {
    console.log('\n⚠️  표시할 페이지가 없습니다.');
    console.log('═'.repeat(60));
    return;
  }

  for (const { page, index } of pagesToShow) {
    const effectivePageId = page.id ?? (index + 1);
    const state = loadPageState(captureDir, effectivePageId, sitemap);
    if (!state) continue;

    const total = state.sections.length;
    const done = state.sections.filter(s => s.status === 'done').length;
    const skipped = state.sections.filter(s => s.status === 'skipped').length;
    const pending = state.sections.filter(s => s.status === 'pending' || s.status === 'in_progress').length;

    const progress = total > 0 ? Math.round((done + skipped) / total * 20) : 0;
    const bar = '█'.repeat(progress) + '░'.repeat(20 - progress);

    // URL에서 path 추출
    let displayPath: string;
    try {
      displayPath = page.path || new URL(page.url).pathname;
    } catch {
      displayPath = page.url;
    }

    console.log(`\n📄 Page ${effectivePageId}: ${page.title}`);
    console.log(`   URL: ${displayPath}`);
    console.log(`   [${bar}] ${done + skipped}/${total} (${total > 0 ? Math.round((done + skipped) / total * 100) : 0}%)`);
    console.log(`   ✅ 완료: ${done} | ⏭️ 스킵: ${skipped} | ⏳ 대기: ${pending}`);

    if (state.sections.length <= 10) {
      console.log('\n   📋 섹션 목록:');
      state.sections.forEach(s => {
        let icon = '⏳';
        if (s.status === 'done') icon = '✅';
        else if (s.status === 'skipped') icon = '⏭️';
        else if (s.status === 'in_progress') icon = '🔄';
        console.log(`      ${icon} ${s.id}_${s.name}: ${s.label}`);
      });
    }
  }

  console.log('\n' + '═'.repeat(60));
}

function getNextPendingSection(state: HITLState): HITLSection | null {
  return state.sections.find(s => s.status === 'pending' || s.status === 'in_progress') || null;
}

function getNextPendingPage(sitemap: Sitemap): SitemapPage | null {
  return sitemap.pages.find(p => p.status === 'pending' || p.status === 'in_progress') || null;
}

// ============================================================
// Comparison Functions
// ============================================================

const COMPARISON_STYLES = [
  'background-color',
  'color',
  'font-size',
  'font-family',
  'font-weight',
  'padding',
  'margin',
  'border',
  'width',
  'height',
  'display',
  'flex-direction',
  'justify-content',
  'align-items',
  'gap',
  'text-align',
];

/**
 * 원본 셀렉터 → 로컬 data-section-id 셀렉터 변환
 * 원본: header, .hero, #nav 등
 * 로컬: [data-section-id="01-header"], [data-section-id="02-hero"] 등
 */
function getLocalSelector(section: HITLSection): string {
  // 섹션 ID와 이름으로 data-section-id 셀렉터 생성
  return `[data-section-id="${section.id}-${section.name}"]`;
}

async function compareDOM(
  originalPage: Page,
  localPage: Page,
  originalSelector: string,
  localSelector: string
): Promise<ComparisonHints> {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const details: DOMComparison[] = [];

  // 메인 섹션 비교 (원본과 로컬에서 다른 셀렉터 사용)
  const mainComparison = await compareSingleElement(originalPage, localPage, originalSelector, localSelector);
  details.push(mainComparison);

  // 결과 분석
  if (!mainComparison.localExists && mainComparison.originalExists) {
    issues.push(`섹션이 로컬에 없음: ${selector}`);
    suggestions.push(`${selector} 요소를 구현하세요`);
  } else if (mainComparison.localExists && mainComparison.originalExists) {
    // 스타일 차이 분석
    const mismatches = mainComparison.styles.filter(s => s.status === 'mismatch');
    for (const m of mismatches) {
      if (m.property === 'background-color') {
        issues.push(`배경색 차이: 원본(${m.original}) vs 로컬(${m.local})`);
        suggestions.push(`배경색을 ${m.original}로 변경`);
      } else if (m.property === 'font-size') {
        issues.push(`폰트 크기 차이: 원본(${m.original}) vs 로컬(${m.local})`);
        suggestions.push(`폰트 크기를 ${m.original}로 변경`);
      } else if (m.property === 'color') {
        issues.push(`텍스트 색상 차이: 원본(${m.original}) vs 로컬(${m.local})`);
        suggestions.push(`텍스트 색상을 ${m.original}로 변경`);
      } else if (m.property.includes('padding') || m.property.includes('margin')) {
        issues.push(`여백 차이 (${m.property}): 원본(${m.original}) vs 로컬(${m.local})`);
        suggestions.push(`${m.property}를 ${m.original}로 조정`);
      } else {
        issues.push(`스타일 차이 (${m.property}): 원본(${m.original}) vs 로컬(${m.local})`);
      }
    }

    // 텍스트 내용 차이
    if (!mainComparison.textMatch && mainComparison.originalText) {
      issues.push('텍스트 내용 차이 발견');
      suggestions.push('텍스트 내용을 원본과 맞추세요');
    }

    // 자식 요소 개수 차이
    const childDiff = Math.abs(mainComparison.childCount.original - mainComparison.childCount.local);
    if (childDiff > 0) {
      issues.push(`하위 요소 개수 차이: 원본(${mainComparison.childCount.original}) vs 로컬(${mainComparison.childCount.local})`);
      if (mainComparison.childCount.local < mainComparison.childCount.original) {
        suggestions.push(`${childDiff}개의 하위 요소가 더 필요함`);
      }
    }
  }

  // 전체 일치율 계산
  let matchScore = 100;
  if (!mainComparison.localExists) {
    matchScore = 0;
  } else {
    const totalChecks = mainComparison.styles.length + 2; // styles + text + children
    const matches = mainComparison.styles.filter(s => s.status === 'match').length
      + (mainComparison.textMatch ? 1 : 0)
      + (mainComparison.childCount.original === mainComparison.childCount.local ? 1 : 0);
    matchScore = Math.round((matches / totalChecks) * 100);
  }

  return {
    overallMatch: matchScore,
    issues,
    suggestions,
    details,
  };
}

async function compareSingleElement(
  originalPage: Page,
  localPage: Page,
  originalSelector: string,
  localSelector: string
): Promise<DOMComparison> {
  const comparison: DOMComparison = {
    selector: `${originalSelector} ↔ ${localSelector}`,
    originalExists: false,
    localExists: false,
    styles: [],
    textMatch: true,
    childCount: { original: 0, local: 0 },
  };

  // 원본 페이지 분석 (시맨틱 셀렉터 사용)
  const originalData = await originalPage.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return null;

    const styles: Record<string, string> = {};
    const computed = window.getComputedStyle(el);
    const propsToCheck = [
      'background-color', 'color', 'font-size', 'font-family', 'font-weight',
      'padding', 'margin', 'border', 'width', 'height', 'display',
      'flex-direction', 'justify-content', 'align-items', 'gap', 'text-align',
    ];
    propsToCheck.forEach(prop => {
      styles[prop] = computed.getPropertyValue(prop);
    });

    return {
      exists: true,
      text: el.textContent?.trim().slice(0, 100) || '',
      childCount: el.children.length,
      styles,
    };
  }, originalSelector);

  // 로컬 페이지 분석 (🔴 data-section-id 셀렉터 사용!)
  const localData = await localPage.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return null;

    const styles: Record<string, string> = {};
    const computed = window.getComputedStyle(el);
    const propsToCheck = [
      'background-color', 'color', 'font-size', 'font-family', 'font-weight',
      'padding', 'margin', 'border', 'width', 'height', 'display',
      'flex-direction', 'justify-content', 'align-items', 'gap', 'text-align',
    ];
    propsToCheck.forEach(prop => {
      styles[prop] = computed.getPropertyValue(prop);
    });

    return {
      exists: true,
      text: el.textContent?.trim().slice(0, 100) || '',
      childCount: el.children.length,
      styles,
    };
  }, localSelector);

  comparison.originalExists = !!originalData;
  comparison.localExists = !!localData;

  if (originalData && localData) {
    // 스타일 비교
    for (const prop of COMPARISON_STYLES) {
      const origVal = originalData.styles[prop] || '';
      const localVal = localData.styles[prop] || '';
      comparison.styles.push({
        property: prop,
        original: origVal,
        local: localVal,
        status: origVal === localVal ? 'match' : 'mismatch',
      });
    }

    // 텍스트 비교
    comparison.originalText = originalData.text;
    comparison.localText = localData.text;
    comparison.textMatch = originalData.text === localData.text;

    // 자식 요소 수
    comparison.childCount = {
      original: originalData.childCount,
      local: localData.childCount,
    };
  } else if (originalData) {
    comparison.originalText = originalData.text;
    comparison.childCount.original = originalData.childCount;
  }

  return comparison;
}

// ============================================================
// Capture Functions
// ============================================================

async function captureSection(
  originalPage: Page,
  localPage: Page,
  section: HITLSection,
  captureDir: string,
  pageId: number,
  viewport?: Viewport
): Promise<{ original: string; local: string; comparison: ComparisonHints } | null> {
  // 섹션별 폴더 생성: hitl/page_N/section_ID_name/
  const sectionDir = getSectionDir(captureDir, pageId, section);

  const viewportSuffix = viewport ? `_${viewport.name}` : '';
  const originalPath = path.join(sectionDir, `original${viewportSuffix}.png`);
  const localPath = path.join(sectionDir, `local${viewportSuffix}.png`);

  try {
    // 🔴 셀렉터 분리: 원본(시맨틱) vs 로컬(data-section-id)
    const originalSelector = section.selector;
    const localSelector = getLocalSelector(section);

    console.log(`🔍 DOM 스타일 비교 중...`);
    console.log(`   원본 셀렉터: ${originalSelector}`);
    console.log(`   로컬 셀렉터: ${localSelector}`);

    const comparison = await compareDOM(originalPage, localPage, originalSelector, localSelector);

    // 전체 페이지 캡처 모드
    if (section.selector === 'body') {
      await originalPage.screenshot({ path: originalPath, fullPage: true });
      await localPage.screenshot({ path: localPath, fullPage: true });
      return { original: originalPath, local: localPath, comparison };
    }

    const origEl = await originalPage.$(originalSelector);
    const localEl = await localPage.$(localSelector);

    if (!origEl) {
      console.log(`⚠️  원본에서 ${originalSelector} 를 찾을 수 없음`);
      return null;
    }

    if (!localEl) {
      console.log(`⚠️  로컬에서 ${localSelector} 를 찾을 수 없음`);
      console.log(`   💡 힌트: 컴포넌트에 data-section-id="${section.id}-${section.name}" 속성을 추가했는지 확인하세요`);
      // 로컬에서 요소를 찾을 수 없어도 원본은 캡처
      await origEl.screenshot({ path: originalPath });
      // 로컬은 전체 페이지 캡처로 대체
      await localPage.screenshot({ path: localPath, fullPage: true });
      return { original: originalPath, local: localPath, comparison };
    }

    await origEl.screenshot({ path: originalPath });
    await localEl.screenshot({ path: localPath });

    return { original: originalPath, local: localPath, comparison };
  } catch (error) {
    console.log(`❌ 캡처 실패: ${error}`);
    return null;
  }
}

async function captureResponsive(
  state: HITLState,
  section: HITLSection,
  captureDir: string,
  viewports: Viewport[]
): Promise<{ viewport: Viewport; original: string; local: string; comparison: ComparisonHints }[]> {
  const results: { viewport: Viewport; original: string; local: string; comparison: ComparisonHints }[] = [];
  const browser = await chromium.launch({ headless: true });

  try {
    for (const viewport of viewports) {
      console.log(`\n📱 ${viewport.label} 캡처 중...`);

      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });

      const originalPage = await context.newPage();
      await originalPage.goto(state.pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await originalPage.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        return new Promise(r => setTimeout(r, 1000));
      });
      await originalPage.evaluate(() => window.scrollTo(0, 0));

      const localPage = await context.newPage();
      const localPageUrl = new URL(
        new URL(state.pageUrl).pathname,
        state.localUrl
      ).toString();
      await localPage.goto(localPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await localPage.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        return new Promise(r => setTimeout(r, 1000));
      });
      await localPage.evaluate(() => window.scrollTo(0, 0));

      const paths = await captureSection(originalPage, localPage, section, captureDir, state.pageId, viewport);

      if (paths) {
        results.push({ viewport, original: paths.original, local: paths.local, comparison: paths.comparison });
        console.log(`   ✅ ${viewport.name} 캡처 완료 (일치율: ${paths.comparison.overallMatch}%)`);
      } else {
        console.log(`   ⚠️  ${viewport.name} 캡처 실패`);
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  return results;
}

// ============================================================
// Main Functions
// ============================================================

async function captureNextSection(
  captureDir: string,
  sitemap: Sitemap,
  pageId?: number,
  sectionId?: string,
  responsive?: boolean
): Promise<void> {
  // 페이지 결정
  const targetPageId = pageId ?? getNextPendingPage(sitemap)?.id;
  if (!targetPageId) {
    console.log('\n🎉 모든 페이지가 완료되었습니다!');
    printStatus(captureDir, sitemap);
    return;
  }

  const state = loadPageState(captureDir, targetPageId, sitemap);
  if (!state) return;

  // 섹션 결정
  let section: HITLSection | null = null;
  if (sectionId) {
    section = state.sections.find(s => s.id === sectionId || s.name === sectionId) || null;
  } else {
    section = getNextPendingSection(state);
  }

  if (!section) {
    console.log(`\n🎉 Page ${targetPageId}의 모든 섹션이 완료되었습니다!`);
    printStatus(captureDir, sitemap, targetPageId);
    return;
  }

  const hitlDir = getHitlDir(captureDir);

  // 반응형 모드
  if (responsive) {
    console.log(`\n📍 반응형 테스트: Page ${state.pageId} - ${section.id}_${section.name} (${section.label})`);
    console.log('📱 뷰포트: 데스크톱, 태블릿, 모바일');

    const results = await captureResponsive(state, section, captureDir, VIEWPORTS);

    if (results.length === 0) {
      console.log(`\n⚠️  모든 뷰포트에서 캡처 실패`);
      return;
    }

    section.status = 'in_progress';
    section.lastCaptured = new Date().toISOString();
    section.retries++;
    savePageState(captureDir, state);

    printResponsiveResult(state, section, results, captureDir);
    return;
  }

  console.log(`\n📍 섹션 캡처: Page ${state.pageId} - ${section.id}_${section.name} (${section.label})`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });

  try {
    console.log('📸 페이지 로딩...');
    const originalPage = await context.newPage();
    await originalPage.goto(state.pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await originalPage.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      return new Promise(r => setTimeout(r, 1000));
    });
    await originalPage.evaluate(() => window.scrollTo(0, 0));

    const localPage = await context.newPage();
    const localPageUrl = new URL(
      new URL(state.pageUrl).pathname,
      state.localUrl
    ).toString();
    await localPage.goto(localPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await localPage.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      return new Promise(r => setTimeout(r, 1000));
    });
    await localPage.evaluate(() => window.scrollTo(0, 0));

    const paths = await captureSection(originalPage, localPage, section, captureDir, state.pageId);

    if (!paths) {
      console.log(`\n⚠️  섹션을 찾을 수 없습니다. 스킵 처리하려면:`);
      console.log(`   --skip=${section.id}`);
      return;
    }

    section.status = 'in_progress';
    section.lastCaptured = new Date().toISOString();
    section.retries++;
    savePageState(captureDir, state);

    printCaptureResult(state, section, paths, captureDir);

  } finally {
    await browser.close();
  }
}

function printCaptureResult(
  state: HITLState,
  section: HITLSection,
  paths: { original: string; local: string; comparison: ComparisonHints },
  captureDir: string
): void {
  const { comparison } = paths;

  console.log('\n' + '═'.repeat(60));
  console.log('✅ 캡처 및 비교 완료!');
  console.log('═'.repeat(60));
  console.log(`\n📸 원본: ${paths.original}`);
  console.log(`📸 로컬: ${paths.local}`);
  console.log(`\n📊 일치율: ${comparison.overallMatch}%`);

  if (comparison.issues.length > 0) {
    console.log('\n⚠️  발견된 차이점:');
    comparison.issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));
  } else {
    console.log('\n✅ 주요 차이점 없음');
  }

  if (comparison.suggestions.length > 0) {
    console.log('\n💡 수정 제안:');
    comparison.suggestions.forEach((sug, i) => console.log(`   ${i + 1}. ${sug}`));
  }

  // 자동 추천 결정
  let recommendation: 'approve' | 'fix' | 'review';
  let recommendationText: string;
  if (comparison.overallMatch >= 90 && comparison.issues.length === 0) {
    recommendation = 'approve';
    recommendationText = '승인 권장 (일치율 90% 이상, 이슈 없음)';
  } else if (comparison.overallMatch >= 70) {
    recommendation = 'review';
    recommendationText = '검토 필요 (일치율 70-90%, 사소한 차이)';
  } else {
    recommendation = 'fix';
    recommendationText = '수정 필요 (일치율 70% 미만 또는 주요 차이 발견)';
  }

  console.log(`\n🎯 자동 추천: ${recommendationText}`);

  // Claude가 파싱할 JSON 결과 출력
  const result = {
    status: 'captured',
    pageId: state.pageId,
    pageUrl: state.pageUrl,
    localUrl: state.localUrl,
    section: {
      id: section.id,
      name: section.name,
      label: section.label,
      selector: section.selector,
    },
    images: {
      original: paths.original,
      local: paths.local,
    },
    comparison: {
      overallMatch: comparison.overallMatch,
      issues: comparison.issues,
      suggestions: comparison.suggestions,
      recommendation,
      recommendationText,
    },
    nextAction: 'ASK_USER',
    claudeInstructions: {
      summary: `섹션 "${section.label}" 비교 결과: 일치율 ${comparison.overallMatch}%`,
      issueCount: comparison.issues.length,
      action: recommendation === 'approve'
        ? 'AskUserQuestion으로 승인 확인 (권장: 승인)'
        : recommendation === 'review'
        ? 'AskUserQuestion으로 검토 요청 (스크린샷 비교 필요)'
        : 'AskUserQuestion으로 수정 필요 여부 확인',
      questionOptions: [
        { label: '승인', description: '현재 상태로 진행' },
        { label: '수정 필요', description: comparison.suggestions.slice(0, 2).join(', ') || '세부 조정 필요' },
        { label: '스킵', description: '이 섹션 건너뛰기' },
      ],
    },
  };

  console.log('\n<!-- HITL_RESULT_JSON_START -->');
  console.log(JSON.stringify(result, null, 2));
  console.log('<!-- HITL_RESULT_JSON_END -->');

  console.log('\n' + '─'.repeat(60));
  console.log('🤖 CLAUDE: 위 JSON을 파싱하고 AskUserQuestion 호출하세요');
  console.log('─'.repeat(60));
}

function printResponsiveResult(
  state: HITLState,
  section: HITLSection,
  results: { viewport: Viewport; original: string; local: string; comparison: ComparisonHints }[],
  captureDir: string
): void {
  console.log('\n' + '═'.repeat(60));
  console.log('✅ 반응형 캡처 및 비교 완료!');
  console.log('═'.repeat(60));

  // 전체 일치율 계산
  const avgMatch = Math.round(results.reduce((sum, r) => sum + r.comparison.overallMatch, 0) / results.length);
  const allIssues: string[] = [];

  for (const result of results) {
    console.log(`\n📱 ${result.viewport.label} (일치율: ${result.comparison.overallMatch}%):`);
    console.log(`   원본: ${result.original}`);
    console.log(`   로컬: ${result.local}`);
    if (result.comparison.issues.length > 0) {
      console.log(`   ⚠️  이슈: ${result.comparison.issues.slice(0, 2).join(', ')}`);
      result.comparison.issues.forEach(issue => {
        allIssues.push(`[${result.viewport.name}] ${issue}`);
      });
    }
  }

  console.log(`\n📊 평균 일치율: ${avgMatch}%`);

  // 자동 추천 결정
  let recommendation: 'approve' | 'fix' | 'review';
  let recommendationText: string;
  if (avgMatch >= 85 && allIssues.length <= 2) {
    recommendation = 'approve';
    recommendationText = '승인 권장 (평균 일치율 85% 이상)';
  } else if (avgMatch >= 60) {
    recommendation = 'review';
    recommendationText = '검토 필요 (일부 뷰포트에서 차이 발견)';
  } else {
    recommendation = 'fix';
    recommendationText = '수정 필요 (여러 뷰포트에서 주요 차이 발견)';
  }

  console.log(`\n🎯 자동 추천: ${recommendationText}`);

  // Claude가 파싱할 JSON 결과 출력
  const jsonResult = {
    status: 'responsive_captured',
    pageId: state.pageId,
    pageUrl: state.pageUrl,
    localUrl: state.localUrl,
    section: {
      id: section.id,
      name: section.name,
      label: section.label,
      selector: section.selector,
    },
    viewports: results.map(r => ({
      name: r.viewport.name,
      label: r.viewport.label,
      images: { original: r.original, local: r.local },
      matchRate: r.comparison.overallMatch,
      issues: r.comparison.issues,
      suggestions: r.comparison.suggestions,
    })),
    summary: {
      avgMatchRate: avgMatch,
      totalIssues: allIssues.length,
      recommendation,
      recommendationText,
    },
    nextAction: 'ASK_USER',
    claudeInstructions: {
      summary: `반응형 테스트 "${section.label}": 평균 일치율 ${avgMatch}%`,
      action: recommendation === 'approve'
        ? 'AskUserQuestion으로 승인 확인 (권장: 승인)'
        : recommendation === 'review'
        ? 'AskUserQuestion으로 검토 요청 (특정 뷰포트 확인 필요)'
        : 'AskUserQuestion으로 수정 필요 여부 확인',
      questionOptions: [
        { label: '승인', description: '모든 뷰포트 확인 완료' },
        { label: '수정 필요', description: allIssues.slice(0, 2).join(', ') || '반응형 조정 필요' },
        { label: '스킵', description: '이 섹션 건너뛰기' },
      ],
    },
  };

  console.log('\n<!-- HITL_RESULT_JSON_START -->');
  console.log(JSON.stringify(jsonResult, null, 2));
  console.log('<!-- HITL_RESULT_JSON_END -->');

  console.log('\n' + '─'.repeat(60));
  console.log('🤖 CLAUDE: 위 JSON을 파싱하고 AskUserQuestion 호출하세요');
  console.log('─'.repeat(60));
}

function approveSection(captureDir: string, sitemap: Sitemap, pageId: number, sectionId: string): void {
  const state = loadPageState(captureDir, pageId, sitemap);
  if (!state) return;

  const section = state.sections.find(s => s.id === sectionId || s.name === sectionId);

  if (!section) {
    console.log(`❌ 섹션을 찾을 수 없음: ${sectionId}`);
    return;
  }

  section.status = 'done';
  savePageState(captureDir, state);

  console.log(`\n✅ Page ${pageId} - ${section.id}_${section.name} (${section.label}) 승인됨!`);

  const next = getNextPendingSection(state);
  if (next) {
    console.log(`\n📍 다음 섹션: ${next.id}_${next.name} (${next.label})`);
    console.log(`   실행: --capture ${captureDir} --page ${pageId}`);
  } else {
    console.log(`\n🎉 Page ${pageId}의 모든 섹션이 완료되었습니다!`);

    // sitemap 업데이트
    const page = sitemap.pages.find(p => p.id === pageId);
    if (page) {
      page.status = 'completed';
      const sitemapPath = path.join(captureDir, 'sitemap.json');
      fs.writeFileSync(sitemapPath, JSON.stringify(sitemap, null, 2));
    }
  }

  printStatus(captureDir, sitemap, pageId);
}

function skipSection(captureDir: string, sitemap: Sitemap, pageId: number, sectionId: string): void {
  const state = loadPageState(captureDir, pageId, sitemap);
  if (!state) return;

  const section = state.sections.find(s => s.id === sectionId || s.name === sectionId);

  if (!section) {
    console.log(`❌ 섹션을 찾을 수 없음: ${sectionId}`);
    return;
  }

  section.status = 'skipped';
  savePageState(captureDir, state);

  console.log(`\n⏭️  Page ${pageId} - ${section.id}_${section.name} (${section.label}) 스킵됨!`);

  const next = getNextPendingSection(state);
  if (next) {
    console.log(`\n📍 다음 섹션: ${next.id}_${next.name} (${next.label})`);
    console.log(`   실행: --capture ${captureDir} --page ${pageId}`);
  } else {
    console.log(`\n🎉 Page ${pageId}의 모든 섹션이 완료되었습니다!`);
  }

  printStatus(captureDir, sitemap, pageId);
}

function resetState(captureDir: string, pageId?: number): void {
  const hitlDir = getHitlDir(captureDir);
  if (!fs.existsSync(hitlDir)) {
    console.log('🔄 초기화할 상태가 없습니다.');
    return;
  }

  if (pageId) {
    const stateFile = getStateFile(captureDir, pageId);
    if (fs.existsSync(stateFile)) {
      fs.unlinkSync(stateFile);
      console.log(`🔄 Page ${pageId} 상태가 초기화되었습니다.`);
    }
  } else {
    const files = fs.readdirSync(hitlDir).filter(f => f.endsWith('_state.json'));
    for (const file of files) {
      fs.unlinkSync(path.join(hitlDir, file));
    }
    console.log(`🔄 모든 HITL 상태가 초기화되었습니다. (${files.length}개 파일)`);
  }
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const args = parseArgs();

  const sitemap = loadSitemap(args.captureDir);
  if (!sitemap) {
    process.exit(1);
  }

  if (args.reset) {
    resetState(args.captureDir, args.pageId);
    return;
  }

  if (args.status) {
    printStatus(args.captureDir, sitemap, args.pageId);
    return;
  }

  if (args.approve && args.pageId) {
    approveSection(args.captureDir, sitemap, args.pageId, args.approve);
    return;
  }

  if (args.skip && args.pageId) {
    skipSection(args.captureDir, sitemap, args.pageId, args.skip);
    return;
  }

  await captureNextSection(
    args.captureDir,
    sitemap,
    args.pageId,
    args.sectionId,
    args.responsive
  );
}

main().catch(console.error);
