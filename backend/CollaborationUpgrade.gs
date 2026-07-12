// Season 32 goals, event management, and collaborative CRM storage.

var CRM_NOTES_SHEET_V2 = "CRMNotes";
var CRM_REMINDERS_SHEET_V2 = "CRMReminders";
var CRM_BACKUP_SHEET_V2 = "CRM_共用升級前備份";
var EVENT_CATEGORIES_V2 = ["北賢", "南賢"];

function findCollaborationViewerV2(username, password) {
  if (typeof findViewerV3 === "function") return findViewerV3(username, password);
  if (!username || !password) return null;
  var users = getSpreadsheet().getSheetByName("Users").getDataRange().getValues();
  for (var i = 1; i < users.length; i++) {
    if (String(users[i][0]) === String(username) && String(users[i][1]) === String(password)) {
      var major = String(users[i][2] || "");
      return {
        username: String(users[i][0]),
        major: major,
        minor: String(users[i][3] || ""),
        isAdmin: String(users[i][0]).toUpperCase() === "ADMIN" || major === "主領班"
      };
    }
  }
  return null;
}

function getYearlyEventsV2(username, password) {
  var sheet = getSpreadsheet().getSheetByName("Calendar");
  if (!sheet) return { list: [], cats: EVENT_CATEGORIES_V2.slice(), error: "找不到 Calendar 工作表" };

  var viewer = findCollaborationViewerV2(username, password);
  var data = sheet.getDataRange().getValues();
  var list = [];
  var categories = {};
  EVENT_CATEGORIES_V2.forEach(function(category) { categories[category] = true; });

  for (var i = 1; i < data.length; i++) {
    var title = data[i][0];
    var startRaw = data[i][1];
    if (!title || !startRaw) continue;
    var startDate = new Date(startRaw);
    if (isNaN(startDate.getTime())) continue;
    var endDate = data[i][2] ? new Date(data[i][2]) : startDate;
    if (isNaN(endDate.getTime())) endDate = startDate;
    var category = data[i][3] || "未分類";
    categories[category] = true;
    list.push({
      id: i + 1,
      name: String(title),
      date: Utilities.formatDate(startDate, "GMT+8", "yyyy-MM-dd"),
      end: Utilities.formatDate(endDate, "GMT+8", "yyyy-MM-dd"),
      cat: String(category),
      loc: data[i][4] ? String(data[i][4]) : "",
      note: data[i][5] ? String(data[i][5]) : ""
    });
  }

  list.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
  return {
    success: true,
    list: list,
    cats: Object.keys(categories),
    canManage: !!(viewer && viewer.isAdmin)
  };
}

function saveCalendarEventV2(username, password, item) {
  var viewer = findCollaborationViewerV2(username, password);
  if (!viewer || !viewer.isAdmin) return { success: false, error: "權限不足" };
  item = item || {};

  var title = String(item.name || "").trim();
  var startDate = parseCalendarDateV2(item.date);
  var endDate = parseCalendarDateV2(item.end || item.date);
  var category = String(item.cat || "").trim();
  if (!title || !startDate || !endDate || !category) {
    return { success: false, error: "請完整填寫活動名稱、日期與分類" };
  }
  if (endDate.getTime() < startDate.getTime()) {
    return { success: false, error: "結束日期不可早於開始日期" };
  }

  var sheet = getSpreadsheet().getSheetByName("Calendar");
  if (!sheet) return { success: false, error: "找不到 Calendar 工作表" };
  var row = parseInt(item.id, 10);
  var values = [[
    title,
    startDate,
    endDate,
    category,
    String(item.loc || "").trim(),
    String(item.note || "").trim()
  ]];

  if (row >= 2 && row <= sheet.getLastRow()) sheet.getRange(row, 1, 1, 6).setValues(values);
  else {
    sheet.appendRow(values[0]);
    row = sheet.getLastRow();
  }
  return { success: true, id: row, msg: "活動已儲存" };
}

