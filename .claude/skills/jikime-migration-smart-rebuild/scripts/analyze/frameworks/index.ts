/**
 * Framework Detection & Strategy Pattern
 * 각 PHP 프레임워크별 분석 전략을 제공합니다.
 */

import * as fs from 'fs';
import * as path from 'path';

export type FrameworkType = 'php-pure' | 'wordpress' | 'laravel' | 'codeigniter' | 'symfony' | 'unknown';

export interface FrameworkDetectionResult {
  type: FrameworkType;
  version?: string;
  confidence: number; // 0-100
  indicators: string[];
}

export interface MatchStrategy {
  name: string;
  match(url: string, sourcePath: string, files: string[]): string | null;
}

/**
 * 프레임워크 감지기
 */
export function detectFramework(sourcePath: string): FrameworkDetectionResult {
  const indicators: string[] = [];
  let type: FrameworkType = 'unknown';
  let confidence = 0;
  let version: string | undefined;

  // Laravel 감지
  if (fs.existsSync(path.join(sourcePath, 'artisan'))) {
    indicators.push('artisan CLI found');
    if (fs.existsSync(path.join(sourcePath, 'app/Http/Controllers'))) {
      indicators.push('Laravel controller structure');
      type = 'laravel';
      confidence = 95;

      // 버전 감지
      const composerPath = path.join(sourcePath, 'composer.json');
      if (fs.existsSync(composerPath)) {
        try {
          const composer = JSON.parse(fs.readFileSync(composerPath, 'utf-8'));
          version = composer.require?.['laravel/framework']?.replace('^', '');
        } catch {
          // ignore
        }
      }
    }
  }

  // CodeIgniter 감지
  if (fs.existsSync(path.join(sourcePath, 'application/controllers'))) {
    indicators.push('CodeIgniter application/controllers found');
    type = 'codeigniter';
    confidence = 90;

    // CI 3 vs 4 구분
    if (fs.existsSync(path.join(sourcePath, 'system/core/CodeIgniter.php'))) {
      indicators.push('CodeIgniter 3.x');
      version = '3.x';
    } else if (fs.existsSync(path.join(sourcePath, 'app/Controllers'))) {
      indicators.push('CodeIgniter 4.x');
      version = '4.x';
    }
  }

  // Symfony 감지
  if (fs.existsSync(path.join(sourcePath, 'symfony.lock')) ||
      fs.existsSync(path.join(sourcePath, 'config/bundles.php'))) {
    indicators.push('Symfony configuration found');
    type = 'symfony';
    confidence = 90;
  }

  // WordPress 감지
  if (fs.existsSync(path.join(sourcePath, 'wp-config.php')) ||
      fs.existsSync(path.join(sourcePath, 'wp-content'))) {
    indicators.push('WordPress structure found');
    type = 'wordpress';
    confidence = 95;

    // 버전 감지
    const versionPath = path.join(sourcePath, 'wp-includes/version.php');
    if (fs.existsSync(versionPath)) {
      try {
        const versionContent = fs.readFileSync(versionPath, 'utf-8');
        const match = versionContent.match(/\$wp_version\s*=\s*['"]([^'"]+)['"]/);
        if (match) version = match[1];
      } catch {
        // ignore
      }
    }
  }

  // PHP Pure 감지 (다른 프레임워크가 아닌 경우)
  if (type === 'unknown') {
    // index.php가 있고 프레임워크 특징이 없으면 순수 PHP
    if (fs.existsSync(path.join(sourcePath, 'index.php'))) {
      indicators.push('index.php found');

      // 추가 Pure PHP 특징 검사
      const phpFiles = findPhpFiles(sourcePath, 3); // 상위 3레벨만
      const hasDirectPhpRouting = phpFiles.some(f =>
        !f.includes('/vendor/') &&
        !f.includes('/node_modules/') &&
        !f.includes('/cache/')
      );

      if (hasDirectPhpRouting) {
        indicators.push('Direct PHP file routing pattern');
        type = 'php-pure';
        confidence = 70;
      }
    }
  }

  return { type, version, confidence, indicators };
}

