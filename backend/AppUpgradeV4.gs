// Season 32 goal reporting for leaders and ADMIN.

function normalizeSeason32GoalV4(value) {
  var number = parseInt(value, 10);
  return isFinite(number) && number > 0 ? number : 0;
}

function compareSeason32GoalTextV4(left, right) {
  var a = String(left || "");
  var b = String(right || "");
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function buildSeason32GoalReportV4(rows) {
  var hallsByName = {};
  var members = [];
  var totals = {
    memberCount: 0,
    filledCount: 0,
    spoke: 0,
    convert: 0,
    joinClass: 0
  };

  (rows || []).forEach(function(row) {
    var name = String(row[0] || "").trim();
    if (!name) return;

    var major = String(row[2] || "");
    var hall = String(row[3] || "未分類公堂");
    var gameData = parseGameDataV2(row[4]);
    var goals = gameData && gameData.season32_goals;
    var hasGoals = !!goals && typeof goals === "object";
    var spoke = hasGoals ? normalizeSeason32GoalV4(goals.spoke) : 0;
    var convert = hasGoals ? normalizeSeason32GoalV4(goals.convert) : 0;
    var joinClass = hasGoals ? normalizeSeason32GoalV4(goals.joinClass) : 0;

    if (!hallsByName[hall]) {
      hallsByName[hall] = {
        hall: hall,
        memberCount: 0,
        filledCount: 0,
        spoke: 0,
        convert: 0,
        joinClass: 0
      };
    }

    var hallTotals = hallsByName[hall];
    hallTotals.memberCount += 1;
    totals.memberCount += 1;
    if (hasGoals) {
      hallTotals.filledCount += 1;
      totals.filledCount += 1;
    }
    hallTotals.spoke += spoke;
    hallTotals.convert += convert;
    hallTotals.joinClass += joinClass;
    totals.spoke += spoke;
    totals.convert += convert;
    totals.joinClass += joinClass;

    members.push({
      name: name,
      major: major,
      hall: hall,
      hasGoals: hasGoals,
      spoke: spoke,
      convert: convert,
      joinClass: joinClass
    });
  });

  var halls = Object.keys(hallsByName).map(function(hall) {
    return hallsByName[hall];
  });
  halls.sort(function(a, b) {
    return compareSeason32GoalTextV4(a.hall, b.hall);
  });
  members.sort(function(a, b) {
    var hallOrder = compareSeason32GoalTextV4(a.hall, b.hall);
    return hallOrder || compareSeason32GoalTextV4(a.name, b.name);
  });

  return {
    seasonName: "賢德班第32期",
    totals: totals,
    halls: halls,
    members: members
  };
}

function getSeason32GoalReportV4(username, password) {
  var viewer = findViewerV3(username, password);
  if (!viewer || !viewer.isAdmin) {
    return { success: false, error: "只有主領班及 ADMIN 可以查看立愿目標" };
  }

  var sheet = getSpreadsheet().getSheetByName("Users");
  if (!sheet) return { success: false, error: "找不到 Users 工作表" };
  var rows = sheet.getLastRow() < 2
    ? []
    : sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  var report = buildSeason32GoalReportV4(rows);
  report.success = true;
  report.generatedAt = Utilities.formatDate(new Date(), "GMT+8", "yyyy-MM-dd HH:mm");
  return report;
}
