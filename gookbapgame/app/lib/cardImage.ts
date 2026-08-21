import { CODE_BLOCK } from "./cardFace";

/**
 * 카드 앞면을 PNG로 굽는다. 공유 시트("이미지 저장"/"앨범에 저장")에 넘길 파일을
 * 만들기 위한 것으로, 화면의 DOM을 그대로 캡처하는 게 아니라 같은 구성을
 * canvas에 다시 그린다.
 *
 * DOM 캡처(html2canvas 등)를 쓰지 않는 이유: 의존성이 크고, 이 카드는 요소가
 * 몇 개 안 되며(배경 1장, QR 1장, 텍스트 2줄, 코너 이모지 2개) 좌표도 애셋
 * 비율로 고정돼 있어서 직접 그리는 편이 짧고 결과가 예측 가능하다.
 */

/** 애셋 원본 크기. 좌표를 전부 이 격자 기준 비율로 잡는다. */
const CARD_W = 1000;
const CARD_H = 1371;

/** 화면의 CARD_FACE_INK와 **반드시 같은 값**. 밝은 카드면 위의 글자색이다. */
const INK = "#1A1F24";

/** 화면의 STAMP_INK(`GatchaCard`)와 **반드시 같은 값**. 사용 완료·만료 도장 색이다. */
const STAMP_INK = "#B3261E";

/**
 * 이모지 폰트의 실제 family 이름. next/font가 이름을 해싱하므로 하드코딩할 수 없고,
 * layout.tsx가 심어둔 CSS 변수(--font-emoji)에서 읽는다.
 *
 * 그 변수에는 폰트가 **두 개** 들어 있다(`"notoEmoji", "notoEmoji Fallback"`).
 * 뒤엣것은 next/font가 레이아웃 시프트를 줄이려고 만든 로컬 메트릭 폰트라
 * 네트워크에서 받을 수 없다 — 목록을 통째로 document.fonts.load()에 넘기면
 * 그걸 받으려다 NetworkError가 난다. 그래서 첫 항목만 떼어 쓴다.
 */
function emojiFontFamily(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-emoji")
    .trim();
  const first = value.split(",")[0]?.trim() ?? "";
  // 변수를 못 찾으면 빈 문자열이 되는데, 그대로 font 문자열에 넣으면 파싱이 깨져
  // 폰트 지정 전체가 무시된다. 그럴 바엔 sans-serif만 남기는 편이 안전하다.
  return first || "sans-serif";
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 같은 오리진의 정적 애셋이지만, 붙여둬야 캔버스가 오염되지 않는 게 보장된다.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${src}`));
    img.src = src;
  });
}

/** SVG 엘리먼트를 이미지로. QR은 qrcode.react가 그린 <svg>다. */
function svgToImage(svg: SVGElement): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGElement;
  // 직렬화된 SVG는 문서 밖에서 렌더되므로 크기를 명시해야 한다.
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const source = new XMLSerializer().serializeToString(clone);
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`);
}

/**
 * 텍스트를 maxWidth 안에서 줄로 나눈다. 한국어는 어절 단위로 끊는다
 * (화면의 break-keep과 같은 규칙). 현재 ctx.font 기준으로 측정하므로
 * 호출 전에 폰트를 정해둬야 한다.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export type CardImageInput = {
  /** qrcode.react가 렌더한 <svg>. 없으면 QR 없이 그린다. */
  qrSvg: SVGElement | null;
  /**
   * 온라인몰 쿠폰의 평문 코드. **`qrSvg` 자리에 대신 그린다** — 그쪽은 QR도
   * 사용기한도 없고 코드를 몰에 붙여넣는 물건이라, 같은 자리에 코드를 올리는
   * 것이 이 카드의 전부다(2026-08-21, 이란토).
   *
   * 둘 다 오면 **QR이 이긴다**. 매장 쿠폰에 코드가 실릴 일은 없지만, 그런 조합이
   * 생기면 스캔되는 쪽을 남기는 편이 안전하다.
   */
  codeText?: string | null;
  couponName: string;
  /**
   * 이미 지역화된 날짜 줄들(발급일·시작일·사용기한). 빈 배열이면 생략한다.
   * 화면(`GatchaCard`)과 **같은 배열**을 받아야 한다 — `couponDateLines`가 조립한다.
   */
  dateTexts: string[];
  emoji: string;
  /**
   * 사용 완료·만료 도장 문구. null이면 그리지 않는다.
   * 화면(`GatchaCard`의 `usedStamp`)과 **같은 값**을 받아야 한다.
   */
  usedStamp?: string | null;
};