/**
 * PHP 파일 찾기 (제한된 깊이)
 */
function findPhpFiles(dir: string, maxDepth: number, currentDepth = 0): string[] {
  if (currentDepth >= maxDepth) return [];

  const files: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        files.push(...findPhpFiles(fullPath, maxDepth, currentDepth + 1));
      } else if (entry.isFile() && entry.name.endsWith('.php')) {
        files.push(fullPath);
      }
    }
  } catch {
    // ignore permission errors
  }

  return files;
}

/**
 * 프레임워크별 매칭 전략 가져오기
 */
export function getMatchStrategy(framework: FrameworkType): MatchStrategy {
  switch (framework) {
    case 'php-pure':
      return new PhpPureStrategy();
    case 'wordpress':
      return new WordPressStrategy();
    case 'laravel':
      return new LaravelStrategy();
    case 'codeigniter':
      return new CodeIgniterStrategy();
    case 'symfony':
      return new SymfonyStrategy();
    default:
      return new PhpPureStrategy(); // 기본값
  }
}

/**
 * PHP Pure 매칭 전략
 */
class PhpPureStrategy implements MatchStrategy {
  name = 'PHP Pure';

  // 약어 매핑 사전
  private abbreviations: Record<string, string[]> = {
    notice: ['nt_', 'notice_', 'noti_'],
    story: ['sty_', 'story_'],
    review: ['sty_', 'review_', 'rv_'],
    qa: ['qa_', 'qna_'],
    qna: ['qa_', 'qna_'],
    faq: ['faq_'],
    product: ['pd_', 'prod_', 'products_', 'prd_'],
    member: ['mb_', 'mem_', 'member_', 'user_'],
    board: ['bd_', 'board_', 'bbs_'],
    gallery: ['gal_', 'gallery_', 'gl_'],
    news: ['news_', 'nw_'],
    event: ['ev_', 'event_'],
    customer: ['cs_', 'cust_', 'customer_'],
    inquiry: ['inq_', 'inquiry_', 'contact_'],
    admin: ['adm_', 'admin_'],
  };

  match(url: string, sourcePath: string, files: string[]): string | null {
    const urlObj = new URL(url);
    let urlPath = urlObj.pathname;

    // .php 확장자 제거
    if (urlPath.endsWith('.php')) {
      urlPath = urlPath.slice(0, -4);
    }

    // 경로 정규화
    if (urlPath === '/') urlPath = '/index';
    if (urlPath.endsWith('/')) urlPath = urlPath.slice(0, -1);

    const urlSegments = urlPath.split('/').filter(Boolean);
    const urlFolder = urlSegments.length > 1 ? urlSegments[0] : '';
    const urlName = urlSegments[urlSegments.length - 1] || 'index';
    const urlNameLower = urlName.toLowerCase();

    // 유효한 파일만 필터링
    const validFiles = this.filterValidFiles(files);

    // 1. 직접 매칭
    const directMatch = `${urlPath.slice(1)}.php`;
    if (validFiles.includes(directMatch)) {
      return path.join(sourcePath, directMatch);
    }

    // 2. index.php 매칭
    const indexMatch = `${urlPath.slice(1)}/index.php`;
    if (validFiles.includes(indexMatch)) {
      return path.join(sourcePath, indexMatch);
    }

    // 3. 쿼리 파라미터
    const pageParam = urlObj.searchParams.get('page');
    if (pageParam) {
      const pageMatch = `${pageParam}.php`;
      if (validFiles.includes(pageMatch)) {
        return path.join(sourcePath, pageMatch);
      }
    }

    // 4. 폴더 기반 매칭
    if (urlFolder) {
      const folderFiles = validFiles.filter(f =>
        f.startsWith(urlFolder + '/') || f.startsWith(urlFolder + path.sep)
      );

      // 4-1. 정확한 매칭
      for (const file of folderFiles) {
        const fileName = path.basename(file, '.php').toLowerCase();
        if (fileName === urlNameLower) {
          return path.join(sourcePath, file);
        }
      }

      // 4-2. 약어 매핑
      const result = this.matchWithAbbreviations(urlNameLower, folderFiles, sourcePath);
      if (result) return result;

      // 4-3. 액션 패턴
      const actionResult = this.matchActionPattern(urlNameLower, urlFolder, folderFiles, sourcePath);
      if (actionResult) return actionResult;

      // 4-4. 포함 관계
      for (const file of folderFiles) {
        const fileName = path.basename(file, '.php').toLowerCase();
        if (fileName.includes(urlNameLower) || urlNameLower.includes(fileName)) {
          return path.join(sourcePath, file);
        }
      }

      // 4-5. 기본 list 파일
      const listFile = folderFiles.find(f =>
        path.basename(f).toLowerCase().includes('list') &&
        !this.isBackupFile(f)
      );
      if (listFile) return path.join(sourcePath, listFile);
    }

    // 5. 전역 검색
    const normalizedName = urlNameLower.replace(/-/g, '_');
    for (const file of validFiles) {
      const fileName = path.basename(file, '.php').toLowerCase();
      if (fileName === normalizedName) {
        return path.join(sourcePath, file);
      }
    }

    return null;
  }

