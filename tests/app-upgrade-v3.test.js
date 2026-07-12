const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "backend", "AppUpgradeV3.gs"),
  "utf8"
);

function loadContext(directory) {
  const context = {
    console,
    normalizeSharedUsersV2(value) {
      return Array.from(new Set((Array.isArray(value) ? value : []).filter(Boolean)));
    },
    readUserDirectoryV3() {
      return directory;
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  context.readUserDirectoryV3 = () => directory;
  return context;
}

test("normalizes only the supported senior member role", () => {
  const context = loadContext([]);
  assert.equal(context.normalizeMemberRoleV3("學長姐"), "學長姐");
  assert.equal(context.normalizeMemberRoleV3("管理員"), "成員");
});

test("allows valid cross-hall CRM collaborators but excludes the owner", () => {
  const context = loadContext([
    { name: "甲", minor: "一公堂" },
    { name: "乙", minor: "二公堂" },
    { name: "丙", minor: "三公堂" },
  ]);
  const viewer = { username: "甲", minor: "一公堂" };
  assert.deepEqual(
    Array.from(context.sanitizeCRMSharedUsersV3(["甲", "乙", "丙", "不存在"], viewer)),
    ["乙", "丙"]
  );
});

test("recognizes senior identity independently from administrator authority", () => {
  const context = loadContext([]);
  const viewer = context.viewerFromUserRowV3({
    values: ["志士", "pw", "賢德", "一公堂", "{}", "", "學長姐"],
  });
  assert.equal(viewer.role, "學長姐");
  assert.equal(viewer.isAdmin, false);
});
