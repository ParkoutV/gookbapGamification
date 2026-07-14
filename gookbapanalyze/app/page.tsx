import { redirect } from "next/navigation";

export default function Home() {
  // 미들웨어에서도 처리하지만, 안전하게 페이지 단에서도 루트 URL 접근 시 /login으로 리다이렉트합니다.
  redirect("/login");
}
