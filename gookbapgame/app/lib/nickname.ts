// GDD 6.7: 형용사 100 + 명사 100 조합이 최종 목표이나, 이번 스펙은 구조 검증이
// 목적이므로 24개씩의 placeholder 목록으로 시작한다. 카피는 추후 확장.
const ADJECTIVES = [
  "든든한", "행복한", "푸짐한", "따뜻한", "시원한", "쫄깃한", "얼큰한", "담백한",
  "진한", "깊은", "정겨운", "구수한", "훈훈한", "넉넉한", "뜨끈한", "살뜰한",
  "야무진", "알찬", "정성스런", "소담한", "활기찬", "명랑한", "씩씩한", "포근한",
];

const NOUNS = [
  "솥밥", "숟가락", "뚝배기", "육수", "국밥", "김치", "부추", "수육",
  "젓가락", "뼈다귀", "순대", "깍두기", "국물", "밥공기", "장인", "한그릇",
  "뚝심", "손맛", "불맛", "국밥러", "미식가", "탐험가", "애호가", "단골",
];

export function generateNickname(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adjective} ${noun}`;
}
