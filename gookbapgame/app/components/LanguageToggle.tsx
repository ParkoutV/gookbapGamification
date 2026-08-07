// app/components/LanguageToggle.tsx
"use client";

import { useState } from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "../lib/i18n/types";

export default function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (next: Locale) => {
    setLocale(next);
    setIsOpen(false);
  };

  return (
    /* 위치는 부모(page.tsx의 고정 툴바)가 정한다. 드롭다운 기준점으로 relative만 유지. */
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Language"
        className="w-9 h-9 flex items-center justify-center rounded-full border border-wood bg-surface/90 text-lg"
      >
        🌐
      </button>
      {/* 드롭다운은 absolute로 띄운다 — 흐름에 두면 옆에 놓인 음소거 버튼을 밀어낸다. */}
      {isOpen && (
        <ul className="absolute left-0 top-full mt-1 min-w-[8rem] rounded-lg border border-wood bg-surface/95 shadow-lg overflow-hidden">
          {SUPPORTED_LOCALES.map((code) => (
            <li key={code}>
              <button
                type="button"
                onClick={() => handleSelect(code)}
                className={`w-full text-left px-3 py-2 text-sm ${
                  code === locale ? "font-bold text-accent" : "text-ink"
                }`}
              >
                {LOCALE_LABELS[code]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
