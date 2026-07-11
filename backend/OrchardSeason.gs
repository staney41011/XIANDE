// Orchard season settlement and hall-detail authorization.

var ORCHARD_SEASON_31 = {
  closingName: "賢德班第31期",
  closingEndDate: "2026-07-11",
  newName: "賢德班第32期",
  newStartDate: "2026-07-12",
  statusKey: "ORCHARD_SEASON_31_STATUS",
  summaryKey: "ORCHARD_SEASON_31_SUMMARY",
  scheduledAtKey: "ORCHARD_SEASON_31_SCHEDULED_AT"
};

function getActiveOrchardSeasonV2() {
  return getTaipeiDate() >= ORCHARD_SEASON_31.newStartDate
    ? { name: ORCHARD_SEASON_31.newName, startDate: ORCHARD_SEASON_31.newStartDate }
    : { name: ORCHARD_SEASON_31.closingName, startDate: "" };
}

function getOrchardSeasonStatus() {
  var properties = PropertiesService.getScriptProperties();
  var active = getActiveOrchardSeasonV2();
  return {
    success: true,
    currentName: active.name,
    currentStartDate: active.startDate,
    closingName: ORCHARD_SEASON_31.closingName,
    closingEndDate: ORCHARD_SEASON_31.closingEndDate,
    nextName: ORCHARD_SEASON_31.newName,
    nextStartDate: ORCHARD_SEASON_31.newStartDate,
    settlementStatus: properties.getProperty(ORCHARD_SEASON_31.statusKey) || "pending",
    scheduledAt: properties.getProperty(ORCHARD_SEASON_31.scheduledAtKey) || ""
  };
}

function getOrchardSeason31Preview() {
  var snapshot = buildSeason31SnapshotV2(getSpreadsheet());
  return {
    success: true,
    provisional: getTaipeiDate() <= ORCHARD_SEASON_31.closingEndDate,
    summary: snapshot.summary,
    halls: snapshot.hallRows.map(function(row) {
      return {
        major: row[3],
        minor: row[4],
        members: row[5],
        spoke: row[6],
        convert: row[7],
        joinClass: row[8],
        readDays: row[9],
        sportDays: row[10]
      };
    })
  };
}

function ensureOrchardSeasonRollover() {
  if (getTaipeiDate() < ORCHARD_SEASON_31.newStartDate) return { success: true, pending: true };
  var status = PropertiesService.getScriptProperties().getProperty(ORCHARD_SEASON_31.statusKey);
  if (status === "complete") return { success: true, alreadyComplete: true };
  return finalizeOrchardSeason31UnlockedV2();
}

function scheduleOrchardSeason31Settlement() {
  var properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(ORCHARD_SEASON_31.statusKey) === "complete") {
    return { success: true, alreadyComplete: true };
  }

  deleteSeasonSettlementTriggersV2();
  var scheduledAt = new Date("2026-07-11T16:01:00.000Z");
  if (scheduledAt.getTime() <= new Date().getTime()) return finalizeOrchardSeason31();

  ScriptApp.newTrigger("finalizeOrchardSeason31").timeBased().at(scheduledAt).create();
  var taipeiTime = Utilities.formatDate(scheduledAt, "GMT+8", "yyyy-MM-dd HH:mm:ss");
  properties.setProperty(ORCHARD_SEASON_31.scheduledAtKey, taipeiTime);
  properties.setProperty(ORCHARD_SEASON_31.statusKey, "scheduled");
  return { success: true, scheduledAt: taipeiTime };
}

function finalizeOrchardSeason31() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) return { success: false, error: "System Busy" };
  try {
    return finalizeOrchardSeason31UnlockedV2();
  } finally {
    lock.releaseLock();
  }
}

function finalizeOrchardSeason31UnlockedV2() {
  var properties = PropertiesService.getScriptProperties();
  var status = properties.getProperty(ORCHARD_SEASON_31.statusKey) || "pending";
  if (status === "complete") {
    return {
      success: true,
      alreadyComplete: true,
      summary: readSeasonSummaryPropertyV2(properties)
    };
  }

  var spreadsheet = getSpreadsheet();
  if (status !== "archived") {
    backupSeasonSourceSheetsV2(spreadsheet);
    var snapshot = buildSeason31SnapshotV2(spreadsheet);
    writeSeasonArchiveV2(spreadsheet, snapshot);
    properties.setProperty(ORCHARD_SEASON_31.summaryKey, JSON.stringify(snapshot.summary));
    properties.setProperty(ORCHARD_SEASON_31.statusKey, "archived");
  }

  resetUsersForSeason32V2(spreadsheet);
  properties.setProperty(ORCHARD_SEASON_31.statusKey, "complete");
  properties.setProperty("ORCHARD_ACTIVE_SEASON", ORCHARD_SEASON_31.newName);
  properties.setProperty("ORCHARD_ACTIVE_SEASON_START", ORCHARD_SEASON_31.newStartDate);
  deleteSeasonSettlementTriggersV2();
  CacheService.getScriptCache().remove("orchard");

  return {
    success: true,
    message: ORCHARD_SEASON_31.closingName + "結算完成，已開始" + ORCHARD_SEASON_31.newName,
    summary: readSeasonSummaryPropertyV2(properties)
  };
}

