;(() => {
  const script = document.currentScript
  let target = document.querySelector(script.dataset.target || '#tracy-widget')
  if (!target) {
    target = document.createElement('div')
    target.id = 'tracy-widget'
    if (script.parentElement?.tagName === 'HEAD') document.body.append(target)
    else script.insertAdjacentElement('afterend', target)
  }
  const origin = new URL(script.src).origin
  const frame = document.createElement('iframe')
  frame.src = origin + '/widget?embed=1'
  frame.allow = 'microphone; autoplay'
  frame.title = 'Tracy website assistant'
  frame.style = 'width:100%;height:740px;border:0;display:block'
  window.addEventListener('message', (event) => {
    if (
      event.origin !== origin ||
      event.source !== frame.contentWindow ||
      event.data?.type !== 'tracy:widget:size'
    )
      return
    if (event.data.conversation) {
      frame.style.height = '100dvh'
      return
    }
    const height = Number(event.data.height)
    if (Number.isFinite(height)) frame.style.height = Math.max(300, Math.min(2400, height)) + 'px'
  })
  target.append(frame)
})()
