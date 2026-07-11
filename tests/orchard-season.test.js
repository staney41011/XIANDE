const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../backend/OrchardSeason.gs"), "utf8");
const context = { console };
vm.createContext(context);
vm.runInContext(source, context);

test("allows leaders and ADMIN to inspect every hall", () => {
  assert.equal(context.isOrchardAdminV2("ADMIN", "主領班"), true);
  assert.equal(context.isOrchardAdminV2("王小明", "主領班"), true);
  assert.equal(context.canViewHallDetailsV2({ isAdmin: true, minor: "光賢" }, "宏賢"), true);
});

test("limits regular users to their own hall details", () => {
  const viewer = { isAdmin: false, minor: "光賢" };
  assert.equal(context.canViewHallDetailsV2(viewer, "光賢"), true);
  assert.equal(context.canViewHallDetailsV2(viewer, "宏賢"), false);
  assert.equal(context.canViewHallDetailsV2(null, "光賢"), false);
});

test("adds current daily values to stored season totals", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.seasonMetricsV2({
      total_spoke: 40,
      spoke_count: 2,
      total_convert: 1,
      convert_count: 3,
      total_class: 0,
      class_count: 1
    }))),
    { spoke: 42, convert: 4, joinClass: 1 }
  );
});

test("rejects stale season totals while preserving a new achievement increment", () => {
  const merged = context.mergeSeasonGameDataV2(
    { total_spoke: 0, spoke_count: 0, total_convert: 0, convert_count: 0, total_class: 0, class_count: 0 },
    { total_spoke: 99, spoke_count: 9, total_convert: 8, convert_count: 7, total_class: 6, class_count: 5 },
    { action: "回報成果", detail: "開口2, 渡眾1, 入班3" },
    { name: "賢德班第32期", startDate: "2026-07-12" }
  );

  assert.equal(merged.total_spoke, 0);
  assert.equal(merged.spoke_count, 2);
  assert.equal(merged.convert_count, 1);
  assert.equal(merged.class_count, 3);
  assert.equal(merged.season_name, "賢德班第32期");
});