function readSeasonSummaryPropertyV2(properties) {
  try {
    return JSON.parse(properties.getProperty(ORCHARD_SEASON_31.summaryKey) || "{}");
  } catch (error) {
    return {};
  }
}

function deleteSeasonSettlementTriggersV2() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "finalizeOrchardSeason31") ScriptApp.deleteTrigger(trigger);
  });
}

function backupSeasonSourceSheetsV2(spreadsheet) {
  copySeasonBackupSheetV2(spreadsheet, "Users", "Users_第31期備份");
  copySeasonBackupSheetV2(spreadsheet, "Logs", "Logs_第31期備份");
}

function copySeasonBackupSheetV2(spreadsheet, sourceName, backupName) {
  if (spreadsheet.getSheetByName(backupName)) return;
  var source = spreadsheet.getSheetByName(sourceName);
  if (!source) throw new Error("找不到 " + sourceName + " 工作表");
  source.copyTo(spreadsheet).setName(backupName).hideSheet();
}

function seasonMetricsV2(gameData) {
  gameData = gameData || {};
  return {
    spoke: (Number(gameData.total_spoke) || 0) + (Number(gameData.spoke_count) || 0),
    convert: (Number(gameData.total_convert) || 0) + (Number(gameData.convert_count) || 0),
    joinClass: (Number(gameData.total_class) || 0) + (Number(gameData.class_count) || 0)
  };
}

function buildSeason31SnapshotV2(spreadsheet) {
  var usersSheet = spreadsheet.getSheetByName("Users");
  var logsSheet = spreadsheet.getSheetByName("Logs");
  if (!usersSheet || !logsSheet) throw new Error("缺少 Users 或 Logs 工作表");

  var users = usersSheet.getDataRange().getValues();
  var logs = logsSheet.getDataRange().getValues();
  var activity = buildSeasonActivityMapV2(logs, ORCHARD_SEASON_31.closingEndDate);
  var startDate = activity.startDate || ORCHARD_SEASON_31.closingEndDate;
  var settledAt = Utilities.formatDate(new Date(), "GMT+8", "yyyy-MM-dd HH:mm:ss");
  var detailRows = [];
  var hallMap = {};
  var totals = { members: 0, spoke: 0, convert: 0, joinClass: 0, readDays: 0, sportDays: 0 };

  for (var i = 1; i < users.length; i++) {
    var username = String(users[i][0] || "").trim();
    if (!username) continue;
    var major = String(users[i][2] || "未分類");
    var minor = String(users[i][3] || "未分類公堂");
    var gameData = parseGameDataV2(users[i][4]);
    var metrics = seasonMetricsV2(gameData);
    var userActivity = activity.users[username] || { readDays: 0, sportDays: 0 };

    detailRows.push([
      ORCHARD_SEASON_31.closingName,
      startDate,
      ORCHARD_SEASON_31.closingEndDate,
      username,
      major,
      minor,
      metrics.spoke,
      metrics.convert,
      metrics.joinClass,
      userActivity.readDays,
      userActivity.sportDays,
      settledAt
    ]);

    if (!hallMap[minor]) {
      hallMap[minor] = {
        major: major,
        minor: minor,
        members: 0,
        spoke: 0,
        convert: 0,
        joinClass: 0,
        readDays: 0,
        sportDays: 0
      };
    }
    hallMap[minor].members += 1;
    hallMap[minor].spoke += metrics.spoke;
    hallMap[minor].convert += metrics.convert;
    hallMap[minor].joinClass += metrics.joinClass;
    hallMap[minor].readDays += userActivity.readDays;
    hallMap[minor].sportDays += userActivity.sportDays;

    totals.members += 1;
    totals.spoke += metrics.spoke;
    totals.convert += metrics.convert;
    totals.joinClass += metrics.joinClass;
    totals.readDays += userActivity.readDays;
    totals.sportDays += userActivity.sportDays;
  }

  var hallRows = Object.keys(hallMap).sort().map(function(key) {
    var hall = hallMap[key];
    return [
      ORCHARD_SEASON_31.closingName,
      startDate,
      ORCHARD_SEASON_31.closingEndDate,
      hall.major,
      hall.minor,
      hall.members,
      hall.spoke,
      hall.convert,
      hall.joinClass,
      hall.readDays,
      hall.sportDays,
      settledAt
    ];
  });

  return {
    detailRows: detailRows,
    hallRows: hallRows,
    summary: {
      seasonName: ORCHARD_SEASON_31.closingName,
      startDate: startDate,
      endDate: ORCHARD_SEASON_31.closingEndDate,
      hallCount: hallRows.length,
      members: totals.members,
      spoke: totals.spoke,
      convert: totals.convert,
      joinClass: totals.joinClass,
      readDays: totals.readDays,
      sportDays: totals.sportDays,
      settledAt: settledAt
    }
  };
}

