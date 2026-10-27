// iOS and Android apps: the app build (dist-app) in a native WebView.
// Replace appId with your own reverse-domain id before the first store upload.
import type {CapacitorConfig} from '@capacitor/cli';

const config:CapacitorConfig={
 appId:'app.bide.editor',
 appName:'bide',
 webDir:'dist-app',
 // Pages load from https://localhost on Android and capacitor://localhost on
 // iOS; the licence server allows both origins (APP_ORIGINS).
 server:{androidScheme:'https'},
 ios:{contentInset:'automatic'},
};
export default config;