function parseCalendarDateV2(value) {
  var text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  var parts = text.split("-").map(Number);
  var maxDay = new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
  if (parts[1] < 1 || parts[1] > 12 || parts[2] < 1 || parts[2] > maxDay) return null;
  var date = new Date(text + "T00:00:00+08:00");
  return isNaN(date.getTime()) ? null : date;
}

function migrateCRMToCollaborationV2() {
  var spreadsheet = getSpreadsheet();
  var crmSheet = spreadsheet.getSheetByName("CRM");
  if (!crmSheet) throw new Error("找不到 CRM 工作表");
  if (!spreadsheet.getSheetByName(CRM_BACKUP_SHEET_V2)) {
    crmSheet.copyTo(spreadsheet).setName(CRM_BACKUP_SHEET_V2).hideSheet();
  }

  ensureCRMStorageV2(spreadsheet);
  var lastRow = crmSheet.getLastRow();
  if (lastRow < 2) {
    installCRMReminderTriggerV2();
    return { success: true, records: 0, notes: 0, reminders: 0 };
  }

  var rows = crmSheet.getRange(2, 1, lastRow - 1, 10).getValues();
  var notesSheet = spreadsheet.getSheetByName(CRM_NOTES_SHEET_V2);
  var reminderSheet = spreadsheet.getSheetByName(CRM_REMINDERS_SHEET_V2);
  var existingNotes = buildExistingCRMNoteKeysV2(notesSheet);
  var noteRows = [];
  var migratedReminders = 0;

  rows.forEach(function(row) {
    var owner = String(row[0] || "").trim();
    if (!owner) return;
    var recordId = String(row[8] || "").trim() || createCRMRecordIdV2();
    row[8] = recordId;
    row[9] = JSON.stringify(normalizeSharedUsersV2(row[9]));

    var legacyNote = String(row[4] || "").trim();
    if (legacyNote) {
      var noteKey = recordId + "|" + owner + "|" + legacyNote;
      if (!existingNotes[noteKey]) {
        noteRows.push([Utilities.getUuid(), recordId, owner, legacyNote, row[5] || new Date()]);
        existingNotes[noteKey] = true;
      }
      row[4] = "";
    }

    if (row[6]) {
      upsertCRMReminderV2(reminderSheet, recordId, owner, row[6], row[7] || "none");
      migratedReminders++;
      row[6] = "";
      row[7] = "none";
    }
  });

  crmSheet.getRange(1, 9, 1, 2).setValues([["Record ID", "Shared With"]]);
  crmSheet.getRange(2, 1, rows.length, 10).setValues(rows);
  if (noteRows.length) notesSheet.getRange(notesSheet.getLastRow() + 1, 1, noteRows.length, 5).setValues(noteRows);
  installCRMReminderTriggerV2();
  return { success: true, records: rows.length, notes: noteRows.length, reminders: migratedReminders };
}

function ensureCRMStorageV2(spreadsheet) {
  spreadsheet = spreadsheet || getSpreadsheet();
  var crmSheet = spreadsheet.getSheetByName("CRM");
  if (crmSheet.getMaxColumns() < 10) crmSheet.insertColumnsAfter(crmSheet.getMaxColumns(), 10 - crmSheet.getMaxColumns());
  crmSheet.getRange(1, 9, 1, 2).setValues([["Record ID", "Shared With"]]);
  ensureCRMTableV2(spreadsheet, CRM_NOTES_SHEET_V2, ["Note ID", "Record ID", "Author", "Note", "Created At"]);
  ensureCRMTableV2(spreadsheet, CRM_REMINDERS_SHEET_V2, ["Record ID", "User", "Remind At", "Repeat"]);
}

function ensureCRMTableV2(spreadsheet, sheetName, headers) {
  var sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setBackground("#d9ead3").setFontWeight("bold");
  sheet.setFrozenRows(1);
  return sheet;
}

function createCRMRecordIdV2() {
  return "CRM-" + Utilities.getUuid();
}

