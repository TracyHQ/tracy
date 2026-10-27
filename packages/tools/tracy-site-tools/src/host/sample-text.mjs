/**
 * Whether a block's words are a template's Latin sample text: the residue a demo's writes replace, never a customer's.
 *
 * 🔒 A SAMPLE BODY MAY SHRINK (product owner, 25/10/2026): "allow a shrink when the body being replaced is identified
 * template residue; keep the guard for real customer content." The Willow Nook (lrsweep rig, JA Diner wp7): post 41
 * still held the template's seven lorem paragraphs at 1,673 chars, and the agent's own 1,208-char post, sent by
 * position with the rev of the host's read, was refused twice; the sweep's replaces of the same paragraphs were
 * refused too, and the post kept its lorem. The words judged are the ones the host read from the site at the write,
 * never words a model sends.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

/** The words of the lorem ipsum generators templates ship (the classic text and the "Lorem ipsum dolor sit amet, consectetuer" one). */
const LOREM = new Set(
  `lorem ipsum dolor sit amet consectetur consectetuer adipiscing adipisicing elit sed do eiusmod tempor incididunt labore
  dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat
  duis aute irure reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non
  proident sunt culpa qui officia deserunt mollit anim id est laborum aenean ligula eget massa cum sociis natoque
  penatibus et magnis dis parturient montes nascetur ridiculus mus donec quam felis ultricies nec pellentesque eu pretium
  sem pede justo fringilla vel aliquet vulputate arcu in rhoncus ut imperdiet a venenatis vitae nullam dictum mollis
  integer tincidunt cras dapibus vivamus elementum semper eleifend tellus leo porttitor ac aliquam ante viverra feugiat
  phasellus metus varius laoreet quisque rutrum etiam sapien curabitur ullamcorper nam dui maecenas tempus condimentum
  neque augue blandit nunc convallis mauris interdum proin nisl porta hendrerit odio egestas faucibus lacus lectus
  sagittis orci tortor gravida mi suspendisse potenti morbi tristique senectus netus malesuada fames turpis vestibulum
  primis cubilia curae praesent placerat purus fusce suscipit ornare libero dignissim mattis pulvinar risus volutpat
  accumsan iaculis sollicitudin facilisis bibendum diam erat urna nibh efficitur luctus posuere vehicula cursus auctor
  scelerisque lobortis rutrum quisque at euismod hac habitasse platea dictumst tincidunt`.split(/\s+/)
)

/**
 * Whether these words are lorem ipsum: eight words or more, four different lorem words of four letters or more,
 * and at least 60 % of the words lorem. A template's misspelt copy ("eget aucibus elit") still counts.
 * @param {unknown} text - block markup or plain text; comments and tags are not words.
 */
export function isLoremSample(text) {
  const plain = String(text ?? '')
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
  const words = plain.toLowerCase().match(/\p{L}+/gu) ?? []
  if (words.length < 8) return false
  const latin = words.filter((w) => LOREM.has(w))
  return new Set(latin.filter((w) => w.length >= 4)).size >= 4 && latin.length >= 0.6 * words.length
}

/** A host write whose shrink is lorem the host read off the site just before it: set only by {@link withSampleShrink}. */
const sampleScope = new AsyncLocalStorage()

/**
 * Run a host-made body write whose every shortening edit removes lorem the host itself read from the record now
 * (`replace-wordpress.mjs`). No parameter a model sends opens this scope.
 * @template T
 * @param {() => Promise<T>} write
 * @returns {Promise<T>}
 */
export function withSampleShrink(write) {
  return sampleScope.run(true, write)
}

/** Whether the write in flight is one {@link withSampleShrink} opened. */
export const inSampleShrink = () => sampleScope.getStore() === true
