// Performance, permissions, cross-hall CRM, and public sharing upgrade.

var USER_ROLE_COLUMN_V3 = 7;
var MEMBER_ROLE_SENIOR_V3 = "學長姐";
var CALENDAR_COLUMNS_V3 = 9;
var CALENDAR_CACHE_PREFIX_V3 = "events-v3-";
var USER_DIRECTORY_CACHE_V3 = "user-directory-v3";

function findUserRowV3(username, password) {
  var name = String(username || "").trim();
  if (!name) return null;
  var sheet = getSpreadsheet().getSheetByName("Users");
  if (!sheet || sheet.getLastRow() < 2) return null;
  var match = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(name).matchEntireCell(true).findNext();
  if (!match) return null;
  var row = match.getRow();
  var values = sheet.getRange(row, 1, 1, Math.max(USER_ROLE_COLUMN_V3, sheet.getLastColumn())).getValues()[0];
  if (password !== undefined && String(values[1] || "") !== String(password || "")) return null;
  return { sheet: sheet, row: row, values: values };
}

function normalizeMemberRoleV3(value) {
  return String(value || "").trim() === MEMBER_ROLE_SENIOR_V3 ? MEMBER_ROLE_SENIOR_V3 : "成員";
}

function viewerFromUserRowV3(record) {
  if (!record) return null;
  var values = record.values;
  var username = String(values[0] || "");
  var major = String(values[2] || "");
  return {
    username: username,
    major: major,
    minor: String(values[3] || ""),
    role: normalizeMemberRoleV3(values[USER_ROLE_COLUMN_V3 - 1]),
    isAdmin: username.toUpperCase() === "ADMIN" || major === "主領班"
  };
}

function findViewerV3(username, password) {
  return viewerFromUserRowV3(findUserRowV3(username, password));
}

function loginUserV3(username, password) {
  var record = findUserRowV3(username, password);
  if (!record) return { success: false, msg: "帳號密碼錯誤" };
  var values = record.values;
  var gameData = parseGameDataV2(values[4]);
  var today = getTaipeiDate();

  if (gameData.last_active_date !== today) {
    gameData.total_spoke = (Number(gameData.total_spoke) || 0) + (Number(gameData.spoke_count) || 0);
    gameData.total_convert = (Number(gameData.total_convert) || 0) + (Number(gameData.convert_count) || 0);
    gameData.total_class = (Number(gameData.total_class) || 0) + (Number(gameData.class_count) || 0);
    gameData.task_read_time = 0;
    gameData.task_sport_done = false;
    gameData.spoke_count = 0;
    gameData.convert_count = 0;
    gameData.class_count = 0;
    gameData.last_active_date = today;
    record.sheet.getRange(record.row, 5).setValue(JSON.stringify(gameData));
  }

  var viewer = viewerFromUserRowV3(record);
  gameData.teamMajor = viewer.major;
  gameData.teamMinor = viewer.minor;
  gameData.teamFull = viewer.major + "｜" + viewer.minor;
  gameData.memberRole = viewer.role;
  return { success: true, msg: "登入成功", gameData: gameData };
}

// Keeps the existing season merge and push behavior while avoiding a full Users scan.
function saveGameDataV3(username, password, incomingData, logAction) {
  var record = findUserRowV3(username, password);
  if (!record) return { success: false, msg: "Fail" };
  var storedData = parseGameDataV2(record.values[4]);
  var newData = mergeSeasonGameDataV2(storedData, incomingData, logAction, getActiveOrchardSeasonV2());
  newData.last_active_date = getTaipeiDate();
  record.sheet.getRange(record.row, 5).setValue(JSON.stringify(newData));
  record.sheet.getRange(record.row, 6).setValue(new Date());
  CacheService.getScriptCache().remove("orchard");
  CacheService.getScriptCache().remove("orchard-data-v3");

  if (logAction) {
    var major = record.values[2] || "賢德團隊";
    var minor = record.values[3] || "未分類";
    logActivity(username, major, minor, logAction.action, logAction.detail);
    var pushTitle = "🌱 賢德新動態";
    var pushContent = username + " " + logAction.action + "：" + logAction.detail;
    sendPush(pushTitle, pushContent, null, null);
    CacheService.getScriptCache().remove("global-logs-v3");
  }
  return { success: true, msg: "OK", gameData: newData };
}

