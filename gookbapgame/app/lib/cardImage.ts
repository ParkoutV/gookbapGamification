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
 * 텍스트를 maxWidth 안에서 줄바꿈해 그린다. 반환값은 그린 줄 수.
 * 한국어는 어절 단위로 끊는다(화면의 break-keep과 같은 규칙).
 */
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number
): number {
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

  lines.forEach((l, i) => ctx.fillText(l, centerX, startY + i * lineHeight));
  return lines.length;
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
  ctx.fillStyle = INK;
  ctx.font = "64px sans-serif";
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
  ctx.font = "bold 52px sans-serif";
  const lineCount = drawWrappedText(
    ctx,
    input.couponName,
    centerX,
    cursorY,
    right - left - 60,
    64
  );
  cursorY += lineCount * 64 + 24;

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
