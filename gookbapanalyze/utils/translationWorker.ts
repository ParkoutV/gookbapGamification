let pipelineRef: any = null;
let envRef: any = null;

async function initTransformers() {
    if (!pipelineRef) {
        // Turbopack의 번들링 및 process.env 버그를 완벽하게 우회하기 위해,
        // 웹팩/Turbopack 파싱을 무시(webpackIgnore)하고 브라우저가 직접 CDN에서 모듈을 가져오도록 합니다.
        const CDN_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
        const transformers = await import(/* webpackIgnore: true */ CDN_URL);
        pipelineRef = transformers.pipeline;
        envRef = transformers.env;

        // 브라우저 환경에서 로컬 파일 시스템 접근을 비활성화하고 허브 모델을 직접 다운로드하도록 강제합니다.
        envRef.allowLocalModels = false;
        envRef.useBrowserCache = true;
    }
}

class TranslationPipeline {
    static task = 'translation' as const;
    static model = 'Xenova/nllb-200-distilled-600M';
    static instance: any = null;

    static async getInstance(progress_callback: Function) {
        await initTransformers();
        if (this.instance === null) {
            this.instance = await pipelineRef(this.task, this.model, { 
                progress_callback,
                quantized: true, // 양자화된 모델 사용 (용량 최적화)
            });
        }
        return this.instance;
    }
}

// 일반적인 언어 코드를 NLLB-200 지원 코드 맵핑으로 변환합니다.
// 지원 언어가 더 추가될 경우 여기에 코드를 매핑합니다.
const getLanguageCode = (lang: string) => {
    const map: Record<string, string> = {
        'ko': 'kor_Hang',
        'en': 'eng_Latn',
        'ja': 'jpn_Jpan',
        'zh-CN': 'zho_Hans',
        'zh-TW': 'zho_Hant',
        'zh': 'zho_Hans',
        'es': 'spa_Latn',
        'fr': 'fra_Latn',
        'vi': 'vie_Latn',
        'th': 'tha_Thai',
        'ru': 'rus_Cyrl'
    };
    return map[lang] || 'eng_Latn';
}

self.addEventListener('message', async (event) => {
    const { text, targetLang, id } = event.data;
    
    // 워커 헬스 체크나 초기화 확인용
    if (event.data.type === 'init') {
        self.postMessage({ status: 'ready' });
        return;
    }

    console.log(`[Worker] Received translation request for ID: ${id}, target: ${targetLang}, text: "${text}"`);

    try {
        console.log(`[Worker] Getting translator instance...`);
        const translator = await TranslationPipeline.getInstance((x: any) => {
            self.postMessage({
                status: 'progress',
                data: x
            });
        });
        console.log(`[Worker] Translator instance ready.`);

        const srcCode = 'kor_Hang'; // 한국어 원본 기준
        const tgtCode = getLanguageCode(targetLang);

        console.log(`[Worker] Starting translation from ${srcCode} to ${tgtCode}...`);
        const result = await translator(text, {
            src_lang: srcCode,
            tgt_lang: tgtCode
        });
        console.log(`[Worker] Translation successful:`, result);

        self.postMessage({
            status: 'complete',
            id,
            result: result[0].translation_text
        });
    } catch (error) {
        self.postMessage({
            status: 'error',
            id,
            error: error instanceof Error ? error.message : String(error)
        });
    }
});