function normalizeSharedUsersV2(value) {
  var list = value;
  if (!Array.isArray(list)) {
    try {
      list = JSON.parse(String(value || "[]"));
    } catch (error) {
      list = String(value || "").split(",");
    }
  }
  var seen = {};
  return (Array.isArray(list) ? list : []).map(function(name) {
    return String(name || "").trim();
  }).filter(function(name) {
    if (!name || seen[name]) return false;
    seen[name] = true;
    return true;
  });
}

function isCRMRecordMemberV2(owner, sharedWith, username) {
  var name = String(username || "");
  return String(owner || "") === name || normalizeSharedUsersV2(sharedWith).indexOf(name) !== -1;
}

function getCRMV2(username, password, targetUsername) {
  var viewer = findCollaborationViewerV2(username, password);
  if (!viewer) return { success: false, error: "登入資料已失效", list: [] };
  var target = String(targetUsername || viewer.username);
  if (target !== viewer.username && !viewer.isAdmin) {
    return { success: false, error: "權限不足", list: [] };
  }

  var spreadsheet = getSpreadsheet();
  var crmSheet = spreadsheet.getSheetByName("CRM");
  var notesByRecord = readCRMNotesByRecordV2(spreadsheet);
  var reminders = target === viewer.username ? readCRMReminderMapV2(spreadsheet, target) : {};
  var rows = crmSheet.getLastRow() < 2 ? [] : crmSheet.getRange(2, 1, crmSheet.getLastRow() - 1, 10).getValues();
  var list = [];

  for (var i = rows.length - 1; i >= 0; i--) {
    var owner = String(rows[i][0] || "");
    var sharedWith = normalizeSharedUsersV2(rows[i][9]);
    if (!isCRMRecordMemberV2(owner, sharedWith, target)) continue;
    var recordId = String(rows[i][8] || "");
    var reminder = reminders[recordId] || { remind: "", repeat: "none" };
    list.push({
      id: i + 2,
      recordId: recordId,
      owner: owner,
      isOwner: owner === target,
      canDelete: owner === viewer.username,
      name: String(rows[i][1] || ""),
      status: String(rows[i][2] || ""),
      todo: String(rows[i][3] || ""),
      updated: formatCRMDateV2(rows[i][5], "MM/dd"),
      remind: reminder.remind,
      repeat: reminder.repeat,
      sharedWith: sharedWith,
      notes: notesByRecord[recordId] || []
    });
  }

  return {
    success: true,
    list: list,
    members: target === viewer.username ? getEligibleCRMShareMembersV2(viewer) : [],
    viewer: viewer.username
  };
}

function ensureCRMRecordIdsV2(spreadsheet) {
  var sheet = spreadsheet.getSheetByName("CRM");
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var values = sheet.getRange(2, 9, lastRow - 1, 2).getValues();
  var changed = false;
  values.forEach(function(row) {
    if (!row[0]) {
      row[0] = createCRMRecordIdV2();
      changed = true;
    }
    var normalized = JSON.stringify(normalizeSharedUsersV2(row[1]));
    if (String(row[1] || "") !== normalized) {
      row[1] = normalized;
      changed = true;
    }
  });
  if (changed) sheet.getRange(2, 9, values.length, 2).setValues(values);
}

function getEligibleCRMShareMembersV2(viewer) {
  var names = [];
  if (typeof readUserDirectoryV3 === "function") {
    readUserDirectoryV3().forEach(function(user) {
      if (user.name !== viewer.username && (!viewer.minor || user.minor === viewer.minor)) names.push(user.name);
    });
    return names.sort(function(a, b) { return a.localeCompare(b, "zh-Hant"); });
  }
  var users = getSpreadsheet().getSheetByName("Users").getDataRange().getValues();
  for (var i = 1; i < users.length; i++) {
    var name = String(users[i][0] || "").trim();
    var minor = String(users[i][3] || "");
    if (name && name !== viewer.username && (!viewer.minor || minor === viewer.minor)) names.push(name);
  }
  return names.sort(function(a, b) { return a.localeCompare(b, "zh-Hant"); });
}

