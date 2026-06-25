// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { ensureLaneStyles } from '@/squiggle'

function styleText(): string {
  const el = document.head.querySelector('style[data-squiggle="true"]')
  return el?.textContent ?? ''
}

describe('ensureLaneStyles', () => {
  it('generates base layers and depth padding up to the requested lane', () => {
    ensureLaneStyles(3)
    const css = styleText()
    expect(css).toContain('--bg-1')
    expect(css).toContain('--bg-3')
    expect(css).toContain('.squiggly-depth-3')
    expect(css).toContain('padding-bottom: 9px')
  })

  it('grows to a higher lane count on demand', () => {
    ensureLaneStyles(3)
    ensureLaneStyles(6)
    const css = styleText()
    expect(css).toContain('--bg-6')
    expect(css).toContain('.squiggly-depth-6')
    expect(css).toContain('padding-bottom: 18px')
  })
})
