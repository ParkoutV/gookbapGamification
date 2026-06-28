"use client";

import { useState, useRef, useEffect } from "react";

interface ReceiptData {
  id: number;
  language: "ja" | "ko";
  date: string;
  store: string;
  unit_name: string[];
  unit_price: number[];
  unit_amount: number[];
  unit_total: number[];
  sub_total: number;
  tax: number;
  total: number;
}

export default function Home() {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [receiptList, setReceiptList] = useState<ReceiptData[][]>([]);
  const [displayLanguage, setDisplayLanguage] = useState<"ja" | "ko">("ko");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load from local storage on mount
  useEffect(() => {
    const savedData = localStorage.getItem("receiptList");
    if (savedData) {
      try {
        setReceiptList(JSON.parse(savedData));
      } catch (e) {
        console.error("Failed to parse saved receipt data");
      }
    }
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const parseReceiptWithOllama = async (webpDataUrl: string) => {
    setIsParsing(true);
    setError(null);
    try {
      const res = await fetch("/api/parse-receipt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageBase64: webpDataUrl }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to parse receipt");
      }

      const parsedData: ReceiptData[] = await res.json();
      
      setReceiptList((prev) => {
        const newList = [parsedData, ...prev];
        localStorage.setItem("receiptList", JSON.stringify(newList));
        return newList;
      });
      
      // Auto expand the new item
      if (parsedData.length > 0) {
        setExpandedId(parsedData[0].id);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while parsing the receipt.");
    } finally {
      setIsParsing(false);
    }
  };

  const processFile = (file: File) => {
    setError(null);
    
    if (!file.type.startsWith("image/")) {
      setError("Please upload a valid image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 1200;
        
        if (width > height && width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, width, height);

        const webpDataUrl = canvas.toDataURL("image/webp", 0.85);
        parseReceiptWithOllama(webpDataUrl);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const clearData = () => {
    localStorage.removeItem("receiptList");
    setReceiptList([]);
    setExpandedId(null);
  };

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center p-6 font-sans text-neutral-100">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 items-start mt-10">
        
        {/* Left Side: Upload Area */}
        <div className="md:col-span-4 flex flex-col gap-6 sticky top-10">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Receipt Manager
            </h1>
            <p className="text-neutral-400 mb-6 text-sm">
              Upload your receipt. It will be parsed and translated into both Japanese and Korean automatically.
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isParsing && fileInputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-3xl cursor-pointer
              transition-all duration-300 ease-in-out group overflow-hidden
              ${isDragging ? "border-indigo-500 bg-indigo-500/10 scale-[1.02]" : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-900"}
              ${isParsing ? "opacity-50 cursor-not-allowed" : ""}
            `}
          >
            <div className="z-10 flex flex-col items-center gap-4">
              {isParsing ? (
                <div className="relative">
                  <div className="w-10 h-10 border-4 border-neutral-800 rounded-full"></div>
                  <div className="w-10 h-10 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin absolute top-0 left-0"></div>
                </div>
              ) : (
                <div className={`p-4 rounded-full bg-neutral-800 text-neutral-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-colors duration-300`}>
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
              )}
              <div className="text-center">
                <p className="text-lg font-medium text-neutral-200">
                  {isParsing ? "Parsing Receipt..." : "Upload Receipt"}
                </p>
                <p className="text-sm text-neutral-500 mt-1">
                  JPG, PNG (Auto-converted to WebP)
                </p>
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>

          {receiptList.length > 0 && (
            <button 
              onClick={clearData}
              className="mt-4 px-4 py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-colors text-sm font-medium w-full"
            >
              Clear All Receipts
            </button>
          )}
        </div>

        {/* Right Side: Receipt List Area */}
        <div className="md:col-span-8 flex flex-col h-full">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-neutral-200">Receipt History</h2>
            
            {/* Language Toggle */}
            <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
              <button
                onClick={() => setDisplayLanguage("ja")}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${displayLanguage === "ja" ? "bg-indigo-500 text-white shadow-sm" : "text-neutral-400 hover:text-neutral-200"}`}
              >
                日本語 (JA)
              </button>
              <button
                onClick={() => setDisplayLanguage("ko")}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${displayLanguage === "ko" ? "bg-indigo-500 text-white shadow-sm" : "text-neutral-400 hover:text-neutral-200"}`}
              >
                한국어 (KO)
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {receiptList.length === 0 && !isParsing && (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-20 border border-neutral-800 border-dashed rounded-3xl bg-neutral-900/30 opacity-50">
                <svg className="w-16 h-16 text-neutral-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-neutral-500">No receipts yet. Upload one to get started.</p>
              </div>
            )}

            {receiptList.map((receiptPair, index) => {
              // Find the object for the currently selected language
              const data = receiptPair.find(r => r.language === displayLanguage) || receiptPair[0];
              if (!data) return null;
              
              const isExpanded = expandedId === data.id;

              return (
                <div key={data.id || index} className="bg-neutral-900/60 rounded-2xl border border-neutral-800 overflow-hidden transition-all duration-300">
                  {/* List Item Header (Clickable to expand) */}
                  <div 
                    className="p-5 cursor-pointer hover:bg-neutral-800/50 flex justify-between items-center"
                    onClick={() => toggleExpand(data.id)}
                  >
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-100">{data.store || "Unknown Store"}</h3>
                      <p className="text-sm text-neutral-500">{data.date || "Unknown Date"}</p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs text-neutral-500 mb-1">Total</p>
                        <p className="text-xl font-bold text-emerald-400">
                          {data.total ? data.total.toLocaleString() : 0}
                        </p>
                      </div>
                      <div className={`text-neutral-500 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details View */}
                  {isExpanded && (
                    <div className="p-5 border-t border-neutral-800 bg-neutral-900/80">
                      <div className="mb-4">
                        <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Items</h4>
                        <div className="flex flex-col gap-2">
                          {(data.unit_name || []).map((name, i) => (
                            <div key={i} className="flex justify-between items-center text-sm py-2 border-b border-neutral-800/50 last:border-0">
                              <div className="flex-1 text-neutral-300">{name}</div>
                              <div className="w-20 text-center text-neutral-500">
                                {data.unit_price?.[i]?.toLocaleString()} x {data.unit_amount?.[i]}
                              </div>
                              <div className="w-24 text-right font-medium text-neutral-200">
                                {data.unit_total?.[i]?.toLocaleString()}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2 pt-4 border-t border-neutral-800">
                        <div className="flex justify-between text-sm text-neutral-400">
                          <span>Subtotal (세금 불포함 합계)</span>
                          <span>{data.sub_total?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm text-neutral-400">
                          <span>Tax (세금)</span>
                          <span>{data.tax?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-lg font-bold text-neutral-100 pt-2 border-t border-neutral-800">
                          <span>Total (전체 합계)</span>
                          <span className="text-emerald-400">{data.total?.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
