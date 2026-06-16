// Minimal MV3 service worker. Its only job in this test extension is to exist,
// so ZipSnap can find the extension's ID by reading this worker's address.
chrome.runtime.onInstalled.addListener(() => {
  console.log("FocusDash installed.");
});
