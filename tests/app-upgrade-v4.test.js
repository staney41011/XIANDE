const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "backend", "AppUpgradeV4.gs"),
  "utf8"
);

function loadContext(overrides = {}) {
  const context = {
    console,
    parseGameDataV2(value) {
      try {
        return typeof value === "string" ? JSON.parse(value || "{}") : value || {};
      } catch (error) {
        return {};
      }
    },
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

test("aggregates season 32 targets by hall and across all members", () => {
  const context = loadContext();
  const report = context.buildSeason32GoalReportV4([
    ["甲", "pw", "賢德", "一公堂", JSON.stringify({ season32_goals: { spoke: 10, convert: 2, joinClass: 1 } })],
    ["乙", "pw", "賢德", "一公堂", JSON.stringify({ season32_goals: { spoke: "5", convert: 1, joinClass: 0 } })],
    ["丙", "pw", "賢德", "二公堂", "{}"],
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(report.totals)), {
    memberCount: 3,
    filledCount: 2,
    spoke: 15,
    convert: 3,
    joinClass: 1,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(report.halls)), [
    { hall: "一公堂", memberCount: 2, filledCount: 2, spoke: 15, convert: 3, joinClass: 1 },
    { hall: "二公堂", memberCount: 1, filledCount: 0, spoke: 0, convert: 0, joinClass: 0 },
  ]);
  assert.equal(report.members[2].name, "丙");
  assert.equal(report.members[2].hasGoals, false);
});

test("treats saved zero targets as filled and ignores invalid negative values", () => {
  const context = loadContext();
  const report = context.buildSeason32GoalReportV4([
    ["甲", "pw", "賢德", "一公堂", JSON.stringify({ season32_goals: { spoke: 0, convert: -2, joinClass: "bad" } })],
  ]);

  assert.equal(report.totals.filledCount, 1);
  assert.equal(report.members[0].hasGoals, true);
  assert.equal(report.members[0].spoke, 0);
  assert.equal(report.members[0].convert, 0);
  assert.equal(report.members[0].joinClass, 0);
});

test("rejects non-leaders before reading the Users sheet", () => {
  const context = loadContext({
    findViewerV3() {
      return { isAdmin: false };
    },
    getSpreadsheet() {
      throw new Error("should not read spreadsheet");
    },
  });

  const result = context.getSeason32GoalReportV4("成員", "pw");
  assert.equal(result.success, false);
  assert.match(result.error, /主領班/);
});