function saveCRMV2(username, password, item) {
  var viewer = findCollaborationViewerV2(username, password);
  if (!viewer) return { success: false, error: "登入資料已失效" };
  item = item || {};
  var name = String(item.name || "").trim();
  if (!name) return { success: false, error: "請輸入姓名" };

  var spreadsheet = getSpreadsheet();
  ensureCRMStorageV2(spreadsheet);
  ensureCRMRecordIdsV2(spreadsheet);
  var sheet = spreadsheet.getSheetByName("CRM");
  var recordId = String(item.recordId || "").trim();
  var record = recordId ? findCRMRecordV2(sheet, recordId) : null;
  var now = new Date();
  var owner;
  var sharedWith;

  if (!record) {
    recordId = createCRMRecordIdV2();
    owner = viewer.username;
    sharedWith = sanitizeCRMSharedUsersV2(item.sharedWith, viewer);
    sheet.appendRow([
      owner, name, String(item.status || "預計渡眾"), String(item.todo || ""), "", now,
      "", "none", recordId, JSON.stringify(sharedWith)
    ]);
  } else {
    owner = String(record.values[0] || "");
    var existingShared = normalizeSharedUsersV2(record.values[9]);
    if (!isCRMRecordMemberV2(owner, existingShared, viewer.username)) {
      return { success: false, error: "您不在這份共同成全名單中" };
    }
    sharedWith = owner === viewer.username ? sanitizeCRMSharedUsersV2(item.sharedWith, viewer) : existingShared;
    sheet.getRange(record.row, 2, 1, 3).setValues([[
      name, String(item.status || "預計渡眾"), String(item.todo || "")
    ]]);
    sheet.getRange(record.row, 6).setValue(now);
    sheet.getRange(record.row, 10).setValue(JSON.stringify(sharedWith));
  }

  setCRMReminderForUserV2(spreadsheet, recordId, viewer.username, item.remind, item.repeat);
  removeCRMRemindersForNonMembersV2(spreadsheet, recordId, [owner].concat(sharedWith));
  var initialNote = String(item.initialNote || "").trim();
  if (initialNote) appendCRMNoteV2(spreadsheet, recordId, viewer.username, initialNote);
  return { success: true, msg: "儲存成功", recordId: recordId };
}

function sanitizeCRMSharedUsersV2(value, viewer) {
  if (typeof sanitizeCRMSharedUsersV3 === "function") return sanitizeCRMSharedUsersV3(value, viewer);
  var allowed = {};
  getEligibleCRMShareMembersV2(viewer).forEach(function(name) { allowed[name] = true; });
  return normalizeSharedUsersV2(value).filter(function(name) { return !!allowed[name]; });
}

function findCRMRecordV2(sheet, recordId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][8]) === String(recordId)) return { row: i + 2, values: rows[i] };
  }
  return null;
}

function deleteCRMV2(username, password, recordId) {
  var viewer = findCollaborationViewerV2(username, password);
  if (!viewer) return { success: false, error: "登入資料已失效" };
  var spreadsheet = getSpreadsheet();
  ensureCRMStorageV2(spreadsheet);
  var sheet = spreadsheet.getSheetByName("CRM");
  var record = findCRMRecordV2(sheet, recordId);
  if (!record) return { success: false, error: "找不到名單" };
  if (String(record.values[0]) !== viewer.username) {
    return { success: false, error: "只有原始建立者可以刪除這份名單" };
  }
  sheet.deleteRow(record.row);
  deleteCRMRowsByRecordV2(spreadsheet.getSheetByName(CRM_NOTES_SHEET_V2), recordId, 2);
  deleteCRMRowsByRecordV2(spreadsheet.getSheetByName(CRM_REMINDERS_SHEET_V2), recordId, 1);
  return { success: true, msg: "已刪除" };
}

