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

/** 화면의 CARD_FACE_INK와 같은 값. 밝은 카드면 위의 글자색이다. */
const INK = "#3A2E24";

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
  couponName: string;
  /** 이미 지역화된 만료 안내 문구. null이면 생략. */
  expiryText: string | null;
  emoji: string;
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

  // 안쪽 테두리 — 화면의 inset-x-[13%] / inset-y-[11%]와 같은 비율.
  // 좌상/우하 모서리는 정사각으로 파고(화면의 --notch), 그 자리에 코너 마크가 들어간다.
  const left = CARD_W * 0.13;
  const top = CARD_H * 0.11;
  const right = CARD_W - left;
  const bottom = CARD_H - top;
  // 화면의 --notch(44px)를 카드 폭 기준 비율로 환산한 값. 화면에서 테두리 폭이
  // 대략 카드의 74%이므로 그 안에서 차지하던 비중을 유지한다.
  const notch = CARD_W * 0.115;

  ctx.strokeStyle = `${INK}73`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(left + notch, top);
  ctx.lineTo(right, top);
  ctx.lineTo(right, bottom - notch);
  ctx.lineTo(right - notch, bottom - notch);
  ctx.lineTo(right - notch, bottom);
  ctx.lineTo(left, bottom);
  ctx.lineTo(left, top + notch);
  ctx.lineTo(left + notch, top + notch);
  ctx.closePath();
  ctx.stroke();

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

  // QR. 흰 여백(quiet zone)을 함께 깔아야 스캔이 안정적이다.
  let cursorY = CARD_H * 0.3;
  if (input.qrSvg) {
    const qrImage = await svgToImage(input.qrSvg);
    const qrSize = CARD_W * 0.44;
    const pad = qrSize * 0.08;
    const qrX = centerX - qrSize / 2;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(qrX - pad, cursorY - pad, qrSize + pad * 2, qrSize + pad * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(qrX - pad, cursorY - pad, qrSize + pad * 2, qrSize + pad * 2);
    ctx.drawImage(qrImage, qrX, cursorY, qrSize, qrSize);
    cursorY += qrSize + pad * 2 + CARD_H * 0.04;
  }

  ctx.fillStyle = INK;
  ctx.textBaseline = "top";

  // 상품명은 대시보드 자유 입력이라 길이가 정해져 있지 않다. 화면에서는
  // overflow-hidden이 잘라주지만 캔버스에는 그런 게 없어서, 긴 이름이 들어오면
  // 만료 문구가 테두리 밖으로 밀려난다. 프레임 안에 들어갈 때까지 글자를 줄인다.
  const textMaxWidth = right - left - 60;
  const expiryHeight = input.expiryText ? 38 + 24 : 0;
  const availableHeight = bottom - cursorY - expiryHeight - 24;

  let nameFontSize = 52;
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
  nameLines.slice(0, maxLines).forEach((line, i) => {
    ctx.fillText(line, centerX, cursorY + i * nameLineHeight);
  });
  cursorY += Math.min(nameLines.length, maxLines) * nameLineHeight + 24;

  if (input.expiryText) {
    ctx.font = "38px sans-serif";
    ctx.globalAlpha = 0.7;
    ctx.fillText(input.expiryText, centerX, cursorY);
    ctx.globalAlpha = 1;
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("이미지 변환에 실패했습니다."))),
      "image/png"
    );
  });
}
