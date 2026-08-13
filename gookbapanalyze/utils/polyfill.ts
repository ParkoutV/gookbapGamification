// Polyfill for process.env in Web Workers (for Next.js Turbopack compatibility)
if (typeof process === 'undefined') {
    (globalThis as any).process = { env: {} };
} else if (!process.env) {
    (globalThis as any).process.env = {};
}

export {};
