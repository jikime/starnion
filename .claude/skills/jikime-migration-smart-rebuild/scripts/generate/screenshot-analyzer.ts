/**
 * Screenshot Analyzer
 * UI 분석 결과를 활용하여 코드를 생성합니다.
 *
 * 주의: 스크린샷 분석은 Claude Code가 직접 수행합니다.
 * 이 모듈은 분석 결과(UIAnalysis)를 받아서 코드로 변환하는 역할만 합니다.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface UIAnalysis {
  layout: {
    type: 'hero-content' | 'sidebar-content' | 'grid' | 'single-column' | 'dashboard' | 'landing';
    sections: string[];
  };
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    accent?: string;
  };
  components: {
    type: string;
    description: string;
    position: 'header' | 'main' | 'sidebar' | 'footer';
  }[];
  style: {
    theme: 'modern' | 'classic' | 'minimal' | 'corporate';
    hasHero: boolean;
    hasCards: boolean;
    hasTable: boolean;
    hasForm: boolean;
    hasSidebar: boolean;
  };
  suggestions: string[];
}

/**
 * 기본 UI 분석 결과 생성 (분석 결과가 없을 때 사용)
 */
export function getDefaultUIAnalysis(): UIAnalysis {
  return {
    layout: {
      type: 'single-column',
      sections: ['header', 'main', 'footer'],
    },
    colors: {
      primary: '#3B82F6',
      secondary: '#6B7280',
      background: '#FFFFFF',
      text: '#1F2937',
    },
    components: [],
    style: {
      theme: 'modern',
      hasHero: false,
      hasCards: false,
      hasTable: false,
      hasForm: false,
      hasSidebar: false,
    },
    suggestions: [],
  };
}

/**
 * JSON 문자열에서 UIAnalysis 파싱
 */
export function parseUIAnalysis(jsonString: string): UIAnalysis | null {
  try {
    // 코드 블록 제거
    let jsonText = jsonString.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    }
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    return JSON.parse(jsonText) as UIAnalysis;
  } catch {
    return null;
  }
}

/**
 * UI 분석 결과를 Tailwind v4 CSS 설정으로 변환 (Next.js 16+)
 *
 * Tailwind CSS v4는 tailwind.config.ts 대신 CSS 기반 설정 사용
 * @theme 디렉티브로 커스텀 색상 정의
 */
export function analysisToGlobalsCss(analysis: UIAnalysis): string {
  return `/* app/globals.css - Generated from screenshot analysis */
@import "tailwindcss";

/* Custom theme colors from UI analysis */
@theme {
  /* Primary Colors */
  --color-primary: ${analysis.colors.primary};
  --color-secondary: ${analysis.colors.secondary};

  /* Background & Text */
  --color-background: ${analysis.colors.background};
  --color-foreground: ${analysis.colors.text};
  ${analysis.colors.accent ? `
  /* Accent */
  --color-accent: ${analysis.colors.accent};` : ''}
}

/* Base styles */
body {
  background-color: var(--color-background);
  color: var(--color-foreground);
}
`;
}

/**
 * @deprecated Use analysisToGlobalsCss for Next.js 16+ with Tailwind v4
 * UI 분석 결과를 Tailwind 설정으로 변환 (레거시 - Tailwind v3)
 */
export function analysisToTailwindConfig(analysis: UIAnalysis): string {
  console.warn('Warning: tailwind.config.ts is deprecated in Next.js 16+ with Tailwind v4. Use analysisToGlobalsCss instead.');
  return `// tailwind.config.ts - Generated from screenshot analysis
// NOTE: This file is for Tailwind v3. For Next.js 16+ with Tailwind v4, use globals.css with @theme directive
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '${analysis.colors.primary}',
        secondary: '${analysis.colors.secondary}',
        background: '${analysis.colors.background}',
        foreground: '${analysis.colors.text}',
        ${analysis.colors.accent ? `accent: '${analysis.colors.accent}',` : ''}
      },
    },
  },
  plugins: [],
};

export default config;
`;
}

