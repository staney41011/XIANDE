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
