import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * **sharp의 네이티브 라이브러리를 함수 번들에 강제로 넣는다**(2026-08-19 장애).
   *
   * 트레이서가 `@img/sharp-libvips-linux-x64`의 `lib/index.js`·`package.json`은 따라가면서
   * **그 js가 dlopen하는 `lib/libvips-cpp.so.8.18.3`은 못 본다**(실측: `.nft.json`에
   * libvips 관련 파일 3개가 들어갔는데 `.so`는 0건). 정적 분석으로 추적되지 않는 것이라
   * 캐시를 지우고 다시 배포해도 결과가 같다 — 실제로 캐시 없는 재배포로 해결되지 않았다.
   *
   * 그래서 프로덕션에서 서버 액션이 전부 500이 났다:
   *   Could not load the "sharp" module using the linux-x64 runtime
   *   ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file
   *
   * `**` 하나로 `@img` 전체를 넣는 이유는 sharp가 플랫폼 패키지를 런타임에 고르기
   * 때문이다. 개별 경로를 박으면 sharp나 배포 아키텍처가 바뀔 때 조용히 다시 빠진다.
   *
   * `serverExternalPackages`는 답이 아니다 — sharp는 Next의 기본 external 목록에 이미
   * 있고, 에러 문구가 "Failed to load **external** module"인 것이 그 증거다.
   * externalize는 되어 있고 문제는 파일이 함수에 복사되지 않은 것이다.
   */
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@img/**"],
  },
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
