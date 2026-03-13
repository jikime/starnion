/**
 * HTML Content Extractor
 * 캡처된 HTML에서 콘텐츠를 추출합니다.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ExtractedContent {
  title: string;
  metaDescription?: string;
  headings: { level: number; text: string }[];
  paragraphs: string[];
  images: { src: string; alt: string }[];
  links: { href: string; text: string }[];
  forms: FormData[];
  tables: TableData[];
  lists: string[][];
}

export interface FormData {
  action?: string;
  method?: string;
  fields: { name: string; type: string; placeholder?: string; label?: string }[];
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

/**
 * HTML 태그 제거
 */
function stripTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * HTML에서 제목 추출
 */
function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? stripTags(match[1]).trim() : '';
}

/**
 * HTML에서 메타 설명 추출
 */
function extractMetaDescription(html: string): string | undefined {
  const match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  if (match) return match[1];

  const match2 = html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  return match2 ? match2[1] : undefined;
}

/**
 * HTML에서 헤딩 추출
 */
function extractHeadings(html: string): { level: number; text: string }[] {
  const headings: { level: number; text: string }[] = [];
  const regex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const text = stripTags(match[2]).trim();
    if (text) {
      headings.push({ level: parseInt(match[1]), text });
    }
  }

  return headings;
}

/**
 * HTML에서 단락 추출
 */
function extractParagraphs(html: string): string[] {
  const paragraphs: string[] = [];
  const regex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const text = stripTags(match[1]).trim();
    if (text && text.length > 20) { // 20자 이상만
      paragraphs.push(text);
    }
  }

  return paragraphs.slice(0, 20); // 최대 20개
}

/**
 * HTML에서 이미지 추출
 */
function extractImages(html: string, baseUrl: string): { src: string; alt: string }[] {
  const images: { src: string; alt: string }[] = [];
  const regex = /<img[^>]*src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    let src = match[1];
    const alt = match[2] || '';

    // 상대 경로를 절대 경로로 변환
    if (src.startsWith('/')) {
      try {
        const url = new URL(baseUrl);
        src = `${url.protocol}//${url.host}${src}`;
      } catch {
        // ignore
      }
    } else if (!src.startsWith('http')) {
      try {
        const url = new URL(baseUrl);
        src = `${url.protocol}//${url.host}/${src}`;
      } catch {
        // ignore
      }
    }

    // 트래킹 픽셀 등 제외
    if (!src.includes('1x1') && !src.includes('pixel') && !src.includes('tracking')) {
      images.push({ src, alt });
    }
  }

  return images.slice(0, 30); // 최대 30개
}

/**
 * HTML에서 링크 추출
 */
function extractLinks(html: string): { href: string; text: string }[] {
  const links: { href: string; text: string }[] = [];
  const regex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    const text = stripTags(match[2]).trim();

    if (text && !href.startsWith('#') && !href.startsWith('javascript:')) {
      links.push({ href, text });
    }
  }

  return links.slice(0, 50); // 최대 50개
}

/**
 * HTML에서 폼 추출
 */
function extractForms(html: string): FormData[] {
  const forms: FormData[] = [];
  const formRegex = /<form[^>]*>([\s\S]*?)<\/form>/gi;
  let formMatch;

  while ((formMatch = formRegex.exec(html)) !== null) {
    const formHtml = formMatch[0];
    const formContent = formMatch[1];

    // action과 method 추출
    const actionMatch = formHtml.match(/action=["']([^"']+)["']/i);
    const methodMatch = formHtml.match(/method=["']([^"']+)["']/i);

    const fields: FormData['fields'] = [];

    // input 필드 추출
    const inputRegex = /<input[^>]*>/gi;
    let inputMatch;
    while ((inputMatch = inputRegex.exec(formContent)) !== null) {
      const input = inputMatch[0];
      const nameMatch = input.match(/name=["']([^"']+)["']/i);
      const typeMatch = input.match(/type=["']([^"']+)["']/i);
      const placeholderMatch = input.match(/placeholder=["']([^"']+)["']/i);

      if (nameMatch) {
        fields.push({
          name: nameMatch[1],
          type: typeMatch ? typeMatch[1] : 'text',
          placeholder: placeholderMatch ? placeholderMatch[1] : undefined,
        });
      }
    }

    // textarea 추출
    const textareaRegex = /<textarea[^>]*name=["']([^"']+)["'][^>]*>/gi;
    let textareaMatch;
    while ((textareaMatch = textareaRegex.exec(formContent)) !== null) {
      fields.push({
        name: textareaMatch[1],
        type: 'textarea',
      });
    }

    // select 추출
    const selectRegex = /<select[^>]*name=["']([^"']+)["'][^>]*>/gi;
    let selectMatch;
    while ((selectMatch = selectRegex.exec(formContent)) !== null) {
      fields.push({
        name: selectMatch[1],
        type: 'select',
      });
    }

    if (fields.length > 0) {
      forms.push({
        action: actionMatch ? actionMatch[1] : undefined,
        method: methodMatch ? methodMatch[1] : 'GET',
        fields,
      });
    }
  }

  return forms;
}

