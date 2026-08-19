import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pglhlesnyfncaupiwkwz.supabase.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  serverExternalPackages: ['sharp'],
  /*
   * **sharp의 네이티브 라이브러리를 함수 번들에 강제로 넣는다**(2026-08-19 장애).
   *
   * `serverExternalPackages: ['sharp']`만으로는 부족하다. 그 설정은 sharp를 번들에
   * 인라인하지 않고 `require`로 넘기라는 뜻일 뿐이고, **파일이 함수에 복사되는지는
   * 별개 문제**다. 트레이서가 `@img/sharp-libvips-linux-x64`의 `lib/index.js`는
   * 따라가면서 그 js가 dlopen하는 `lib/libvips-cpp.so.8.18.3`은 못 본다 —
   * dlopen은 정적 분석으로 추적되지 않는다.
   *
   * 게임 클라이언트(`gookbapgame`)에서 같은 원인으로 서버 액션이 전부 500이 났고,
   * 빌드 산출물(`.nft.json`)을 실측해 확인했다: libvips 패키지 파일 3개가 추적됐는데
   * `.so`는 0건이었다. 그쪽에 같은 설정을 넣자 `.so`가 들어갔다.
   *
   * 이 저장소의 증상은 `/api/generate-unified`가 **모든 요청에 500**이었다. 빈 배열
   * (`{"combinations":[]}`)은 코드상 400이어야 하는데 500이 났고 — 그 판정 줄에
   * 도달조차 못 한다는 뜻이다 — sharp를 타지 않는 `OPTIONS`만 204로 정상이었다.
   * `utils/imageProcessor.ts`가 최상위에서 sharp를 import하므로 로드 실패가 곧
   * 라우트 전체의 실패가 된다.
   *
   * `@img/**`로 통째로 넣는 이유는 sharp가 플랫폼 패키지를 런타임에 고르기 때문이다.
   * 개별 경로를 박으면 sharp 버전이나 배포 아키텍처가 바뀔 때 조용히 다시 빠진다.
   */
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/@img/**"],
    "/main/spot-difference/**": ["./node_modules/@img/**"],
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization" },
        ]
      }
    ]
  }
};

export default nextConfig;
