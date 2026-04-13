export type Category = 'family' | 'business' | 'friend' | 'acquaintance'

export interface BusinessCard {
  imageUrl?: string  // 실제 촬영 명함 이미지 URL
  companyNameEn?: string
  address?: string
  website?: string
  department?: string
  fax?: string
  scannedAt?: string // ISO string — OCR로 추가된 날짜
}

export interface Connection {
  id: string
  name: string
  role: string
  company: string
  category: Category
  connectionScore: number // 0.0 ~ 1.0
  lastContactDate: string // ISO string
  contactFrequencyTarget: number // days
  tags: string[]
  contextNotes: string
  email: string
  phone?: string
  birthday?: string
  meetingLocation?: string
  group?: string // constellation grouping key
  businessCard?: BusinessCard
}

// Deterministic pseudo-random from a seed number
export function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000
  return x - Math.floor(x)
}

export const SAMPLE_CONNECTIONS: Connection[] = [
  {
    id: '1',
    name: '김지수',
    role: 'Product Manager',
    company: 'Kakao',
    category: 'business',
    connectionScore: 0.94,
    lastContactDate: '2026-04-10T09:30:00',
    contactFrequencyTarget: 14,
    tags: ['PM', '카카오', '서울대', 'AI'],
    contextNotes: '프로덕트 로드맵 전략에 깊은 통찰력. 주로 점심 미팅을 선호함. 딸 한 명(5살).',
    email: 'jisoo.kim@kakao.com',
    phone: '010-1234-5678',
    birthday: '1992-03-15',
    group: 'tech-pm',
    businessCard: {
      imageUrl: '/placeholder.svg?height=200&width=340',
      companyNameEn: 'Kakao Corp.',
      department: 'Product Division',
      address: '경기도 성남시 분당구 판교역로 166',
      website: 'www.kakao.com',
      scannedAt: '2026-01-15T10:30:00',
    },
  },
  {
    id: '2',
    name: '박민준',
    role: 'CTO',
    company: 'Toss',
    category: 'business',
    connectionScore: 0.88,
    lastContactDate: '2026-04-08T14:00:00',
    contactFrequencyTarget: 21,
    tags: ['CTO', '핀테크', 'VC', 'Next.js'],
    contextNotes: '아키텍처 토론을 즐김. 투자 라운드 준비 중. 주말 골프 애호가.',
    email: 'minjun.park@toss.im',
    group: 'tech-cto',
    businessCard: {
      imageUrl: '/placeholder.svg?height=200&width=340',
      companyNameEn: 'Viva Republica (Toss)',
      department: 'Engineering',
      address: '서울특별시 강남구 테헤란로 131',
      website: 'www.toss.im',
      fax: '02-1234-5679',
      scannedAt: '2026-02-20T15:00:00',
    },
  },
  {
    id: '3',
    name: '이서연',
    role: 'Designer',
    company: 'Naver',
    category: 'friend',
    connectionScore: 0.82,
    lastContactDate: '2026-04-05T19:00:00',
    contactFrequencyTarget: 14,
    tags: ['UX', '네이버', '디자인', '독서'],
    contextNotes: '인터랙션 디자인 전문가. 주말에 전시회 자주 감. 커피 대신 녹차.',
    email: 'seoyeon.lee@navercorp.com',
    birthday: '1995-07-22',
    group: 'design-crew',
  },
  {
    id: '4',
    name: '최현우',
    role: 'VC Partner',
    company: 'Softbank Ventures',
    category: 'business',
    connectionScore: 0.76,
    lastContactDate: '2026-03-28T11:00:00',
    contactFrequencyTarget: 30,
    tags: ['VC', '소프트뱅크', '투자', '스타트업'],
    contextNotes: '시드 ~ 시리즈A 집중 투자. 매달 한 번 네트워킹 디너 진행.',
    email: 'hyunwoo.choi@sbv.com',
    group: 'vc-network',
  },
  {
    id: '5',
    name: '정유진',
    role: 'AI Researcher',
    company: 'Samsung Research',
    category: 'business',
    connectionScore: 0.71,
    lastContactDate: '2026-03-20T16:00:00',
    contactFrequencyTarget: 30,
    tags: ['AI', '삼성', '논문', 'LLM'],
    contextNotes: 'NLP 분야 연구. 최근 멀티모달 논문 공동 저자 제안 받음.',
    email: 'yujin.jung@samsung.com',
    group: 'ai-research',
  },
  {
    id: '6',
    name: '한상훈',
    role: 'CEO',
    company: 'Krafton',
    category: 'acquaintance',
    connectionScore: 0.58,
    lastContactDate: '2026-02-14T18:00:00',
    contactFrequencyTarget: 60,
    tags: ['게임', '크래프톤', 'CEO', 'PUBG'],
    contextNotes: '2024 COEX 게임쇼에서 만남. 게임 산업 글로벌 확장 관심.',
    email: 'sanghoon.han@krafton.com',
    meetingLocation: 'COEX 게임쇼',
    group: 'gaming',
  },
  {
    id: '7',
    name: '오다은',
    role: 'Marketing Lead',
    company: 'Coupang',
    category: 'business',
    connectionScore: 0.52,
    lastContactDate: '2026-02-01T10:30:00',
    contactFrequencyTarget: 45,
    tags: ['마케팅', '쿠팡', '이커머스', 'Growth'],
    contextNotes: '그로스 해킹 전문가. 유럽 확장 프로젝트 진행 중.',
    email: 'daeun.oh@coupang.com',
    group: 'ecommerce',
  },
  {
    id: '8',
    name: '윤재호',
    role: 'Backend Engineer',
    company: 'Kakao',
    category: 'friend',
    connectionScore: 0.67,
    lastContactDate: '2026-03-10T20:00:00',
    contactFrequencyTarget: 21,
    tags: ['개발', '카카오', 'Rust', 'MSA'],
    contextNotes: '대학 동창. MSA 마이그레이션 경험 풍부. 자전거 동호회 활동.',
    email: 'jaeho.yoon@kakao.com',
    birthday: '1993-11-05',
    group: 'tech-pm',
  },
  {
    id: '9',
    name: '임지훈',
    role: 'Investor',
    company: 'Altos Ventures',
    category: 'business',
    connectionScore: 0.44,
    lastContactDate: '2026-01-20T13:00:00',
    contactFrequencyTarget: 60,
    tags: ['VC', '알토스', '투자', '시리즈B'],
    contextNotes: '시리즈 B 이후 투자. 소개받아 연결됨. 팔로업 필요.',
    email: 'jihoon.lim@altos.vc',
    group: 'vc-network',
  },
  {
    id: '10',
    name: '송예은',
    role: 'Data Scientist',
    company: 'Naver',
    category: 'acquaintance',
    connectionScore: 0.35,
    lastContactDate: '2025-11-30T14:00:00',
    contactFrequencyTarget: 90,
    tags: ['데이터', '네이버', 'Python', '추천시스템'],
    contextNotes: '추천 알고리즘 전문. 세미나에서 만남. 연락 뜸해짐.',
    email: 'yeeun.song@navercorp.com',
    group: 'design-crew',
  },
  {
    id: '11',
    name: '강도현',
    role: 'Startup Founder',
    company: 'StealthAI',
    category: 'acquaintance',
    connectionScore: 0.29,
    lastContactDate: '2025-10-15T11:00:00',
    contactFrequencyTarget: 90,
    tags: ['창업', '스텔스', 'AI', 'B2B'],
    contextNotes: '스텔스 모드 AI 스타트업 운영. 파트너십 논의 필요.',
    email: 'dohyun.kang@stealthai.co',
    meetingLocation: '판교 스타트업 허브',
    group: 'ai-research',
  },
  {
    id: '12',
    name: '배수진',
    role: 'HR Director',
    company: 'LG CNS',
    category: 'acquaintance',
    connectionScore: 0.18,
    lastContactDate: '2025-08-20T10:00:00',
    contactFrequencyTarget: 120,
    tags: ['HR', 'LG', '채용', '인사'],
    contextNotes: '채용 연계 네트워크. 오랫동안 연락 없음. 안부 필요.',
    email: 'sujin.bae@lgcns.com',
    group: 'ecommerce',
  },
]

export function getDaysSinceContact(lastContactDate: string): number {
  const last = new Date(lastContactDate)
  const now = new Date()
  return Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
}

export function isDrifting(conn: Connection): boolean {
  return getDaysSinceContact(conn.lastContactDate) > conn.contactFrequencyTarget
}

export function getScoreLabel(score: number): string {
  if (score >= 0.8) return '매우 가까운 인연'
  if (score >= 0.6) return '가까운 인연'
  if (score >= 0.4) return '보통 인연'
  return '멀어지는 인연'
}

export function getCategoryColor(category: Category): string {
  switch (category) {
    case 'family': return '#f5c842'
    case 'business': return '#4b9ef5'
    case 'friend': return '#4ade80'
    case 'acquaintance': return '#a78bfa'
  }
}

export const CATEGORY_LABELS: Record<Category, string> = {
  family: '가족',
  business: '비즈니스',
  friend: '친구',
  acquaintance: '지인',
}
