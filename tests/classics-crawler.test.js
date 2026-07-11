const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "backend", "ClassicsUpgrade.gs"),
  "utf8"
);
const context = { console };
vm.createContext(context);
vm.runInContext(source, context);

test("splits and deduplicates configured Ctext source URLs", () => {
  const result = Array.from(context.splitClassicSourceUrlsV3(
    "https://ctext.org/a\nhttps://ctext.org/b | https://ctext.org/a",
    ""
  ));
  assert.deepEqual(result, ["https://ctext.org/a", "https://ctext.org/b"]);
});

test("keeps only the requested Ctext subsection", () => {
  const html = [
    '<h2 id="前言" class="wikisubsectiontitle">前言</h2>',
    '<td class="ctext">不要</td>',
    '<h2 id="金剛般若波羅蜜經" class="wikisubsectiontitle">正文</h2>',
    '<td class="ctext">如是我聞</td>',
    '<h2 id="附錄" class="wikisubsectiontitle">附錄</h2>',
    '<td class="ctext">不要</td>'
  ].join("");

  const scoped = context.scopeCtextHtmlV3(html, "金剛般若波羅蜜經");
  assert.deepEqual(
    Array.from(context.extractCtextCellsV2(scoped, "ctext")),
    ["如是我聞"]
  );
});

test("rejects non-Ctext configured sources", () => {
  assert.deepEqual(
    Array.from(context.splitClassicSourceUrlsV3("https://example.com/text", "")),
    []
  );
});

test("recognizes an already imported source set", () => {
  const sheet = {
    getLastRow: () => 3,
    getRange: () => ({
      getValues: () => [["https://ctext.org/a"], ["https://ctext.org/b"]]
    })
  };
  const spreadsheet = { getSheetByName: () => sheet };

  assert.equal(
    context.isClassicSheetCurrentV3(
      spreadsheet,
      "經典",
      ["https://ctext.org/b", "https://ctext.org/a"]
    ),
    true
  );
});

test("normalizes punctuation and spacing for classics search", () => {
  assert.equal(
    context.normalizeClassicSearchTextV2("學而時習之，不亦說乎？"),
    "學而時習之不亦說乎"
  );
});

test("finds matches across different classics and translation fields", () => {
  const rows = [
    ["論語", "學而第一", "學而第一", 2, "學而時習之，不亦說乎？", "", "https://ctext.org/a"],
    ["金心", "金剛經", "金剛經", 8, "應無所住，而生其心。", "不執著而生清淨心。", "https://ctext.org/b"],
    ["孟子一", "梁惠王上", "梁惠王上", 3, "王何必曰利？亦有仁義而已矣。", "何必只談利益？", "https://ctext.org/c"]
  ];

  const originalResult = context.matchClassicSearchRowsV2(rows, "應無所住", 50);
  assert.equal(originalResult.total, 1);
  assert.equal(originalResult.list[0].title, "金剛經");
  assert.equal(originalResult.list[0].matchedIn, "original");

  const translationResult = context.matchClassicSearchRowsV2(rows, "只談利益", 50);
  assert.equal(translationResult.total, 1);
  assert.equal(translationResult.list[0].subject, "孟子一");
  assert.equal(translationResult.list[0].matchedIn, "translation");
});
