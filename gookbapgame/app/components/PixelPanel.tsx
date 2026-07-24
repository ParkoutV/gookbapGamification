interface PixelPanelProps {
  size: "card" | "btn";
  className?: string;
  children: React.ReactNode;
}

export default function PixelPanel({ size, className, children }: PixelPanelProps) {
  return (
    <div className={`pixel-frame pixel-frame--${size} ${className ?? ""}`}>
      <div className={`pixel-frame-inner pixel-frame-inner--${size}`}>
        {children}
      </div>
    </div>
  );
}
