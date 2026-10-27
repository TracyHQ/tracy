/**
 * The one reader of a rendered artifact, shared by the build check and the live DOM observation.
 *
 * It is a source string because the live run evaluates it inside the sample's own iframe, where
 * nothing of this process exists. Same code both sides: a build check that read the markup
 * differently from the browser would agree with the plan and still miss what visitors see.
 */
export const EXTRACT_SOURCE = `(function extractFields(root) {
  var out = {};
  var norm = function (value) { return String(value).replace(/\\s+/g, ' ').trim(); };
  var add = function (key, value) {
    if (Object.prototype.hasOwnProperty.call(out, key) && out[key] !== value)
      throw new Error('Field rendered twice with different values: ' + key);
    out[key] = value;
  };
  var nodes = root.querySelectorAll('[data-field]');
  for (var i = 0; i < nodes.length; i++)
    add(nodes[i].getAttribute('data-field'), norm(nodes[i].textContent));
  var names = ['href', 'src', 'alt'];
  for (var n = 0; n < names.length; n++) {
    var marked = root.querySelectorAll('[data-field-' + names[n] + ']');
    for (var m = 0; m < marked.length; m++)
      add(marked[m].getAttribute('data-field-' + names[n]), norm(marked[m].getAttribute(names[n])));
  }
  return out;
})`

/** Evaluate the extractor against any DOM-like document (linkedom locally, the page in Chrome). */
export function extractFrom(document) {
  // eslint-disable-next-line no-eval
  return (0, eval)(EXTRACT_SOURCE)(document)
}