function getOrchardDataV3(username, password) {
  var viewer = findViewerV3(username, password);
  var cache = CacheService.getScriptCache();
  var cached = cache.get("orchard-data-v3");
  var orchard;
  if (cached) {
    orchard = JSON.parse(cached);
  } else {
    var sheet = getSpreadsheet().getSheetByName("Users");
    var users = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
    var activeSeason = getActiveOrchardSeasonV2();
    orchard = {};
    users.forEach(function(row) {
      var minor = String(row[3] || "未分類公堂");
      if (!orchard[minor]) orchard[minor] = { name: minor, spoke: 0, convert: 0, joinClass: 0, members: 0, seasonName: activeSeason.name };
      orchard[minor].members += 1;
      var metrics = seasonMetricsV2(parseGameDataV2(row[4]));
      orchard[minor].spoke += metrics.spoke;
      orchard[minor].convert += metrics.convert;
      orchard[minor].joinClass += metrics.joinClass;
    });
    var json = JSON.stringify(orchard);
    if (json.length < 95000) cache.put("orchard-data-v3", json, 60);
  }
  var result = {};
  Object.keys(orchard).forEach(function(hall) {
    result[hall] = {};
    Object.keys(orchard[hall]).forEach(function(key) { result[hall][key] = orchard[hall][key]; });
    result[hall].canViewDetails = !!viewer && (viewer.isAdmin || viewer.minor === hall);
  });
  return result;
}

function readUserDirectoryV3() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(USER_DIRECTORY_CACHE_V3);
  if (cached) return JSON.parse(cached);
  var sheet = getSpreadsheet().getSheetByName("Users");
  var rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  var directory = rows.map(function(row) {
    return {
      name: String(row[0] || "").trim(),
      major: String(row[2] || ""),
      minor: String(row[3] || ""),
      role: normalizeMemberRoleV3(row[6])
    };
  }).filter(function(user) { return !!user.name; });
  var json = JSON.stringify(directory);
  if (json.length < 95000) cache.put(USER_DIRECTORY_CACHE_V3, json, 300);
  return directory;
}

function searchCRMShareMembersV3(username, password, query) {
  var viewer = findViewerV3(username, password);
  if (!viewer) return { success: false, error: "登入資料已失效", list: [] };
  var needle = String(query || "").trim().toLowerCase();
  if (!needle) return { success: true, list: [] };
  var list = readUserDirectoryV3().filter(function(user) {
    if (user.name === viewer.username) return false;
    return (user.name + " " + user.major + " " + user.minor).toLowerCase().indexOf(needle) !== -1;
  }).slice(0, 30);
  return { success: true, list: list };
}

function sanitizeCRMSharedUsersV3(value, viewer) {
  var allowed = {};
  readUserDirectoryV3().forEach(function(user) { allowed[user.name] = true; });
  return normalizeSharedUsersV2(value).filter(function(name) {
    return name !== viewer.username && !!allowed[name];
  }).slice(0, 100);
}