function buildSeasonActivityMapV2(logs, cutoffDate) {
  var readDates = {};
  var sportDates = {};
  var startDate = "";

  for (var i = 1; i < logs.length; i++) {
    if (!logs[i][0] || !logs[i][1]) continue;
    var date = Utilities.formatDate(new Date(logs[i][0]), "GMT+8", "yyyy-MM-dd");
    if (date > cutoffDate) continue;
    if (!startDate || date < startDate) startDate = date;
    var username = String(logs[i][1]);
    var action = String(logs[i][4] || "");
    if (action.indexOf("讀書") !== -1) {
      if (!readDates[username]) readDates[username] = {};
      readDates[username][date] = true;
    }
    if (action.indexOf("運動") !== -1) {
      if (!sportDates[username]) sportDates[username] = {};
      sportDates[username][date] = true;
    }
  }

  var names = {};
  Object.keys(readDates).forEach(function(name) { names[name] = true; });
  Object.keys(sportDates).forEach(function(name) { names[name] = true; });
  var users = {};
  Object.keys(names).forEach(function(name) {
    users[name] = {
      readDays: Object.keys(readDates[name] || {}).length,
      sportDays: Object.keys(sportDates[name] || {}).length
    };
  });
  return { startDate: startDate, users: users };
}

function writeSeasonArchiveV2(spreadsheet, snapshot) {
  writeSeasonTableV2(spreadsheet, "賢德班第31期個人結算", [
    "期別", "開始日", "結束日", "姓名", "區別", "公堂",
    "開口", "渡眾", "入班", "讀書天數", "運動天數", "結算時間"
  ], snapshot.detailRows);
  writeSeasonTableV2(spreadsheet, "賢德班第31期公堂結算", [
    "期別", "開始日", "結束日", "區別", "公堂", "人數",
    "開口", "渡眾", "入班", "讀書人次", "運動人次", "結算時間"
  ], snapshot.hallRows);
}

function writeSeasonTableV2(spreadsheet, sheetName, headers, rows) {
  var sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setBackground("#d9ead3").setFontWeight("bold");
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setWrap(true);
}

function resetUsersForSeason32V2(spreadsheet) {
  var usersSheet = spreadsheet.getSheetByName("Users");
  var lastRow = usersSheet.getLastRow();
  if (lastRow < 2) return;
  var values = usersSheet.getRange(2, 5, lastRow - 1, 1).getValues();
  var resetValues = values.map(function(row) {
    var gameData = parseGameDataV2(row[0]);
    gameData.total_spoke = 0;
    gameData.total_convert = 0;
    gameData.total_class = 0;
    gameData.spoke_count = 0;
    gameData.convert_count = 0;
    gameData.class_count = 0;
    gameData.season_name = ORCHARD_SEASON_31.newName;
    gameData.season_start_date = ORCHARD_SEASON_31.newStartDate;
    return [JSON.stringify(gameData)];
  });
  usersSheet.getRange(2, 5, resetValues.length, 1).setValues(resetValues);
}

function parseGameDataV2(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch (error) {
    return {};
  }
}

function findOrchardViewerV2(username, password) {
  if (!username || !password) return null;
  var users = getSpreadsheet().getSheetByName("Users").getDataRange().getValues();
  for (var i = 1; i < users.length; i++) {
    if (String(users[i][0]) === String(username) && String(users[i][1]) === String(password)) {
      var major = String(users[i][2] || "");
      var minor = String(users[i][3] || "");
      return {
        username: String(users[i][0]),
        major: major,
        minor: minor,
        isAdmin: isOrchardAdminV2(users[i][0], major)
      };
    }
  }
  return null;
}

function isOrchardAdminV2(username, major) {
  return String(username || "").toUpperCase() === "ADMIN" || String(major || "") === "主領班";
}

