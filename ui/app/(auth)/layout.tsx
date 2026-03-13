import Image from "next/image"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* 왼쪽 브랜드 패널 */}
      <div
        className="hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col items-center justify-center relative overflow-hidden"
        style={{ background: "oklch(0.18 0.06 252.00)" }}
      >
        {/* 배경 글로우 효과 */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 40%, oklch(0.72 0.15 210.00), transparent)",
          }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-64 opacity-10"
          style={{
            background:
              "radial-gradient(ellipse 100% 80% at 50% 100%, oklch(0.72 0.15 210.00), transparent)",
          }}
        />

        {/* 콘텐츠 */}
        <div className="relative z-10 flex flex-col items-center text-center px-12 max-w-lg">
          {/* 캐릭터 이미지 */}
          <div className="mb-10 drop-shadow-2xl">
            <Image
              src="/nion_character.png"
              alt="Nion — Your Stellar Companion"
              width={260}
              height={260}
              className="object-contain"
              priority
            />
          </div>

          {/* 브랜드명 */}
          <div className="mb-3 flex items-center gap-2">
            <span
              className="text-3xl font-bold tracking-tight"
              style={{ color: "oklch(0.72 0.15 210.00)", fontFamily: "var(--font-sans)" }}
            >
              star
            </span>
            <span
              className="text-3xl font-bold tracking-tight"
              style={{ color: "oklch(0.95 0.02 210.00)", fontFamily: "var(--font-sans)" }}
            >
              nion
            </span>
          </div>

          {/* 핵심 철학 */}
          <h2
            className="text-xl font-semibold mb-4 leading-snug"
            style={{ color: "oklch(0.95 0.02 210.00)", fontFamily: "var(--font-sans)" }}
          >
            Your Stellar Companion
            <br />
            in Every Task.
          </h2>

          <p
            className="text-sm leading-relaxed"
            style={{ color: "oklch(0.70 0.04 240.00)", fontFamily: "var(--font-sans)" }}
          >
            A hyper-personalized AI agent platform for finance, journaling,
            goals, and daily life — with Nion by your side.
          </p>

          {/* 하단 장식 점 */}
          <div className="mt-12 flex gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: i === 1 ? 24 : 6,
                  height: 6,
                  background:
                    i === 1
                      ? "oklch(0.72 0.15 210.00)"
                      : "oklch(0.40 0.05 240.00)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 오른쪽 폼 패널 */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 bg-background">
        {/* 모바일에서 보이는 로고 */}
        <div className="lg:hidden mb-8 text-center">
          <span
            className="text-2xl font-bold"
            style={{ color: "oklch(0.72 0.15 210.00)", fontFamily: "var(--font-sans)" }}
          >
            star
          </span>
          <span className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-sans)" }}>
            nion
          </span>
        </div>

        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}
