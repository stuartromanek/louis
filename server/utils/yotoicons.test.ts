import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseYotoiconsHtml } from './yotoicons.ts'

describe('parseYotoiconsHtml', () => {
  it('extracts icons from populate_icon_modal calls', () => {
    const html = `
      <div class="icon" onclick="populate_icon_modal('12583', 'animals', 'Grannies Bingo', 'Bluey Book Reads', 'curiouscat', '9556');">
        <img src="/static/uploads/12583.png">
      </div>
      <div class="icon" onclick="populate_icon_modal('8703', 'animals', 'gruffalo', 'Julia Donaldson', 'curiouscat', '5072');">
    `
    const icons = parseYotoiconsHtml(html)
    assert.equal(icons.length, 2)
    assert.equal(icons[0]!.id, '12583')
    assert.equal(icons[0]!.source, 'yotoicons')
    assert.equal(icons[0]!.author, 'curiouscat')
    assert.equal(icons[0]!.imageUrl, 'https://yotoicons.com/static/uploads/12583.png')
    assert.ok(icons[0]!.tags.includes('animals'))
  })
})
