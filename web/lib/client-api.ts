import { signOut } from "next-auth/react"

// 중복 리다이렉트 방지 플래그
let _redirectingToLogin = false

/**
 * 클라이언트 전용 API fetch wrapper.
 * - 401 응답 수신 시 자동으로 signOut + /login 리다이렉트
 * - 서버 컴포넌트에서는 사용 불가 (signOut from next-auth/react)
 */
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init)

  if (res.status === 401 && !_redirectingToLogin) {
    _redirectingToLogin = true
    signOut({ redirectTo: "/login" })
  }

  return res
}
