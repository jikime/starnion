import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

// 인증 없이 접근 가능한 경로 목록
const PUBLIC_PATHS = new Set(["/login", "/register"])

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  // Next Auth 내부 API는 항상 허용
  if (pathname.startsWith("/api/auth")) return NextResponse.next()

  const isAuthPage = PUBLIC_PATHS.has(pathname)

  // 비로그인 상태에서 보호된 페이지 접근 → 로그인 페이지로 이동
  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  // 로그인 상태에서 인증 페이지(로그인/회원가입) 접근 → 홈으로 이동
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    // 정적 파일, 이미지, 파비콘 등 제외
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|.*\\.png|.*\\.svg|.*\\.ico).*)",
  ],
}