  private filterValidFiles(files: string[]): string[] {
    return files.filter(f => {
      const fileName = path.basename(f);
      if (this.isBackupFile(f)) return false;
      if (fileName.startsWith('.')) return false;
      if (f.includes('/_lib/') || f.includes('/include/') || f.includes('/lib/')) return false;
      if (f.includes('/vendor/') || f.includes('/node_modules/')) return false;
      return true;
    });
  }

  private isBackupFile(fileName: string): boolean {
    return /_(20\d{6}(_\d+)?|back|bak|old|backup)\.php$/i.test(fileName);
  }

  private matchWithAbbreviations(
    urlName: string,
    files: string[],
    sourcePath: string
  ): string | null {
    const abbreviations = this.abbreviations[urlName] || [];
    for (const abbr of abbreviations) {
      for (const file of files) {
        const fileName = path.basename(file, '.php').toLowerCase();
        if (fileName.startsWith(abbr)) {
          return path.join(sourcePath, file);
        }
      }
    }
    return null;
  }

  private matchActionPattern(
    urlName: string,
    urlFolder: string,
    files: string[],
    sourcePath: string
  ): string | null {
    for (const file of files) {
      const fileName = path.basename(file, '.php').toLowerCase();

      // 폴더명과 URL이 같으면 list 파일
      if (urlName === urlFolder && fileName.includes('list')) {
        return path.join(sourcePath, file);
      }

      // 액션 키워드 매칭
      if (urlName.includes('list') && fileName.includes('list')) {
        return path.join(sourcePath, file);
      }
      if (urlName.includes('view') && (fileName.includes('view') || fileName.includes('detail'))) {
        return path.join(sourcePath, file);
      }
      if (urlName.includes('write') && fileName.includes('write')) {
        return path.join(sourcePath, file);
      }
    }
    return null;
  }
}

/**
 * WordPress 매칭 전략
 */
class WordPressStrategy implements MatchStrategy {
  name = 'WordPress';

  match(url: string, sourcePath: string, files: string[]): string | null {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname;

    // WordPress는 주로 테마와 플러그인 기반
    // URL은 대부분 리라이트 룰로 처리됨

    // 1. 페이지 슬러그 기반 매칭
    const slug = urlPath.split('/').filter(Boolean).pop() || 'index';

    // 테마 폴더 찾기
    const themesDir = path.join(sourcePath, 'wp-content/themes');
    if (fs.existsSync(themesDir)) {
      const themes = fs.readdirSync(themesDir).filter(d =>
        fs.statSync(path.join(themesDir, d)).isDirectory()
      );

      for (const theme of themes) {
        // page-{slug}.php 패턴
        const pageTemplate = path.join(themesDir, theme, `page-${slug}.php`);
        if (fs.existsSync(pageTemplate)) {
          return pageTemplate;
        }

        // template-parts 내 검색
        const templateParts = path.join(themesDir, theme, 'template-parts');
        if (fs.existsSync(templateParts)) {
          const partFile = path.join(templateParts, `${slug}.php`);
          if (fs.existsSync(partFile)) return partFile;
        }
      }
    }

    // 2. 커스텀 포스트 타입 / 카테고리 페이지
    const segments = urlPath.split('/').filter(Boolean);
    if (segments.length >= 1) {
      const postType = segments[0];

      // archive-{post_type}.php
      // single-{post_type}.php
      // taxonomy-{taxonomy}.php
    }

    return null;
  }
}

