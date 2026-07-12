# Code.gs Refactor Patch

這份文件先保留為後端整理建議，不含任何 OneSignal / GitHub token。確認後可把下列區塊同步到 Apps Script 的 `Code.gs`。

## 1. Replace `handleRequest`

目的：把 action dispatch 從一長串 `if/else` 改成表格；讀取 API 不再被全域 lock 卡住，只有寫入類 action 會 lock。

```js
var WRITE_ACTIONS = {
  register: true,
  saveGameData: true,
  broadcast: true,
  updateMarquee: true,
  saveCRM: true,
  deleteCRM: true,
  manageShare: true,
  batchCrawl: true,
  saveCalendarEvent: true,
  addCRMNote: true,
  deleteCRMNote: true
};

var ACTION_HANDLERS = {
  getConfig: function(params) { return getConfig(); },
  register: function(params) { return registerUser(params.u, params.p, params.maj, params.min); },
  login: function(params) { return loginUser(params.u, params.p); },
  saveGameData: function(params) { return saveGameDataV2(params.u, params.p, params.data, params.log); },
  getOrchardData: function(params) { return getOrchardDataV2(params.u, params.p); },
  getOrchardSeasonStatus: function(params) { return getOrchardSeasonStatus(); },
  getOrchardSeason31Preview: function(params) { return getOrchardSeason31Preview(); },
  getGlobalLogs: function(params) { return { list: getGlobalLogs() }; },
  getPersonalLogs: function(params) { return { list: getPersonalLogs(params.u) }; },
  getCalendarData: function(params) { return getCalendarData(params.u, params.year, params.month); },
  getAdminReport: function(params) { return getAdminReport(params.filters, params.mode, params.dateVal); },
  getHallDetails: function(params) { return getHallDetailsV2(params.hall, params.u, params.p); },
  getLatestLog: function(params) { return getLatestLog(); },
  broadcast: function(params) { return sendBroadcast(params.msg, params.time); },
  updateMarquee: function(params) { return updateMarquee(params.msg); },
  getCRM: function(params) { return getCRMV2(params.u, params.p, params.target); },
  saveCRM: function(params) { return saveCRMV2(params.u, params.p, params.item); },
  deleteCRM: function(params) { return deleteCRMV2(params.u, params.p, params.recordId); },
  addCRMNote: function(params) { return addCRMNoteV2(params.u, params.p, params.recordId, params.note); },
  deleteCRMNote: function(params) { return deleteCRMNoteV2(params.u, params.p, params.noteId); },
  getYearlyEvents: function(params) { return getYearlyEventsV2(params.u, params.p); },
  saveCalendarEvent: function(params) { return saveCalendarEventV2(params.u, params.p, params.item); },
  getShareData: function(params) { return getShareData(params.isAdmin); },
  manageShare: function(params) { return manageShare(params.subAction, params.data); },
  getClassicsMenu: function(params) { return getClassicsMenu(); },
  getClassicContent: function(params) { return getClassicContent(params.targetSheet); },
  getClassicContentV2: function(params) { return getClassicContentV2(params.targetSheet); },
  searchClassics: function(params) { return searchClassicsV2(params.q, params.limit); },
  batchCrawl: function(params) { return batchProcessClassics(); }
};

function handleRequest(e) {
  try {
    var params = parseRequestParams(e);
    if (!params || !params.action) return jsonResponse({ error: "Data Lost" });

    ensureOrchardSeasonRollover();
    var handler = ACTION_HANDLERS[params.action];
    if (!handler) return jsonResponse({ error: "Unknown action: " + params.action });

    var runner = function() { return handler(params); };
    var result = WRITE_ACTIONS[params.action] ? runWithScriptLock(runner) : runner();
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: "Backend Error: " + err.toString() });
  }
}

function parseRequestParams(e) {
  try {
    if (e.parameter && e.parameter.req) return JSON.parse(e.parameter.req);
    if (e.postData && e.postData.contents) return JSON.parse(e.postData.contents);
    if (e.parameter && e.parameter.action) return e.parameter;
  } catch (err) {}
  return null;
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function runWithScriptLock(callback) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) return { error: "System Busy" };
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}
```

## 2. Add HTML escaping for classics content

目的：避免 Google Sheet 內容被當成 HTML 執行。

```js
function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function(ch) {
    return ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[ch];
  });
}

function getClassicContent(sheetName) {
  if (!sheetName) return { error: "未指定分頁名稱" };
  var sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return { error: "找不到分頁：" + sheetName };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, content: "<p>尚無內容，請先至後台執行爬蟲</p>" };
  var values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  var htmlContent = values
    .map(function(row) { return row[0]; })
    .filter(function(line) { return !!line; })
    .map(function(line) { return "<p>" + escapeHtml(line) + "</p>"; })
    .join("");
  return { success: true, content: htmlContent };
}
```

## 3. Make GitHub image upload update-safe

目的：同名分享圖片已存在時，GitHub Contents API 需要帶 `sha`，否則會上傳失敗。

```js
function uploadToGitHub(path, base64Content) {
  var url = "https://api.github.com/repos/" + GITHUB_REPO + "/contents/" + path;
  var existingSha = getGitHubFileSha(path);
  var payload = {
    message: existingSha ? "Update share img" : "Upload share img",
    content: base64Content,
    branch: GITHUB_BRANCH
  };
  if (existingSha) payload.sha = existingSha;

  var options = {
    method: "put",
    headers: {
      Authorization: "Bearer " + GITHUB_TOKEN,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) return { success: true };
    return { success: false, error: response.getContentText() };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getGitHubFileSha(path) {
  var url = "https://api.github.com/repos/" + GITHUB_REPO + "/contents/" + path + "?ref=" + GITHUB_BRANCH;
  var options = {
    method: "get",
    headers: { Authorization: "Bearer " + GITHUB_TOKEN },
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) return null;
  return JSON.parse(response.getContentText()).sha;
}

function deleteFileFromGitHub(path) {
  try {
    var sha = getGitHubFileSha(path);
    if (!sha) return { success: false, error: "file not found" };

    var url = "https://api.github.com/repos/" + GITHUB_REPO + "/contents/" + path;
    var payload = {
      message: "Delete share img",
      sha: sha,
      branch: GITHUB_BRANCH
    };
    var options = {
      method: "delete",
      headers: {
        Authorization: "Bearer " + GITHUB_TOKEN,
        "Content-Type": "application/json"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    return code >= 200 && code < 300
      ? { success: true }
      : { success: false, error: response.getContentText() };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}
```
