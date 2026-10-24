/// <reference types="vite/client" />
export const PUBLIC_DEMO = import.meta.env.MODE === 'demo';
export const SAAS_BUILD = import.meta.env.MODE === 'saas';
// Both hosted editions omit the Office engine, whose files exceed the host limit.
export const HOSTED_BUILD = PUBLIC_DEMO || SAAS_BUILD;
export const DOWNLOAD_URL = 'https://github.com/AOSPAndroid/Bide/releases/download/v0.8.14/bide-browser.zip';
