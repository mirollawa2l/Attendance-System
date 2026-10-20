// ============================================================================
//  The ONLY place you need to edit to point the website at its backend.
//  Paste your Google Apps Script web-app URL (ends in /exec) between the quotes.
//  This URL is public by design (anyone viewing the site can see it); the data
//  is protected by the ACCESS_CODE you set in Apps Script, not by hiding this URL.
//  Never put passwords, tokens or Google keys in this file.
// ============================================================================
window.SCOUTS_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbwCT_Lb9-dhu9Q4oWQ50LLTAqZx-cxdSulthTHFZO8wM5jOaTKsDdQdQ7yvRSXz1Uw/exec",
  REQUEST_TIMEOUT_MS: 45000   // Apps Script can take a few seconds on a cold start
};