function getYearlyEventsV3(username, password) {
  var viewer = findViewerV3(username, password);
  if (!viewer) return { success: false, error: "登入資料已失效", list: [], cats: EVENT_CATEGORIES_V2.slice() };
  var cacheKey = CALENDAR_CACHE_PREFIX_V3 + (viewer.isAdmin ? "admin" : viewer.minor || "none");
  var cached = CacheService.getScriptCache().get(cacheKey);
  if (cached) {
    var cachedResult = JSON.parse(cached);
    cachedResult.canAdd = viewer.isAdmin || viewer.role === MEMBER_ROLE_SENIOR_V3;
    cachedResult.canManage = viewer.isAdmin;
    cachedResult.viewerRole = viewer.role;
    return cachedResult;
  }

  var sheet = getSpreadsheet().getSheetByName("Calendar");
  if (!sheet) return { success: false, error: "找不到 Calendar 工作表", list: [], cats: EVENT_CATEGORIES_V2.slice() };
  var data = sheet.getDataRange().getValues();
  var list = [];
  var categories = {};
  EVENT_CATEGORIES_V2.forEach(function(category) { categories[category] = true; });

  for (var i = 1; i < data.length; i++) {
    var title = data[i][0];
    var startRaw = data[i][1];
    if (!title || !startRaw) continue;
    var hall = String(data[i][7] || "");
    var scope = String(data[i][8] || "global");
    if (!viewer.isAdmin && scope === "hall" && hall !== viewer.minor) continue;
    var startDate = new Date(startRaw);
    if (isNaN(startDate.getTime())) continue;
    var endDate = data[i][2] ? new Date(data[i][2]) : startDate;
    if (isNaN(endDate.getTime())) endDate = startDate;
    var category = String(data[i][3] || "未分類");
    categories[category] = true;
    list.push({
      id: i + 1,
      name: String(title),
      date: Utilities.formatDate(startDate, "GMT+8", "yyyy-MM-dd"),
      end: Utilities.formatDate(endDate, "GMT+8", "yyyy-MM-dd"),
      cat: category,
      loc: String(data[i][4] || ""),
      note: String(data[i][5] || ""),
      creator: String(data[i][6] || ""),
      hall: hall,
      scope: scope,
      canEdit: viewer.isAdmin,
      canDelete: viewer.isAdmin
    });
  }
  list.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
  var result = {
    success: true,
    list: list,
    cats: Object.keys(categories),
    canAdd: viewer.isAdmin || viewer.role === MEMBER_ROLE_SENIOR_V3,
    canManage: viewer.isAdmin,
    viewerRole: viewer.role
  };
  var json = JSON.stringify(result);
  if (json.length < 95000) CacheService.getScriptCache().put(cacheKey, json, 60);
  return result;
}

function saveCalendarEventV3(username, password, item) {
  var viewer = findViewerV3(username, password);
  if (!viewer || (!viewer.isAdmin && viewer.role !== MEMBER_ROLE_SENIOR_V3)) {
    return { success: false, error: "權限不足" };
  }
  item = item || {};
  var row = parseInt(item.id, 10);
  if (row >= 2 && !viewer.isAdmin) return { success: false, error: "學長姐僅能新增活動" };
  var title = String(item.name || "").trim();
  var startDate = parseCalendarDateV2(item.date);
  var endDate = parseCalendarDateV2(item.end || item.date);
  if (!title || !startDate || !endDate) return { success: false, error: "請完整填寫活動名稱與日期" };
  if (endDate.getTime() < startDate.getTime()) return { success: false, error: "結束日期不可早於開始日期" };

  var sheet = getSpreadsheet().getSheetByName("Calendar");
  if (!sheet) return { success: false, error: "找不到 Calendar 工作表" };
  if (sheet.getMaxColumns() < CALENDAR_COLUMNS_V3) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), CALENDAR_COLUMNS_V3 - sheet.getMaxColumns());
  }
  sheet.getRange(1, 7, 1, 3).setValues([["建立者", "限定公堂", "顯示範圍"]]);
  var isSenior = !viewer.isAdmin;
  var requestedScope = String(item.scope || "global");
  var requestedHall = String(item.hall || "").trim();
  if (!isSenior && requestedScope === "hall" && !requestedHall) {
    return { success: false, error: "限定公堂活動請填寫公堂名稱" };
  }
  var category = isSenior ? viewer.minor + "專屬" : String(item.cat || "未分類").trim();
  var values = [[
    title, startDate, endDate, category, String(item.loc || "").trim(), String(item.note || "").trim(),
    isSenior ? viewer.username : String(item.creator || viewer.username),
    isSenior ? viewer.minor : requestedHall,
    isSenior ? "hall" : requestedScope
  ]];
  if (row >= 2 && row <= sheet.getLastRow()) sheet.getRange(row, 1, 1, CALENDAR_COLUMNS_V3).setValues(values);
  else {
    sheet.appendRow(values[0]);
    row = sheet.getLastRow();
  }
  clearCalendarCacheV3();
  return { success: true, id: row, msg: "活動已儲存" };
}

