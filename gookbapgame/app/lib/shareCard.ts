/**
 * 카드 이미지를 저장한다. 모바일은 공유 시트("이미지 저장"/"앨범에 저장")를 띄우고,
 * 그게 안 되는 환경에서는 파일 다운로드로 떨어진다.
 *
 * navigator.share는 **사용자 제스처 안에서 호출해야** 한다. 이미지를 먼저 굽고
 * 나중에 share를 부르면 브라우저가 제스처와의 연결이 끊겼다고 보고 거부할 수 있어서,
 * 호출부는 클릭 핸들러에서 이 함수를 그대로 await 하는 형태를 유지할 것.
 */

export type ShareResult = "shared" | "downloaded" | "cancelled" | "failed";

export async function saveOrShareImage(blob: Blob, filename: string): Promise<ShareResult> {
  const file = new File([blob], filename, { type: blob.type });

  // canShare({files})까지 확인해야 한다. share는 있는데 파일 공유는 못 하는
  // 브라우저(구형 데스크톱 Safari 등)가 있고, 거기서 부르면 그냥 던진다.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (error) {
      // 사용자가 시트를 닫은 것뿐이면 실패가 아니다. 다운로드로 되받아치면
      // 취소했는데 파일이 받아지는 이상한 동작이 된다.
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // NotAllowedError는 "사용자 제스처가 이미 소모됐다"는 뜻이다(iOS Safari).
      // 호출부가 이미지를 미리 구워 두면 나지 않아야 하는 오류이므로, 다운로드로
      // 떨어지되 원인을 남긴다 — 조용히 폴백하면 공유 시트가 왜 안 뜨는지 알 수 없다.
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        console.error(
          "[saveOrShareImage] 공유가 사용자 제스처와 분리되어 거부됨. 이미지를 미리 준비했는지 확인할 것:",
          error
        );
      } else {
        console.error("[saveOrShareImage] 공유 실패, 다운로드로 대체:", error);
      }
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return "downloaded";
  } catch (error) {
    console.error("[saveOrShareImage] 다운로드 실패:", error);
    return "failed";
  }
}