function addCRMNoteV2(username, password, recordId, noteText) {
  var viewer = findCollaborationViewerV2(username, password);
  if (!viewer) return { success: false, error: "登入資料已失效" };
  var text = String(noteText || "").trim();
  if (!text) return { success: false, error: "請輸入備註" };
  var spreadsheet = getSpreadsheet();
  ensureCRMStorageV2(spreadsheet);
  var record = findCRMRecordV2(spreadsheet.getSheetByName("CRM"), recordId);
  if (!record || !isCRMRecordMemberV2(record.values[0], record.values[9], viewer.username)) {
    return { success: false, error: "您不在這份共同成全名單中" };
  }
  var noteId = appendCRMNoteV2(spreadsheet, recordId, viewer.username, text);
  return { success: true, noteId: noteId, msg: "備註已新增" };
}

function appendCRMNoteV2(spreadsheet, recordId, author, noteText) {
  var noteId = Utilities.getUuid();
  spreadsheet.getSheetByName(CRM_NOTES_SHEET_V2).appendRow([
    noteId, recordId, author, noteText, new Date()
  ]);
  return noteId;
}

function deleteCRMNoteV2(username, password, noteId) {
  var viewer = findCollaborationViewerV2(username, password);
  if (!viewer) return { success: false, error: "登入資料已失效" };
  var spreadsheet = getSpreadsheet();
  ensureCRMStorageV2(spreadsheet);
  var notesSheet = spreadsheet.getSheetByName(CRM_NOTES_SHEET_V2);
  var notes = notesSheet.getLastRow() < 2 ? [] : notesSheet.getRange(2, 1, notesSheet.getLastRow() - 1, 5).getValues();
  for (var i = 0; i < notes.length; i++) {
    if (String(notes[i][0]) !== String(noteId)) continue;
    var record = findCRMRecordV2(spreadsheet.getSheetByName("CRM"), notes[i][1]);
    if (!record || !isCRMRecordMemberV2(record.values[0], record.values[9], viewer.username)) {
      return { success: false, error: "您沒有整理這則備註的權限" };
    }
    notesSheet.deleteRow(i + 2);
    return { success: true, msg: "備註已刪除" };
  }
  return { success: false, error: "找不到備註" };
}

function readCRMNotesByRecordV2(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(CRM_NOTES_SHEET_V2);
  var rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  var map = {};
  rows.forEach(function(row) {
    var recordId = String(row[1] || "");
    if (!recordId) return;
    if (!map[recordId]) map[recordId] = [];
    map[recordId].push({
      id: String(row[0] || ""),
      author: String(row[2] || ""),
      text: String(row[3] || ""),
      time: formatCRMDateV2(row[4], "yyyy-MM-dd HH:mm")
    });
  });
  return map;
}

function buildExistingCRMNoteKeysV2(sheet) {
  var keys = {};
  if (sheet.getLastRow() < 2) return keys;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues().forEach(function(row) {
    keys[String(row[1]) + "|" + String(row[2]) + "|" + String(row[3])] = true;
  });
  return keys;
}

function formatCRMDateV2(value, pattern) {
  if (!value) return "";
  var date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return Utilities.formatDate(date, "GMT+8", pattern);
}

function setCRMReminderForUserV2(spreadsheet, recordId, username, remindValue, repeatValue) {
  var sheet = spreadsheet.getSheetByName(CRM_REMINDERS_SHEET_V2);
  var remind = String(remindValue || "").trim();
  deleteCRMReminderForUserV2(sheet, recordId, username);
  if (!remind) return;
  var date = parseCRMReminderDateV2(remind);
  if (isNaN(date.getTime())) return;
  sheet.appendRow([recordId, username, date, normalizeCRMRepeatV2(repeatValue)]);
}

function upsertCRMReminderV2(sheet, recordId, username, remindValue, repeatValue) {
  deleteCRMReminderForUserV2(sheet, recordId, username);
  sheet.appendRow([recordId, username, remindValue, normalizeCRMRepeatV2(repeatValue)]);
}

function deleteCRMReminderForUserV2(sheet, recordId, username) {
  if (sheet.getLastRow() < 2) return;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][0]) === String(recordId) && String(rows[i][1]) === String(username)) {
      sheet.deleteRow(i + 2);
    }
  }
}