function canViewHallDetailsV2(viewer, hall) {
  return !!viewer && (viewer.isAdmin || String(viewer.minor) === String(hall));
}

function getOrchardDataV2(username, password) {
  var viewer = findOrchardViewerV2(username, password);
  var users = getSpreadsheet().getSheetByName("Users").getDataRange().getValues();
  var activeSeason = getActiveOrchardSeasonV2();
  var orchard = {};

  for (var i = 1; i < users.length; i++) {
    var minor = String(users[i][3] || "未分類公堂");
    if (!orchard[minor]) {
      orchard[minor] = {
        name: minor,
        spoke: 0,
        convert: 0,
        joinClass: 0,
        members: 0,
        seasonName: activeSeason.name,
        canViewDetails: canViewHallDetailsV2(viewer, minor)
      };
    }
    orchard[minor].members += 1;
    var metrics = seasonMetricsV2(parseGameDataV2(users[i][4]));
    orchard[minor].spoke += metrics.spoke;
    orchard[minor].convert += metrics.convert;
    orchard[minor].joinClass += metrics.joinClass;
  }
  return orchard;
}

function getHallDetailsV2(hall, username, password) {
  var viewer = findOrchardViewerV2(username, password);
  if (!canViewHallDetailsV2(viewer, hall)) {
    return { success: false, error: "權限不足", list: [] };
  }

  var users = getSpreadsheet().getSheetByName("Users").getDataRange().getValues();
  var members = [];
  for (var i = 1; i < users.length; i++) {
    if (String(users[i][3]) !== String(hall)) continue;
    var metrics = seasonMetricsV2(parseGameDataV2(users[i][4]));
    members.push({
      name: users[i][0],
      s: metrics.spoke,
      c: metrics.convert,
      cl: metrics.joinClass
    });
  }
  members.sort(function(a, b) { return (b.s + b.c + b.cl) - (a.s + a.c + a.cl); });
  return { success: true, list: members };
}

function mergeSeasonGameDataV2(storedData, incomingData, logAction, activeSeason) {
  var stored = storedData || {};
  var incoming = incomingData || {};
  var merged = {};
  Object.keys(incoming).forEach(function(key) { merged[key] = incoming[key]; });

  if (activeSeason.name === ORCHARD_SEASON_31.newName && incoming.season_name !== activeSeason.name) {
    merged.total_spoke = Number(stored.total_spoke) || 0;
    merged.total_convert = Number(stored.total_convert) || 0;
    merged.total_class = Number(stored.total_class) || 0;
    merged.spoke_count = Number(stored.spoke_count) || 0;
    merged.convert_count = Number(stored.convert_count) || 0;
    merged.class_count = Number(stored.class_count) || 0;

    if (logAction && String(logAction.action || "").indexOf("回報") !== -1) {
      var detail = String(logAction.detail || "");
      var spoke = detail.match(/開口(\d+)/);
      var convert = detail.match(/渡眾(\d+)/);
      var joinClass = detail.match(/入班(\d+)/);
      merged.spoke_count += spoke ? Number(spoke[1]) || 0 : 0;
      merged.convert_count += convert ? Number(convert[1]) || 0 : 0;
      merged.class_count += joinClass ? Number(joinClass[1]) || 0 : 0;
    }
  }

  merged.season_name = activeSeason.name;
  merged.season_start_date = activeSeason.startDate;
  return merged;
}

function saveGameDataV2(username, password, incomingData, logAction) {
  var sheet = getSpreadsheet().getSheetByName("Users");
  var users = sheet.getDataRange().getValues();
  CacheService.getScriptCache().remove("orchard");

  for (var i = 1; i < users.length; i++) {
    if (users[i][0] == username && users[i][1] == password) {
      var storedData = parseGameDataV2(users[i][4]);
      var newData = mergeSeasonGameDataV2(storedData, incomingData, logAction, getActiveOrchardSeasonV2());
      newData.last_active_date = getTaipeiDate();
      sheet.getRange(i + 1, 5).setValue(JSON.stringify(newData));
      sheet.getRange(i + 1, 6).setValue(new Date());

      if (logAction) {
        var major = users[i][2] || "賢德團隊";
        var minor = users[i][3] || "未分類";
        logActivity(username, major, minor, logAction.action, logAction.detail);
        var pushTitle = "🌱 賢德新動態";
        var pushContent = username + " " + logAction.action + "：" + logAction.detail;
        sendPush(pushTitle, pushContent, null, null);
      }
      return { success: true, msg: "OK", gameData: newData };
    }
  }
  return { success: false, msg: "Fail" };
}
