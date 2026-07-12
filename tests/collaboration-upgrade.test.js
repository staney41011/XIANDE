const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "backend", "CollaborationUpgrade.gs"),
  "utf8"
);
const context = { console };
vm.createContext(context);
vm.runInContext(source, context);

test("normalizes and deduplicates shared CRM members", () => {
  assert.deepEqual(
    Array.from(context.normalizeSharedUsersV2('["甲", "乙", "甲", ""]')),
    ["甲", "乙"]
  );
});

test("recognizes owner and selected collaborators as record members", () => {
  assert.equal(context.isCRMRecordMemberV2("甲", ["乙"], "甲"), true);
  assert.equal(context.isCRMRecordMemberV2("甲", ["乙"], "乙"), true);
  assert.equal(context.isCRMRecordMemberV2("甲", ["乙"], "丙"), false);
});

test("advances independent reminders by their own repeat interval", () => {
  const sourceDate = new Date("2026-07-12T08:00:00+08:00");
  const daily = context.nextCRMReminderDateV2(sourceDate, "daily");
  const weekly = context.nextCRMReminderDateV2(sourceDate, "weekly");
  assert.equal(daily.getTime() - sourceDate.getTime(), 24 * 60 * 60 * 1000);
  assert.equal(weekly.getTime() - sourceDate.getTime(), 7 * 24 * 60 * 60 * 1000);
  assert.equal(context.nextCRMReminderDateV2(sourceDate, "none"), null);
});

test("accepts only valid calendar date-only values", () => {
  assert.equal(Number.isFinite(context.parseCalendarDateV2("2026-07-12").getTime()), true);
  assert.equal(context.parseCalendarDateV2("2026/07/12"), null);
  assert.equal(context.parseCalendarDateV2("2026-02-31"), null);
  assert.equal(context.parseCalendarDateV2(""), null);
});

test("parses datetime-local reminders in Taipei time", () => {
  const reminder = context.parseCRMReminderDateV2("2026-07-12T08:30");
  assert.equal(reminder.toISOString(), "2026-07-12T00:30:00.000Z");
});
