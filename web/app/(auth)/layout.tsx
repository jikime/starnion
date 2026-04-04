import Image from "next/image"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div
        className="hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col items-center justify-center relative overflow-hidden"
        style={{ background: "oklch(0.18 0.06 252.00)" }}
      >
        {/* Background glow */}
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

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center px-12 max-w-lg">
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

          <div className="mb-3">
            <span
              className="text-3xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-sans)", color: "oklch(0.95 0.02 210.00)" }}
            >
              Star
            </span>
            <span
              className="text-3xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-sans)", color: "oklch(0.72 0.15 210.00)" }}
            >
              Nion
            </span>
          </div>

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

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 bg-background">
        <div className="lg:hidden mb-8 text-center">
          <span className="text-2xl font-bold" style={{ fontFamily: "var(--font-sans)" }}>
            Star
          </span>
          <span
            className="text-2xl font-bold"
            style={{ color: "oklch(0.72 0.15 210.00)", fontFamily: "var(--font-sans)" }}
          >
            Nion
          </span>
        </div>

        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}