function removeCRMRemindersForNonMembersV2(spreadsheet, recordId, members) {
  var memberMap = {};
  members.forEach(function(name) { memberMap[String(name)] = true; });
  var sheet = spreadsheet.getSheetByName(CRM_REMINDERS_SHEET_V2);
  if (sheet.getLastRow() < 2) return;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][0]) === String(recordId) && !memberMap[String(rows[i][1])]) sheet.deleteRow(i + 2);
  }
}

function readCRMReminderMapV2(spreadsheet, username) {
  var sheet = spreadsheet.getSheetByName(CRM_REMINDERS_SHEET_V2);
  var rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  var map = {};
  rows.forEach(function(row) {
    if (String(row[1]) !== String(username)) return;
    map[String(row[0])] = {
      remind: row[2] ? formatCRMDateV2(row[2], "yyyy-MM-dd'T'HH:mm") : "",
      repeat: normalizeCRMRepeatV2(row[3])
    };
  });
  return map;
}

function normalizeCRMRepeatV2(value) {
  var repeat = String(value || "none");
  return ["none", "daily", "weekly", "monthly"].indexOf(repeat) === -1 ? "none" : repeat;
}

function parseCRMReminderDateV2(value) {
  if (value instanceof Date) return new Date(value.getTime());
  var text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return new Date(text + ":00+08:00");
  return new Date(value);
}

function nextCRMReminderDateV2(value, repeat) {
  var date = new Date(value);
  if (isNaN(date.getTime()) || repeat === "none") return null;
  if (repeat === "daily") date.setDate(date.getDate() + 1);
  else if (repeat === "weekly") date.setDate(date.getDate() + 7);
  else if (repeat === "monthly") date.setMonth(date.getMonth() + 1);
  return date;
}

function checkCRMRemindersV2() {
  var spreadsheet = getSpreadsheet();
  ensureCRMStorageV2(spreadsheet);
  var crmSheet = spreadsheet.getSheetByName("CRM");
  var reminderSheet = spreadsheet.getSheetByName(CRM_REMINDERS_SHEET_V2);
  if (reminderSheet.getLastRow() < 2) return;

  var crmRows = crmSheet.getLastRow() < 2 ? [] : crmSheet.getRange(2, 1, crmSheet.getLastRow() - 1, 10).getValues();
  var records = {};
  crmRows.forEach(function(row) {
    records[String(row[8] || "")] = {
      owner: String(row[0] || ""),
      sharedWith: normalizeSharedUsersV2(row[9]),
      name: String(row[1] || ""),
      todo: String(row[3] || "")
    };
  });

  var rows = reminderSheet.getRange(2, 1, reminderSheet.getLastRow() - 1, 4).getValues();
  var now = new Date();
  rows.forEach(function(row, index) {
    var record = records[String(row[0] || "")];
    var username = String(row[1] || "");
    var remindDate = new Date(row[2]);
    if (!record || !isCRMRecordMemberV2(record.owner, record.sharedWith, username)) {
      reminderSheet.getRange(index + 2, 3).clearContent();
      return;
    }
    if (isNaN(remindDate.getTime()) || remindDate > now) return;
    sendPushToUser(username, "📅 記事本提醒", "🔔 待辦提醒：" + record.name + "\n內容：" + (record.todo || "記得跟進"));
    var nextDate = nextCRMReminderDateV2(remindDate, normalizeCRMRepeatV2(row[3]));
    if (nextDate) reminderSheet.getRange(index + 2, 3).setValue(nextDate);
    else reminderSheet.getRange(index + 2, 3).clearContent();
  });
}

function installCRMReminderTriggerV2() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "checkCRMRemindersV2") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("checkCRMRemindersV2").timeBased().everyHours(1).create();
}

function deleteCRMRowsByRecordV2(sheet, recordId, recordColumn) {
  if (!sheet || sheet.getLastRow() < 2) return;
  var column = Math.max(1, Number(recordColumn) || 1);
  var values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]) === String(recordId)) sheet.deleteRow(i + 2);
  }
}
