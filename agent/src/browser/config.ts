export type BrowserConfig = {
  enabled: boolean;
  evaluateEnabled: boolean; // JS evaluate 허용 여부 (보안상 기본 false)
  controlPort: number;      // HTTP 서버 포트 (기본: 18791)
  authToken?: string;       // 선택적 Bearer 토큰 인증
  defaultProfile: string;
  profiles: Record<string, BrowserProfileConfig>;
};

export type BrowserProfileConfig = {
  userDataDir?: string; // Chrome 프로파일 경로 (없으면 기본 프로파일)
  browserUrl?: string;  // 실행 중인 Chrome에 직접 연결 e.g. "http://127.0.0.1:9222"
};

export function resolveBrowserConfig(raw?: Partial<BrowserConfig>): BrowserConfig {
  return {
    enabled: raw?.enabled ?? true,
    evaluateEnabled: raw?.evaluateEnabled ?? false,
    controlPort: raw?.controlPort ?? 18791,
    authToken: raw?.authToken,
    defaultProfile: raw?.defaultProfile ?? "default",
    profiles: raw?.profiles ?? {
      default: {},
    },
  };
}
