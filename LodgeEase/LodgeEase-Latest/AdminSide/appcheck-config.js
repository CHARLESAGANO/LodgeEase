// Import Firebase App Check
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";
import { getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

// Initialize App Check
export function initializeAppCheckForAdmin() {
  const app = getApp();
  
  // Pass your reCAPTCHA v3 site key (public key) to activate
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('YOUR_RECAPTCHA_SITE_KEY'), // Replace with your key
    isTokenAutoRefreshEnabled: true
  });
  
  return appCheck;
} 