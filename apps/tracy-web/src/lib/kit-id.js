// The kit id as a plan names it, shared by the writer bench and the picture bench.
/** The kit id as a plan names it: "<kit format> <contract>", e.g. "tracy-template-kit/2 ja-boxing/j6/1.0.10". */
export function kitIdOf(doc, ref) {
  if (typeof doc?.kit === 'string' && typeof doc?.contract === 'string') return `${doc.kit} ${doc.contract}`
  return typeof doc?.kit === 'string' ? doc.kit : String(ref ?? '')
}
