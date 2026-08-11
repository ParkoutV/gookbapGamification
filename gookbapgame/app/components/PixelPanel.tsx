interface PixelPanelProps {
  size: "card" | "btn";
  /** 주면 90s 데스크톱 창처럼 타이틀바가 붙는다. 없으면 예전처럼 민 패널이다. */
  title?: string;
  /**
   * 주면 타이틀바 오른쪽에 닫기(✕) 버튼이 생긴다. 없으면 그 자리는 비운다.
   *
   * **최소화·최대화 버튼은 두지 않는다.** 이 게임에 대응하는 동작이 없어서
   * 넣으면 누를 수 있다는 거짓 신호가 될 뿐이다 — 창처럼 보이게 하는 몫은
   * 타이틀바 색 한 줄이 이미 하고 있다(2026-08-11, 이란토).
   *
   * 화면 안쪽에 닫기 버튼을 따로 두지 말 것. 창 컨셉에서 닫기는 타이틀바의
   * 몫이고, 본문 좌상단에 두면 타이틀바와 겹친다.
   */
  onClose?: () => void;
  closeAriaLabel?: string;
  className?: string;
  children: React.ReactNode;
}

export default function PixelPanel({
  size,
  title,
  onClose,
  closeAriaLabel,
  className,
  children,
}: PixelPanelProps) {
  return (
    <div className={`pixel-frame pixel-frame--${size} ${className ?? ""}`}>
      <div
        className={`pixel-frame-inner ${
          title ? "pixel-frame-inner--titled" : `pixel-frame-inner--${size}`
        }`}
      >
        {title && (
          <div className="win-titlebar">
            <span>{title}</span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label={closeAriaLabel}
                className="win-titlebar__box"
              >
                ✕
              </button>
            )}
          </div>
        )}
        {title ? <div className="pixel-panel-body">{children}</div> : children}
      </div>
    </div>
  );
}