/**
 * UI 분석 결과를 기반으로 레이아웃 템플릿 선택
 */
export function getLayoutTemplate(analysis: UIAnalysis): string {
  const { layout, style, components } = analysis;

  // 헤더 컴포넌트 찾기
  const hasNavbar = components.some(c => c.type === 'navbar' || c.position === 'header');
  const hasFooter = components.some(c => c.type === 'footer' || c.position === 'footer');

  let template = '';

  // 기본 구조
  if (layout.type === 'sidebar-content') {
    template = `
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-100 p-4">
        {/* Sidebar content */}
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        {/* Page content here */}
      </main>
    </div>`;
  } else if (layout.type === 'hero-content' || layout.type === 'landing') {
    template = `
    <div className="min-h-screen">
      ${style.hasHero ? `{/* Hero Section */}
      <section className="bg-primary text-white py-20 px-4">
        <div className="container mx-auto text-center">
          {/* Hero content */}
        </div>
      </section>` : ''}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        ${style.hasCards ? `{/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card components */}
        </div>` : '{/* Page content here */}'}
      </main>
    </div>`;
  } else if (layout.type === 'grid') {
    template = `
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Grid items */}
        </div>
      </main>
    </div>`;
  } else if (layout.type === 'dashboard') {
    template = `
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md p-4">
        {/* Navigation */}
      </aside>

      {/* Main */}
      <div className="flex-1">
        {/* Header */}
        <header className="bg-white shadow-sm p-4">
          {/* Dashboard header */}
        </header>

        {/* Content */}
        <main className="p-6">
          ${style.hasCards ? `<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Stat cards */}
          </div>` : ''}
          ${style.hasTable ? `<div className="bg-white rounded-lg shadow p-4">
            {/* Data table */}
          </div>` : ''}
        </main>
      </div>
    </div>`;
  } else {
    // single-column (기본)
    template = `
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        {/* Page content here */}
      </main>
    </div>`;
  }

  return template;
}

/**
 * UI 분석 결과와 HTML 콘텐츠를 결합하여 React 컴포넌트 생성
 */
export function generatePageWithAnalysis(
  pagePath: string,
  url: string,
  title: string,
  content: string,
  analysis: UIAnalysis
): string {
  const componentName = pagePath
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/[^a-zA-Z0-9]/g, '') || 'Page';

  const titleCase = componentName.charAt(0).toUpperCase() + componentName.slice(1);
  const { colors, layout, style } = analysis;

  // 배경색과 텍스트색 결정
  const bgClass = colors.background === '#FFFFFF' || colors.background === '#ffffff'
    ? 'bg-white'
    : `bg-[${colors.background}]`;

  return `// ${pagePath}
// Generated from: ${url}
// UI Analysis: ${layout.type} layout, ${style.theme} theme

export const metadata = {
  title: '${escapeString(title)}',
};

export default function ${titleCase}Page() {
  return (
    <div className="min-h-screen ${bgClass}">
      {/* Header */}
      <header className="bg-[${colors.primary}] text-white">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-bold">${escapeJsxText(title)}</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        ${style.hasHero ? `{/* Hero Section */}
        <section className="bg-[${colors.primary}] text-white rounded-lg p-8 mb-8">
          <h2 className="text-3xl font-bold mb-4">${escapeJsxText(title)}</h2>
        </section>
        ` : ''}

        <div className="prose max-w-none">
${content}
        </div>

        ${style.hasCards ? `
        {/* Cards Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {/* Cards will be populated with data */}
        </div>
        ` : ''}
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 mt-auto">
        <div className="container mx-auto px-4 py-6 text-center text-gray-600">
          <p>Generated by Smart Rebuild</p>
        </div>
      </footer>
    </div>
  );
}
`;
}

function escapeString(str: string): string {
  return str.replace(/'/g, "\\'").replace(/\n/g, ' ');
}

function escapeJsxText(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/{/g, '&#123;')
    .replace(/}/g, '&#125;');
}