function deleteCalendarEventV3(username, password, eventId) {
  var viewer = findViewerV3(username, password);
  if (!viewer || !viewer.isAdmin) return { success: false, error: "只有主領班及 ADMIN 可以刪除活動" };
  var sheet = getSpreadsheet().getSheetByName("Calendar");
  var row = parseInt(eventId, 10);
  if (!sheet || row < 2 || row > sheet.getLastRow()) return { success: false, error: "找不到活動" };
  sheet.deleteRow(row);
  clearCalendarCacheV3();
  return { success: true, msg: "活動已刪除" };
}

function clearCalendarCacheV3() {
  var cache = CacheService.getScriptCache();
  cache.removeAll([CALENDAR_CACHE_PREFIX_V3 + "admin"]);
  readUserDirectoryV3().forEach(function(user) { cache.remove(CALENDAR_CACHE_PREFIX_V3 + (user.minor || "none")); });
}

function searchUsersForRoleV3(username, password, query) {
  var viewer = findViewerV3(username, password);
  if (!viewer || !viewer.isAdmin) return { success: false, error: "權限不足", list: [] };
  var needle = String(query || "").trim().toLowerCase();
  var list = readUserDirectoryV3().filter(function(user) {
    return !needle || (user.name + " " + user.major + " " + user.minor).toLowerCase().indexOf(needle) !== -1;
  }).slice(0, 50);
  return { success: true, list: list };
}

function setUserRoleV3(username, password, target, role) {
  var viewer = findViewerV3(username, password);
  if (!viewer || !viewer.isAdmin) return { success: false, error: "權限不足" };
  var record = findUserRowV3(target);
  if (!record) return { success: false, error: "找不到成員" };
  if (record.sheet.getMaxColumns() < USER_ROLE_COLUMN_V3) {
    record.sheet.insertColumnsAfter(record.sheet.getMaxColumns(), USER_ROLE_COLUMN_V3 - record.sheet.getMaxColumns());
  }
  record.sheet.getRange(1, USER_ROLE_COLUMN_V3).setValue("身分別");
  record.sheet.getRange(record.row, USER_ROLE_COLUMN_V3).setValue(normalizeMemberRoleV3(role));
  CacheService.getScriptCache().remove(USER_DIRECTORY_CACHE_V3);
  clearCalendarCacheV3();
  return { success: true, msg: "身分已更新" };
}

function addPublicShareV3(username, password, data) {
  var viewer = findViewerV3(username, password);
  if (!viewer) return { success: false, msg: "登入資料已失效" };
  data = data || {};
  if (!String(data.title || "").trim() || !String(data.text || "").trim()) {
    return { success: false, msg: "請填寫標題與分享內容" };
  }
  if (data.images && data.images.length > 4) return { success: false, msg: "一次最多上傳 4 張圖片" };
  var result = manageShare("add", data);
  if (result && result.success) {
    var sheet = getSpreadsheet().getSheetByName("Share");
    if (sheet.getMaxColumns() < 5) sheet.insertColumnAfter(4);
    sheet.getRange(1, 5).setValue("建立者");
    sheet.getRange(2, 5).setValue(viewer.username);
  }
  return result;
}

function getGlobalLogsV3() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("global-logs-v3");
  if (cached) return { list: JSON.parse(cached) };
  var list = getGlobalLogs();
  cache.put("global-logs-v3", JSON.stringify(list), 20);
  return { list: list };
}