export async function renderCardImage(input: CardImageInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d 컨텍스트를 만들 수 없습니다.");

  // 폰트가 아직 안 받아졌으면 canvas는 조용히 폴백으로 그린다 — 저장본만 시스템
  // 이모지가 되어 화면과 달라진다. 그리기 전에 로드를 확실히 해둔다.
  const emojiFont = emojiFontFamily();
  try {
    await document.fonts.load(`64px ${emojiFont}`, input.emoji);
  } catch (error) {
    // 실패해도 그리기는 계속한다. 이모지 모양이 폴백이 될 뿐 카드는 나온다.
    console.error("[renderCardImage] 이모지 폰트 로드 실패:", error);
  }

  const background = await loadImage("/icons/card-front.webp");
  ctx.drawImage(background, 0, 0, CARD_W, CARD_H);

  // 안쪽 테두리는 **그리지 않는다** — 애셋(card-front.webp)에 이미 인쇄돼 있다
  // (2026-08-11). 화면 쪽 .card-inner-frame도 같은 이유로 선 그리기를 걷어냈다.
  // 여기서 또 그리면 애셋 위에 두 겹이 겹쳐 굵어진다.
  //
  // 좌표는 여전히 필요하다 — 코너 마크와 본문을 프레임 안쪽에 앉혀야 하기 때문이다.
  // 화면의 inset-x-[13%] / inset-y-[11%]와 같은 비율이고, 애셋 실측(프레임 bbox
  // x 136~868, y 152~1216)과도 일치한다.
  const left = CARD_W * 0.13;
  const top = CARD_H * 0.11;
  const right = CARD_W - left;
  const bottom = CARD_H - top;
  // 애셋에 파인 노치 한 변. 실측 약 128px(원본 1000px 기준)이라 12.8%다.
  // 화면의 --notch(프레임 폭의 17.5%)와 같은 자리를 가리킨다 — 기준이 프레임 폭이냐
  // 카드 폭이냐만 다르다(732 * 0.175 ≈ 128 = 1000 * 0.128).
  const notch = CARD_W * 0.128;

  // 코너 마크는 파인 정사각의 중앙에 놓는다.
  //
  // 화면과 같은 흑백 서브셋 폰트를 쓴다. sans-serif로 두면 시스템 이모지가 잡혀
  // 저장본만 컬러가 되고 기기마다 모양도 달라진다. 폰트 이름은 next/font가
  // 해싱하므로 CSS 변수에서 실제 이름을 읽어온다.
  ctx.fillStyle = INK;
  ctx.font = `64px ${emojiFont}, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(input.emoji, left + notch / 2, top + notch / 2);
  ctx.fillText(input.emoji, right - notch / 2, bottom - notch / 2);

  const centerX = CARD_W / 2;
  ctx.textAlign = "center";

  /*
   * 본문은 화면과 **같은 방식으로 중앙 정렬**한다.
   *
   * 예전에는 `CARD_H * 0.3`에서 시작해 아래로 쌓았는데, 화면 쪽은 flex
   * `justify-center`라 배치 원리가 서로 달랐다 — 내용이 짧으면 화면은 전체가
   * 가운데 유지되는 반면 canvas는 위가 고정이라 아래로만 밀렸다. 실측하니
   * QR 상단이 26.6%(화면) vs 30%(저장본)로 어긋나 있었다(2026-08-11).
   *
   * 그래서 전체 높이를 먼저 재고 프레임 세로 중앙에 앉힌다. 화면 구조는
   *   프레임(justify-center, gap G)
   *     ├ [QR, 상품명] 블록 (gap G)
   *     └ 만료 문구
   * 이고, 아래 GAP과 블록 순서가 그것을 그대로 옮긴 것이다.
   * **GatchaCard의 gap-3(12px)을 바꾸면 여기 GAP도 같이 바꿔야 한다.**
   */
  const GAP = CARD_W * 0.0354; // 화면 gap-3(12px) ÷ 카드 폭 339px
  const qrSize = CARD_W * CODE_BLOCK.width;
  const textMaxWidth = right - left - 60;

  /*
   * 상품명 위에 오는 블록의 높이. QR이면 정사각, 온라인몰 코드면 한 줄짜리 박스,
   * 둘 다 없으면(꽝) 0이다.
   *
   * **이 값을 세 곳이 함께 본다** — 남는 높이 계산(availableHeight), 전체 높이
   * (contentHeight), 그리기 커서. 예전에는 `input.qrSvg ? qrSize + GAP : 0`이
   * 세 자리에 각각 적혀 있었는데, 종류가 둘로 늘면서 한 곳만 고치면 상품명이
   * 프레임 밖으로 밀려나게 된다. 변수 하나로 모아 그 여지를 없앤다.
   */
  const codeBoxHeight = CARD_W * CODE_BLOCK.height;
  const hasCode = !input.qrSvg && typeof input.codeText === "string" && input.codeText !== "";
  const topBlockHeight = input.qrSvg ? qrSize : hasCode ? codeBoxHeight : 0;
  const topBlockSpace = topBlockHeight > 0 ? topBlockHeight + GAP : 0;

  ctx.fillStyle = INK;

  // 상품명은 대시보드 자유 입력이라 길이가 정해져 있지 않다. 화면에서는
  // overflow-hidden이 잘라주지만 캔버스에는 그런 게 없어서, 긴 이름이 들어오면
  // 만료 문구가 테두리 밖으로 밀려난다. 프레임 안에 들어갈 때까지 글자를 줄인다.
  // 날짜 줄들은 화면에서 **하나의 블록**이다(GatchaCard에서 div로 묶었다). 그래서
  // 바깥 GAP은 블록 앞에 한 번만 붙고, 줄 사이는 line-height(1.4)만으로 벌어진다.
  // 줄마다 GAP을 더하면 화면보다 아래로 늘어져 저장본만 달라진다.
  const dateFontSize = CARD_W * 0.041; // 화면 text-sm(14px) 기준
  const dateLineHeight = dateFontSize * 1.4;
  const dateBlockHeight =
    input.dateTexts.length > 0 ? input.dateTexts.length * dateLineHeight + GAP : 0;

  // 날짜는 기간 한 줄이다(2026-08-13에 3줄에서 합쳤다). 3줄 시절에는 상품명이 쓸 수
  // 있는 높이가 그만큼 줄어 긴 이름이 아래 루프의 30px 바닥에 빨리 닿았는데, 한 줄로
  // 돌아오면서 여유가 생겼다. **줄을 다시 늘리려면 그 제약을 먼저 볼 것.**
  //
  // 날짜 문구에 비ASCII 글리프를 넣지 말 것 — 여기는 sans-serif라 안전하지만, 화면
  // 쪽과 픽셀 폰트 서브셋이 로케일 파일 전체 문자를 훑는다(`couponDates.ts` 참고).
  const availableHeight = bottom - top - topBlockSpace - dateBlockHeight;

  let nameFontSize = CARD_W * 0.0531; // 화면 text-lg(18px) 기준
  let nameLines = [] as string[];
  while (true) {
    ctx.font = `bold ${nameFontSize}px sans-serif`;
    nameLines = wrapText(ctx, input.couponName, textMaxWidth);
    // 30px 아래로는 더 줄여도 읽기만 나빠진다. 그 지점에서 멈추고 넘치는 줄은 자른다.
    if (nameLines.length * (nameFontSize * 1.23) <= availableHeight || nameFontSize <= 30) break;
    nameFontSize -= 4;
  }

  const nameLineHeight = nameFontSize * 1.23;
  const maxLines = Math.max(1, Math.floor(availableHeight / nameLineHeight));
  const drawnLines = nameLines.slice(0, maxLines);
  const nameHeight = drawnLines.length * nameLineHeight;

  // 전체 높이를 재서 프레임 세로 중앙에 앉힌다.
  const contentHeight = topBlockSpace + nameHeight + dateBlockHeight;
  let cursorY = top + (bottom - top - contentHeight) / 2;

  // QR. 흰 배경과 quiet zone은 **SVG가 자체적으로 들고 있다**(CouponQR의 marginSize) —
  // 여기서 흰 사각형을 따로 깔지 않는다. 예전에는 canvas가 깔았는데, 그러면 화면과
  // 저장본이 여백을 서로 다른 방식으로 만들게 되어 크기가 조용히 어긋난다.
  // 테두리만 화면(border border-black/25)과 같은 색으로 두른다.
  if (input.qrSvg) {
    const qrImage = await svgToImage(input.qrSvg);
    const qrX = centerX - qrSize / 2;
    ctx.drawImage(qrImage, qrX, cursorY, qrSize, qrSize);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(qrX, cursorY, qrSize, qrSize);

    // 사용 완료·만료 도장. QR **위에** 덮어 스캔용으로 못 쓰게 한다 — 화면
    // (`GatchaCard`)과 같은 구성이어야 저장본이 어긋나지 않는다. 색·기울기·테두리를
    // 양쪽이 각자 들고 있으므로 한쪽만 고치지 말 것.
    if (input.usedStamp) {
      ctx.save();
      ctx.fillStyle = "rgba(242, 242, 242, 0.82)";
      ctx.fillRect(qrX, cursorY, qrSize, qrSize);

      const stampFontSize = qrSize * 0.16;
      ctx.font = `bold ${stampFontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const cx = centerX;
      const cy = cursorY + qrSize / 2;
      ctx.translate(cx, cy);
      ctx.rotate((-12 * Math.PI) / 180); // 화면의 -rotate-12와 같은 각도
      ctx.fillStyle = STAMP_INK;
      ctx.strokeStyle = STAMP_INK;
      const textWidth = ctx.measureText(input.usedStamp).width;
      const padX = stampFontSize * 0.5;
      const padY = stampFontSize * 0.35;
      ctx.lineWidth = 3;
      ctx.strokeRect(
        -textWidth / 2 - padX,
        -stampFontSize / 2 - padY,
        textWidth + padX * 2,
        stampFontSize + padY * 2
      );
      ctx.fillText(input.usedStamp, 0, 0);
      ctx.restore();
      // textBaseline/Align은 아래에서 다시 세팅되지만, save/restore로 되돌려 두는 것이
      // 이 블록만 읽어도 안전함을 보장한다.
    }

    cursorY += topBlockSpace;
  }

  /*
   * 온라인몰 쿠폰의 코드. QR과 **같은 폭·같은 자리**에 테두리 박스를 두르고 그 안에
   * 코드를 중앙 정렬한다 — 화면(`GatchaCard`)이 같은 구성을 그리므로 한쪽만 바꾸면
   * 저장본이 어긋난다. 테두리 색도 QR과 같은 값이다.
   *
   * 등폭 글꼴을 쓰는 이유: 코드는 사람이 눈으로 옮겨 적을 수 있어야 하고,
   * 0/O·1/l이 갈려야 한다.
   */
  if (hasCode) {
    const boxX = centerX - qrSize / 2;
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, cursorY, qrSize, codeBoxHeight);

    ctx.fillStyle = INK;
    ctx.font = `bold ${CARD_W * CODE_BLOCK.font}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(input.codeText as string, centerX, cursorY + codeBoxHeight / 2);

    cursorY += topBlockSpace;
  }

  ctx.textBaseline = "top";
  ctx.font = `bold ${nameFontSize}px sans-serif`;
  drawnLines.forEach((line, i) => {
    ctx.fillText(line, centerX, cursorY + i * nameLineHeight);
  });
  cursorY += nameHeight + GAP;

  if (input.dateTexts.length > 0) {
    ctx.font = `${dateFontSize}px sans-serif`;
    ctx.globalAlpha = 0.7;
    input.dateTexts.forEach((text, i) => {
      ctx.fillText(text, centerX, cursorY + i * dateLineHeight);
    });
    ctx.globalAlpha = 1;
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("이미지 변환에 실패했습니다."))),
      "image/png"
    );
  });
}