/**
 * HTML에서 테이블 추출
 */
function extractTables(html: string): TableData[] {
  const tables: TableData[] = [];
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableContent = tableMatch[1];

    // 헤더 추출
    const headers: string[] = [];
    const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let thMatch;
    while ((thMatch = thRegex.exec(tableContent)) !== null) {
      headers.push(stripTags(thMatch[1]).trim());
    }

    // 행 추출
    const rows: string[][] = [];
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(tableContent)) !== null) {
      const row: string[] = [];
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tdMatch;
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
        row.push(stripTags(tdMatch[1]).trim());
      }
      if (row.length > 0) {
        rows.push(row);
      }
    }

    if (headers.length > 0 || rows.length > 0) {
      tables.push({ headers, rows: rows.slice(0, 20) }); // 최대 20행
    }
  }

  return tables.slice(0, 5); // 최대 5개 테이블
}

/**
 * HTML에서 리스트 추출
 */
function extractLists(html: string): string[][] {
  const lists: string[][] = [];
  const listRegex = /<[ou]l[^>]*>([\s\S]*?)<\/[ou]l>/gi;
  let listMatch;

  while ((listMatch = listRegex.exec(html)) !== null) {
    const items: string[] = [];
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(listMatch[1])) !== null) {
      const text = stripTags(liMatch[1]).trim();
      if (text) {
        items.push(text);
      }
    }
    if (items.length > 0) {
      lists.push(items.slice(0, 20)); // 최대 20개 항목
    }
  }

  return lists.slice(0, 10); // 최대 10개 리스트
}

/**
 * HTML 파일에서 콘텐츠 추출
 */
export function extractContentFromHtml(htmlPath: string, baseUrl: string): ExtractedContent {
  const html = fs.readFileSync(htmlPath, 'utf-8');

  return {
    title: extractTitle(html),
    metaDescription: extractMetaDescription(html),
    headings: extractHeadings(html),
    paragraphs: extractParagraphs(html),
    images: extractImages(html, baseUrl),
    links: extractLinks(html),
    forms: extractForms(html),
    tables: extractTables(html),
    lists: extractLists(html),
  };
}

/**
 * 추출된 콘텐츠를 React 컴포넌트로 변환
 */
export function contentToReactJsx(content: ExtractedContent): string {
  const sections: string[] = [];

  // 헤딩
  content.headings.forEach((h) => {
    const Tag = `h${h.level}`;
    sections.push(`      <${Tag} className="font-bold mb-4">${escapeJsx(h.text)}</${Tag}>`);
  });

  // 단락
  content.paragraphs.forEach((p) => {
    sections.push(`      <p className="mb-4 text-gray-700">${escapeJsx(p)}</p>`);
  });

  // 이미지
  if (content.images.length > 0) {
    sections.push(`      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 my-6">`);
    content.images.slice(0, 6).forEach((img) => {
      sections.push(`        <img src="${escapeJsx(img.src)}" alt="${escapeJsx(img.alt)}" className="rounded-lg shadow-md" />`);
    });
    sections.push(`      </div>`);
  }

  // 리스트
  content.lists.forEach((list) => {
    sections.push(`      <ul className="list-disc list-inside mb-4 space-y-2">`);
    list.forEach((item) => {
      sections.push(`        <li>${escapeJsx(item)}</li>`);
    });
    sections.push(`      </ul>`);
  });

  return sections.join('\n');
}

/**
 * JSX 이스케이프
 */
function escapeJsx(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/{/g, '&#123;')
    .replace(/}/g, '&#125;');
}
