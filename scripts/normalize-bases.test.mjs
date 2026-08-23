import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeExpression as n } from "./normalize-bases.mjs"

test("裸中文标识符包成 note[...]", () => {
  assert.equal(n("复习 == 0"), 'note["复习"] == 0')
  assert.equal(n("错因 == \"知识空白\""), 'note["错因"] == "知识空白"')
  assert.equal(n("评分 > 3 && 复习 < 2"), 'note["评分"] > 3 && note["复习"] < 2')
})

test("已经改写过的不会被包两层", () => {
  const once = n("复习 == 0")
  assert.equal(n(once), once)
})

test("字符串字面量里的中文原样保留", () => {
  assert.equal(n('file.inFolder("exercises/math")'), 'file.inFolder("exercises/math")')
  assert.equal(n('note["错因"] == "方法缺失"'), 'note["错因"] == "方法缺失"')
})

test("ASCII 标识符和内置函数不动", () => {
  assert.equal(n("file.hasTag(\"错题\")"), 'file.hasTag("错题")')
  assert.equal(n("file.mtime > date(\"2026-01-01\")"), 'file.mtime > date("2026-01-01")')
})

test("中文属性上的方法调用", () => {
  assert.equal(n('知识点.contains("极限")'), 'note["知识点"].contains("极限")')
})

test("含转义引号的字符串不会让扫描错位", () => {
  assert.equal(n('错因 == "a\\"b" && 复习 == 1'), 'note["错因"] == "a\\"b" && note["复习"] == 1')
})

test("中英混合的键名当作一个整体", () => {
  assert.equal(n("评分A == 1"), 'note["评分A"] == 1')
})