/**
 * Laravel 매칭 전략
 */
class LaravelStrategy implements MatchStrategy {
  name = 'Laravel';

  match(url: string, sourcePath: string, files: string[]): string | null {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname;

    // Laravel은 routes/web.php 또는 routes/api.php에서 라우트 정의
    // 컨트롤러와 뷰를 함께 찾아야 함

    const segments = urlPath.split('/').filter(Boolean);
    if (segments.length === 0) segments.push('home');

    // 1. 컨트롤러 매칭
    const controllerName = this.toControllerName(segments[0]);
    const controllerPath = path.join(sourcePath, 'app/Http/Controllers', `${controllerName}Controller.php`);

    if (fs.existsSync(controllerPath)) {
      return controllerPath;
    }

    // 2. 뷰 매칭
    const viewPath = path.join(sourcePath, 'resources/views', ...segments) + '.blade.php';
    if (fs.existsSync(viewPath)) {
      return viewPath;
    }

    // 3. 폴더/index 패턴
    const viewIndexPath = path.join(sourcePath, 'resources/views', ...segments, 'index.blade.php');
    if (fs.existsSync(viewIndexPath)) {
      return viewIndexPath;
    }

    return null;
  }

  private toControllerName(segment: string): string {
    return segment
      .split(/[-_]/)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');
  }
}

/**
 * CodeIgniter 매칭 전략
 */
class CodeIgniterStrategy implements MatchStrategy {
  name = 'CodeIgniter';

  match(url: string, sourcePath: string, files: string[]): string | null {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname;

    const segments = urlPath.split('/').filter(Boolean);
    if (segments.length === 0) segments.push('home');

    // CI3: application/controllers/{Controller}.php
    // CI4: app/Controllers/{Controller}.php

    // CI3 패턴
    const ci3Controller = path.join(
      sourcePath,
      'application/controllers',
      this.toControllerName(segments[0]) + '.php'
    );
    if (fs.existsSync(ci3Controller)) {
      return ci3Controller;
    }

    // CI4 패턴
    const ci4Controller = path.join(
      sourcePath,
      'app/Controllers',
      this.toControllerName(segments[0]) + '.php'
    );
    if (fs.existsSync(ci4Controller)) {
      return ci4Controller;
    }

    // 뷰 매칭 (CI3)
    const ci3View = path.join(
      sourcePath,
      'application/views',
      segments[0],
      (segments[1] || 'index') + '.php'
    );
    if (fs.existsSync(ci3View)) {
      return ci3View;
    }

    return null;
  }

  private toControllerName(segment: string): string {
    return segment.charAt(0).toUpperCase() + segment.slice(1);
  }
}

/**
 * Symfony 매칭 전략
 */
class SymfonyStrategy implements MatchStrategy {
  name = 'Symfony';

  match(url: string, sourcePath: string, files: string[]): string | null {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname;

    const segments = urlPath.split('/').filter(Boolean);
    if (segments.length === 0) segments.push('default');

    // Symfony: src/Controller/{Controller}Controller.php
    const controllerName = this.toControllerName(segments[0]);
    const controllerPath = path.join(
      sourcePath,
      'src/Controller',
      `${controllerName}Controller.php`
    );

    if (fs.existsSync(controllerPath)) {
      return controllerPath;
    }

    // 템플릿 매칭
    const templatePath = path.join(
      sourcePath,
      'templates',
      segments[0],
      (segments[1] || 'index') + '.html.twig'
    );
    if (fs.existsSync(templatePath)) {
      return templatePath;
    }

    return null;
  }

  private toControllerName(segment: string): string {
    return segment
      .split(/[-_]/)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');
  }
}
