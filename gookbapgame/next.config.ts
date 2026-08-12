import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 같은 공유기의 실기(iPhone 등)에서 dev 서버에 접속하기 위한 설정.
  // 이게 없으면 첫 화면(서버 렌더된 HTML)만 뜨고 `/_next/*` 청크와 HMR이 차단돼
  // 게임 진입이 안 된다 — "첫 화면 버튼만 눌린다"는 증상으로 나타난다(2026-08-12).
  // **dev 전용 설정이라 프로덕션 빌드에는 아무 영향이 없다.**
  // 공유기 대역이 바뀌어도 그대로 쓰도록 사설 IP 3개 대역을 모두 적어둔다.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*"],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pglhlesnyfncaupiwkwz.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
