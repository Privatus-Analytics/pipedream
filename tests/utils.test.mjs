import assert from "node:assert";
import { describe, it } from "node:test";
import utils from "../components/privatus_analytics/common/utils.mjs";

describe("utils", () => {
  it("builds Rails style arrays and JSON filters", () => {
    assert.strictEqual(
      utils.queryString({
        q: "great product",
        status: [
          "pending",
          "approved",
        ],
        filters: [
          [
            "country",
            "is",
            "US",
          ],
        ],
        empty: "",
        none: [],
        page: 2,
      }),
      "q=great%20product&status[]=pending&status[]=approved&filters=%5B%5B%22country%22%2C%22is%22%2C%22US%22%5D%5D&page=2",
    );
  });

  it("keeps false and zero but drops blanks", () => {
    assert.deepStrictEqual(utils.compact({
      a: false,
      b: 0,
      c: "",
      d: undefined,
      e: null,
      f: [],
      g: "x",
    }), {
      a: false,
      b: 0,
      g: "x",
    });
  });

  it("reads lists, numbers, dates and months", () => {
    assert.deepStrictEqual(utils.toList([
      "a, b",
      "c",
    ]), [
      "a",
      "b",
      "c",
    ]);
    assert.strictEqual(utils.toList(""), undefined);
    assert.strictEqual(utils.toNumber("49.5"), 49.5);
    assert.throws(() => utils.toNumber("x"), /not a number/);
    assert.strictEqual(utils.toDate("2026-10-20T10:15:00Z"), "2026-10-20");
    assert.throws(() => utils.toDate("nonsense"), /not a date/);
    assert.strictEqual(utils.toMonth("2026-09-15"), "2026-09");
    assert.strictEqual(utils.toMonth("2026-09"), "2026-09");
  });

  it("parses JSON and refuses bad JSON", () => {
    assert.deepStrictEqual(utils.parseJson("[[\"a\",\"is\",\"b\"]]"), [
      [
        "a",
        "is",
        "b",
      ],
    ]);
    assert.strictEqual(utils.parseJson(""), undefined);
    assert.throws(() => utils.parseJson("[oops", "Filters"), /Filters/);
  });

  it("normalizes domains and escapes path segments", () => {
    assert.strictEqual(utils.normalizeDomain("https://www.Example.com/pricing?x=1"), "example.com");
    assert.strictEqual(utils.segment("prop:plan"), "prop:plan");
    assert.strictEqual(utils.segment("a/b?c"), "a%2Fb%3Fc");
  });

  it("keeps the custom request on the API host", () => {
    assert.strictEqual(utils.apiPath("/sites/pa_1/goals"), "/sites/pa_1/goals.json");
    assert.strictEqual(
      utils.apiPath("https://evil.example.net/sites/pa_1/goals.json?x=1"),
      "/sites/pa_1/goals.json?x=1",
    );
    for (const bad of [
      "",
      "sites",
      "//evil.example.net/x",
      "/a/../b",
      "/a b",
    ]) {
      assert.throws(() => utils.apiPath(bad), /Path/, bad);
    }
  });
});
