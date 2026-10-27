window.__ModuleLoader__.load({
  id: '@goodandready/dsh-subscriptions',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')

    // Modular translator: shared by component subscriptions and helpers.
    let t = (key) => key
    const setT = (fn) => { t = fn }

    // A host refusal for a vendor outside allowedVendors reads from the dictionary.
    function hostErrorText(data, status) {
      const error = data && data.error
      if (error && error.code === 'vendor_not_allowed') return t('vendorNotAllowed')
      return (error && error.message) || ('HTTP ' + status)
    }

    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { hasError: false, error: null }
      }
      static getDerivedStateFromError(error) {
        return { hasError: true, error }
      }
      componentDidCatch(error, info) {
        try { console.error("[dsh-subscriptions UI error]", error, info) } catch { /* fallback if console fails */ }
      }
      render() {
        if (this.state.hasError) {
          return React.createElement(
            "div",
            { style: { padding: "12px", border: "1px solid var(--dsw-alias-state-error-primary)", borderRadius: "8px", background: "var(--dsw-alias-bg-layer-2)", margin: "8px 0", fontSize: "13px" } },
            React.createElement("div", { style: { fontWeight: 600, color: "var(--dsw-alias-state-error-primary)", marginBottom: "4px" } }, "Subscriptions UI error"),
            React.createElement("div", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: "12px", marginBottom: "8px" } }, String(this.state.error && this.state.error.message || this.state.error || "Unknown error")),
            React.createElement("button", {
              className: "dsub-mini",
              onClick: () => this.setState({ hasError: false, error: null })
            }, "Retry")
          )
        }
        return this.props.children
      }
    }


    const CSS =
    '.dsub-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;transition:border-color .16s,background .16s}' +
    '.dsub-card:hover{border-color:var(--dsw-alias-label-dimmed)}' +
    '.dsub-cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}' +
    '.dsub-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}' +
    '.dsub-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}' +
    '.dsub-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}' +
    '.dsub-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}' +
    '.dsub-description{color:var(--dsw-alias-label-secondary);font-size:13px}' +
    '.dsub-chev{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}' +
    '.dsub-chevOpen{transform:rotate(180deg)}' +
    '.dsub-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:12px}' +
    '.dsub-block{margin-top:10px}' +
    '.dsub-group{margin-top:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:0 14px}' +
    '.dsub-group[open]{padding-bottom:6px}' +
    '.dsub-groupHead{cursor:pointer;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);padding:10px 0;list-style:none}' +
    '.dsub-groupHead::-webkit-details-marker{display:none}' +
    '.dsub-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:8px}' +
    '.dsub-grow{flex:1 1 180px;min-width:140px}' +
    '.dsub-helpBox{margin-top:8px;padding:12px 14px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);font-size:12px;line-height:1.6}' +
    '.dsub-helpHead{display:flex;align-items:center;justify-content:space-between;font-weight:600;margin-bottom:8px;color:var(--dsw-alias-brand-primary)}' +
    '.dsub-helpStep{margin-bottom:6px;color:var(--dsw-alias-label-primary)}' +
    '.dsub-btnActive{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground);border-color:var(--dsw-alias-brand-primary)}' +
    '.dsub-h{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary)}' +
    '.dsub-sub{font-size:12px;color:var(--dsw-alias-label-secondary)}' +
    '.dsub-dim{font-size:11.5px;color:var(--dsw-alias-label-tertiary)}' +
    '.dsub-mini{appearance:none;font:inherit;font-size:12px;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:3px 8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);transition:all .15s}' +
    '.dsub-mini:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-label-dimmed)}' +
    '.dsub-ok{font-size:12px;color:var(--dsw-alias-state-success-primary)}' +
    '.dsub-bad{font-size:12px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;word-break:break-word;max-width:100%}' +
    '.dsub-hint{overflow-wrap:anywhere;word-break:break-word;max-width:100%}' +
    '.dsub-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 12px;font-size:12.5px;font-weight:500;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);transition:all .15s}' +
    '.dsub-btn:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-label-dimmed)}' +
    '.dsub-inp{height:30px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:6px;padding:0 8px;font-size:12px;min-width:180px}' +
    '.dsub-inp:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}' +
    '.dsub-box{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px;margin-top:8px;background:var(--dsw-alias-bg-layer-2)}' +
    '.dsub-cooldown{display:inline-block;padding:2px 6px;border-radius:4px;background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-bg-layer-1);font-size:11px;font-weight:600}' +
    '.dsub-bar{position:relative;height:6px;border-radius:3px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;flex:1;min-width:80px}' +
    '.dsub-barFill{height:100%;border-radius:3px;background:var(--dsw-alias-state-success-primary);transition:width .2s}' +
    '.dsub-barWarn .dsub-barFill{background:var(--dsw-alias-state-warn-primary)}' +
    '.dsub-barFull .dsub-barFill{background:var(--dsw-alias-state-error-primary)}' +
    '.dsub-barRow{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}' +
    '.dsub-manual{display:flex;flex-direction:column;gap:6px;margin-top:4px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2)}' +
    '.dsub-verify{font-size:12px;color:var(--dsw-alias-state-warn-primary)}' +
    '.dsub-verify a{color:var(--dsw-alias-brand-primary)}' +
    '.dsub-pill{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 1px 3px color-mix(in srgb, black 15%, transparent),inset 0 1px 0 color-mix(in srgb, white 6%, transparent);transition:all .16s ease;user-select:none}' +
    '.dsub-pill:hover{background:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-label-tertiary);transform:translateY(-1px);box-shadow:0 3px 8px color-mix(in srgb, black 25%, transparent),inset 0 1px 0 color-mix(in srgb, white 10%, transparent)}' +
    '.dsub-pill:active{transform:translateY(0)}' +
    '.dsub-pillTag{padding:1px 5px;border-radius:4px;font-size:10.5px;font-weight:700;letter-spacing:.02em;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}' +
    '.dsub-led{width:7px;height:7px;border-radius:50%;flex:none;transition:all .2s ease}' +
    '.dsub-ledOk{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 6px color-mix(in srgb,var(--dsw-alias-state-success-primary) 70%,transparent)}' +
    '.dsub-ledWarn{background:var(--dsw-alias-state-warn-primary);box-shadow:0 0 6px color-mix(in srgb,var(--dsw-alias-state-warn-primary) 70%,transparent)}' +
    '.dsub-ledBad{background:var(--dsw-alias-state-error-primary);box-shadow:0 0 6px color-mix(in srgb,var(--dsw-alias-state-error-primary) 70%,transparent)}' +
    '.dsub-ledOff{background:var(--dsw-alias-label-tertiary)}' +
    '.dsub-toast-container{position:fixed;top:16px;right:16px;z-index:10030;display:flex;flex-direction:column;gap:8px;pointer-events:none}' +'.dsub-toast{pointer-events:auto;min-width:280px;max-width:400px;padding:10px 14px;border-radius:10px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 8px 24px color-mix(in srgb,black 40%,transparent);display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;line-height:1.4;animation:dsubFadeIn .2s ease-out}' +'.dsub-toast-warn{border-color:var(--dsw-alias-state-warn-primary)}' +'.dsub-toast-bad{border-color:var(--dsw-alias-state-error-primary)}' +'.dsub-toast-ok{border-color:var(--dsw-alias-state-success-primary)}' +'.dsub-toast-close{background:none;border:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:14px;padding:0 2px}' +'.dsub-toast-close:hover{color:var(--dsw-alias-label-primary)}' +
    '.dsub-modalWrap{position:fixed;inset:0;z-index:10020;display:grid;place-items:center;background:color-mix(in srgb, black 65%, transparent);backdrop-filter:blur(10px);animation:dsubFadeIn .16s ease-out}' +
    '.dsub-modal{width:min(520px,94vw);max-height:min(85vh,720px);overflow-y:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);box-shadow:0 24px 64px color-mix(in srgb, black 60%, transparent),0 0 0 1px color-mix(in srgb, white 7%, transparent);padding:20px;animation:dsubScaleIn .18s cubic-bezier(.16,1,.3,1)}' +
    '@keyframes dsubFadeIn{from{opacity:0}to{opacity:1}}' +
    '@keyframes dsubScaleIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}' +
    '.dsub-modalHead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:14px;border-bottom:1px solid var(--dsw-alias-border-l2)}' +
    '.dsub-modalTitleWrap{display:flex;align-items:center;gap:10px}' +
    '.dsub-modalIcon{width:30px;height:30px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);display:grid;place-items:center;color:var(--dsw-alias-brand-primary);font-size:14px}' +
    '.dsub-modalBadge{font-size:11px;font-weight:600;padding:2px 7px;border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}' +
    '.dsub-heroCard{margin-top:14px;padding:14px 16px;border-radius:12px;background:linear-gradient(135deg,var(--dsw-alias-bg-layer-2) 0%,var(--dsw-alias-bg-layer-3) 100%);border:1px solid var(--dsw-alias-border-l1);box-shadow:inset 0 1px 0 color-mix(in srgb, white 5%, transparent)}' +
    '.dsub-heroHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}' +
    '.dsub-heroTitle{font-size:14px;font-weight:700;display:flex;align-items:center;gap:6px}' +
    '.dsub-heroModel{font-size:11.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,monospace}' +
    '.dsub-select{appearance:none;height:30px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:6px;padding:0 24px 0 8px;font-size:12px;cursor:pointer}' +
    '.dsub-details{margin-top:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 12px;background:var(--dsw-alias-bg-layer-2)}' +
    '.dsub-summary{cursor:pointer;font-weight:600;font-size:12.5px;color:var(--dsw-alias-label-secondary);user-select:none}' +
    '.dsub-summary:hover{color:var(--dsw-alias-label-primary)}' +
    '.dsub-header-bar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:8px 0 12px;margin-bottom:8px;border-bottom:1px solid var(--dsw-alias-border-l2)}' +
    '.dsub-badge{font-size:12px;padding:3px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);display:inline-flex;align-items:center;gap:5px;font-weight:500}' +
    '.dsub-badge-ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent)}' +
    '.dsub-badge-warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent)}' +
    '.dsub-badge-bad{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}' +
    '.dsub-badge-neutral{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}' +
    '.dsub-section-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;margin-top:12px}' +
    '.dsub-section-title{font-size:14.5px;font-weight:600;color:var(--dsw-alias-label-primary);display:flex;align-items:center;justify-content:space-between;gap:8px}' +
    '.dsub-section-desc{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:-4px;line-height:1.4}' +
    '.dsub-grid-2{display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:10px}' +
    '.dsub-stat-box{padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:3px}' +
    '.dsub-stat-val{font-size:16.5px;font-weight:700;color:var(--dsw-alias-label-primary)}' +
    '.dsub-stat-lbl{font-size:11.5px;color:var(--dsw-alias-label-secondary)}' +
    '.dsub-alert-ok{padding:8px 12px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent);color:var(--dsw-alias-state-success-primary);font-size:12.5px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-success-primary) 25%,transparent)}' +
    '.dsub-alert-bad{padding:8px 12px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary);font-size:12.5px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 25%,transparent)}' +
    '.dsub-btn-primary{background:var(--dsw-alias-label-primary) !important;color:var(--dsw-alias-bg-layer-3) !important;border-color:transparent !important;font-weight:600}' +
    '.dsub-btn-primary:hover:not(:disabled){opacity:0.9}' +
    '.dsub-model-grid{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}' +
    '.dsub-model-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:6px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);font-size:11.5px;color:var(--dsw-alias-label-primary)}' +
    '.dsub-model-chip code{font-family:ui-monospace,monospace;font-weight:600}' +
    '.dsub-model-tag{font-size:10px;padding:1px 4px;border-radius:3px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-weight:600}' +
    '.dsub-heroBars{display:flex;flex-direction:column;gap:8px;margin-top:10px}' +
    '.dsub-barLabelRow{display:flex;justify-content:space-between;font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-bottom:3px}' +
    '.dsub-barTrack{height:6px;border-radius:3px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}' +
    '.dsub-barFillGrad{height:100%;border-radius:3px;transition:width .3s ease}' +
    '.dsub-panel-box{margin-top:10px;padding:12px 14px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:8px}' +
    '.dsub-panel-warn{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 5%,transparent)}' +
    '.dsub-panel-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);display:flex;align-items:center;justify-content:space-between}' +
    '.dsub-panel-desc{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.4}' +
    '.dsub-usage-grid{display:flex;flex-direction:column;gap:8px;margin-top:4px}' +
    '.dsub-usage-card{display:flex;flex-direction:column;gap:5px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}' +
    '.dsub-usage-head{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary)}' +
    '.dsub-usage-track{width:100%;height:8px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);overflow:hidden}' +
    '.dsub-usage-fill{height:100%;border-radius:999px;transition:width .3s ease}' +
    '.dsub-usage-meta{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--dsw-alias-label-secondary)}' +
    '.dsub-tag-ok{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 30%,transparent);color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 8%,transparent);padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600;border-style:solid;border-width:1px}' +
    '.dsub-tag-warn{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 40%,transparent);color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 8%,transparent);padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600;border-style:solid;border-width:1px}' +
    '.dsub-tag-bad{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent);color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent);padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600;border-style:solid;border-width:1px}' +
    '.dsub-slot-meta-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2);font-size:12px}' +
    '.dsub-ref-tag{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}' +
    '.dsub-ref-tag code{padding:2px 6px;border-radius:4px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);font-family:ui-monospace,monospace;color:var(--dsw-alias-label-primary);font-size:11px}' +
    '.dsub-speed-tag{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent);padding:2px 8px;border-radius:6px;font-weight:500;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 20%,transparent)}' +
    '.dsub-btn-danger{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent)!important;color:var(--dsw-alias-state-error-primary)!important}' +
    '.dsub-btn-danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)!important}' +
    '.dsub-poolTitle{margin-top:16px;margin-bottom:8px;font-size:11.5px;font-weight:700;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.05em}' +
    '.dsub-accountCard{display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);margin-top:6px;transition:border-color .15s,background .15s}' +
    '.dsub-accountCard:hover{background:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-label-tertiary)}' +
    '.dsub-brandBadge{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;font-size:12px;font-weight:700;flex-shrink:0}' +
    '.dsub-brandCodex{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 15%,transparent);color:var(--dsw-alias-state-success-primary);border:1px solid color-mix(in srgb,var(--dsw-alias-state-success-primary) 30%,transparent)}' +
    '.dsub-brandClaude{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 15%,transparent);color:var(--dsw-alias-state-warn-primary);border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary) 30%,transparent)}' +
    '.dsub-brandGrok{background:color-mix(in srgb,var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)) 15%,transparent);color:var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)) 30%,transparent)}' +
    '.dsub-brandAgy{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 15%,transparent);color:var(--dsw-alias-brand-primary);border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent)}' +
    '.dsub-brandOllama{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 15%,transparent);color:var(--dsw-alias-label-secondary);border:1px solid color-mix(in srgb,var(--dsw-alias-label-tertiary) 30%,transparent)}' +
    '.dsub-brandKimi{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 15%,transparent);color:var(--dsw-alias-state-warn-primary);border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary) 30%,transparent)}' +
    '.dsub-brandGlm{background:color-mix(in srgb,var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)) 15%,transparent);color:var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)) 30%,transparent)}' +
    '.dsub-planBadge{display:inline-flex;align-items:center;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 15%,transparent);color:var(--dsw-alias-brand-primary);border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent);margin-left:6px}' +
    
    '.dsub-accInfo{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}' +
    '.dsub-accNameRow{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
    '.dsub-accName{font-size:13px;font-weight:600}' +
    '.dsub-accStatusTag{font-size:10.5px;font-weight:600;padding:1px 6px;border-radius:4px}' +
    '.dsub-statusOk{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 15%,transparent);color:var(--dsw-alias-state-success-primary)}' +
    '.dsub-statusWarn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 15%,transparent);color:var(--dsw-alias-state-warn-primary)}' +
    '.dsub-statusBad{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 15%,transparent);color:var(--dsw-alias-state-error-primary)}' +
    '.dsub-statusOff{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary)}' +
    '.dsub-modalFoot{display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2)}' +
    '.dsub-btnPrimary{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground);border:0;cursor:pointer;transition:opacity .15s}' +
    '.dsub-btnPrimary:hover{opacity:.9}' +
    '.dsub-btnSec{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:7px;font-size:11.5px;font-weight:500;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);cursor:pointer;text-decoration:none;transition:all .15s}' +
    '.dsub-btnSec:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-tertiary)}' +
    '.dsub-cq{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);padding:0 6px}' +
    '.dsub-cqBar{position:relative;width:40px;height:5px;border-radius:3px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}' +
    '.dsub-cqBarFill{height:100%;border-radius:3px;background:var(--dsw-alias-state-success-primary)}' +
    '.dsub-cqBarWarn .dsub-cqBarFill{background:var(--dsw-alias-state-warn-primary)}' +
    '.dsub-cqBarFull .dsub-cqBarFill{background:var(--dsw-alias-state-error-primary)}' +
    '.dsub-cqB{font-variant-numeric:tabular-nums;font-weight:600;color:var(--dsw-alias-label-primary)}' +
    '.dsub-diag{font:11px/1.5 ui-monospace,SFMono-Regular,monospace;max-height:260px;overflow:auto;white-space:pre-wrap;word-break:break-word;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}' +
    // Settings dialog entry (cardPlacement settings/both): match the dsh settings
    // sections (13px/22px text, 16px rhythm, settings card fill and stroke) and keep
    // focus to a 1px colour change. A 1px outline inset by 1px lands on the border of a
    // bordered control (so it reads as the border changing colour) and draws a
    // 1px line on a borderless one; outline also beats the !important border colours
    // of the primary and danger buttons. No glow rings.
    '.dsub-settings{display:flex;flex-direction:column;gap:16px;padding:8px 0;font-size:13px;line-height:22px;color:var(--dsw-alias-label-primary)}' +
    '.dsub-settings .dsub-body{border-top:0;margin:0;padding-bottom:0}' +
    '.dsub-settings .dsub-card,.dsub-settings .dsub-group{border:0.5px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l2));border-radius:var(--dsw-radius-xl,12px);background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-2))}' +
    '.dsub-settings .dsub-card{padding:12px 16px}' +
    '.dsub-settings :focus{outline:none;box-shadow:none}' +
    '.dsub-settings :focus-visible,.dsub-settings :is(input,select,textarea):focus{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:-1px;box-shadow:none}'

const cssId = 'dsh-subscriptions/settings.module.css'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="' + cssId + '"]')) {
      const tag = document.createElement('style')
      tag.textContent = CSS
      tag.setAttribute('data-plugin', 'dsh-subscriptions')
      tag.dataset.pluginCss = cssId
      tag.setAttribute('data-dsh-plugin', 'dsh-subscriptions')
      document.head.appendChild(tag)
    }

    // Card strings live in the locale registry: a separate package translates
    // them without touching this plugin's code. English is the default,
    // and the fallback when no translation exists.
    const NS = 'dsh-subscriptions'
    // Plugins page row seat (DSH 0.1.6-alpha.2): key = '<package name>#<row id>'.
    const PKG = '@goodandready/dsh-subscriptions'
    const ROW_ID = 'dsh-subscriptions'
    const ROW_CONFIG_KEY = PKG + '#' + ROW_ID
    
    // Provider help: titles are product names; every step is a dictionary key, rendered with the
    // translated labels of the buttons it names, so a step never disagrees with the button.
    const INSTRUCTIONS = {
      codex: { title: "OpenAI / ChatGPT Codex", steps: ["helpCodex1", "helpCodex2", "helpCodex3"], link: "https://chatgpt.com" },
      claude: { title: "Claude Code", steps: ["helpClaude1", "helpClaude2", "helpClaude3"], link: "https://console.anthropic.com/settings/keys" },
      cursor: { title: "Cursor IDE", steps: ["helpCursor1", "helpCursor2", "helpPasteSave"], link: "https://cursor.com/settings" },
      antigravity: { title: "Google Antigravity / Gemini", steps: ["helpAntigravity1", "helpAntigravity2", "helpAntigravity3"], note: "helpAntigravityNote", link: "https://antigravity.google" },
      kimi: { title: "Moonshot Kimi", steps: ["helpKimi1", "helpKimi2", "helpPasteSave", "helpKimiCli"], link: "https://platform.moonshot.cn/console/api-keys" },
      glm: { title: "Zhipu GLM (Z.AI)", steps: ["helpGlm1", "helpGlm2", "helpPasteSave", "helpGlmCli"], link: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys" },
      grok: { title: "xAI Grok", steps: ["helpGrok1", "helpGrok2", "helpGrok3"], link: "https://x.ai" },
      kiro: { title: "AWS Kiro", steps: ["helpKiro1", "helpKiro2"], link: "https://aws.amazon.com" },
      copilot: { title: "GitHub Copilot", steps: ["helpCopilot1", "helpCopilot2", "helpCopilot3", "helpCopilot4"], link: "https://github.com/login/device" },
    }

    const en = {
      "notConnected": "Not connected",
      "verifyAccount": "Verify account",
      "coolingDown": "Cooling down",
      "usageFull": "Usage 100%",
      "connected": "Connected",
      "title": "Subscriptions",
      "vendorNotAllowed": "This provider is not available here.",
      "cardIntro": "Subscription accounts, rotation and limits.",
      "show": "Show",
      "hide": "Hide",
      "intro": "Log in with a consumer subscription. Tokens stay on the host credentials store. The browser never reads them back. After Connect, if the provider lands on localhost or a vendor page, paste the redirected URL or the code here.",
      "useOrigin": "Use this Web UI origin as OAuth redirect_uri",
      "useOriginHint": "Leave off unless you registered your own OAuth client for this origin. Vendor CLI clients usually require their published redirect URI plus the paste step.",
      "closeModal": "Close",
      "groupAuth": "Sign-in and redirect",
      "groupPrivacy": "Privacy and model list",
      "groupRotation": "Rotation and limits",
      "groupProvider": "Provider behaviour",
      "groupFallback": "Local fallback",
      "privacyMask": "Mask emails and account identifiers",
      "privacyMaskHint": "For demos and screen sharing: emails show as j***n@example.com.",
      "autoLoopback": "Auto Loopback",
      "autoLoopbackHint": "Listen on local callback port to catch OAuth tokens automatically without manual copy-paste.",
      "hideDeprecated": "Hide deprecated models",
      "hideDeprecatedHint": "Hide older or superseded model variants from model dropdowns.",
      "composerQuota": "Composer quota indicator",
      "composerQuotaHint": "Display subscription usage indicator directly in the composer toolbar.",
      "composerQuotaOff": "Disabled",
      "composerQuotaPercent": "Percentage",
      "composerQuotaBar": "Progress Bar",
      "composerQuotaForecast": "Remaining Forecast",
      "expiryNotifyDays": "Expiry warning threshold (days)",
      "expiryNotifyDaysHint": "Notify when subscription renewal or token expiration is within this many days (0 to disable).",
      "codexFastMode": "Codex fast mode (1.5x)",
      "codexFastModeHint": "Enable high-throughput mode for OpenAI Codex models if supported by subscription.",
      "codexVerbosity": "Codex streaming verbosity",
      "codexVerbosityHint": "Control streaming chunking detail level from the Codex provider.",
      "codexVerbosityDefault": "Default",
      "codexVerbosityLow": "Low",
      "codexVerbosityMedium": "Medium",
      "codexVerbosityHigh": "High",
      "ollamaFallback": "Ollama local fallback",
      "ollamaFallbackHint": "Automatically route queries to a local Ollama instance when cloud quota is exhausted.",
      "ollamaBaseUrl": "Ollama Base URL",
      "ollamaFallbackModel": "Ollama Fallback Model",
      "advancedSettings": "Advanced Settings & Monitoring",
      "cooldownMs": "Failure cooldown (minutes)",
      "cooldownMsHint": "How long to pause a failing or rate-limited account before retrying.",
      "probeIntervalMin": "Health probe interval (minutes)",
      "probeIntervalMinHint": "Interval for background checks to refresh account status and quota balance.",
      "notifyLimits": "Notify on rate limits",
      "notifyLimitsHint": "Show notification alerts when account usage reaches quota ceiling.",
      "hostOnline": "Host online",
      "hostOffline": "Host unreachable",
      "statsTitle": "Session Telemetry",
      "statsRequests": "Successful / Total Requests",
      "statsLatency": "Avg Response Latency",
      "statsSuccessRate": "Session Success Rate",
      "statsLastActivity": "Last Activity",
      "smokeTitle": "Connection Smoke Test (Ping)",
      "smokeDesc": "Test live upstream connectivity and measure round-trip latency to the subscription provider.",
      "runSmoke": "⚡ Run Smoke Test (Ping)",
      "smokeTesting": "Pinging…",
      "smokeOk": "Smoke test passed",
      "smokeFail": "Smoke test failed",
      "modelsCatalogTitle": "Curated Subscription Models",
      "modelsCatalogDesc": "Available model catalog across active subscriptions in Tracy Cowork.",
      "resetCredits": "Reset credits",
      "resetCreditsHint": "ChatGPT reset cards: emergency reset for the 5-hour window. Requires a 5s confirmation.",
      "resetCreditsAction": "Reset ChatGPT Limit",
      "usageLimitsTitle": "Usage Limits",
      "slotDetailsTitle": "Slot Details",
      "resetAvailable": "Reset attempts available",
      "resetExpires": "earliest expires",
      "resetAck": "I understand one attempt will be consumed",
      "resetWait": "confirm enabled in",
      "resetReady": "ready",
      "resetGo": "Reset now",
      "resetBusy": "resetting…",
      "resetDone": "quota reset",
      "resetNothing": "server says nothing needs a reset (no attempt consumed)",
      "resetNoCredit": "no usable credit (not consumed)",
      "resetRedeemed": "already redeemed earlier",
      "diagGenerate": "Generate diagnostics report",
      "diagCopy": "Copy report",
      "diagIssues": "Open issue tracker",
      "diagHint": "The report has no tokens, emails, proxy addresses or personal data.",
      "cacheAnalyze": "Analyze Session Cache",
      "cacheHitRate": "Cache Hit Rate",
      "tokensSaved": "Saved Tokens",
      "subsPill": "SUBS",
      "subsModalTitle": "Subscription Hub",
      "subsActiveHero": "Active Subscription",
      "subsPoolTitle": "Provider Accounts",
      "subsRefresh": "Refresh",
      "subsOpenSettings": "All Settings →",
      "subsFastMode": "Fast Mode 1.5x",
      "subsHealthy": "Healthy",
      "subsFree": "free",
      "subsUsed": "used",
      "subsModalClose": "Close",
      "subsLogged": "connected",
      "subsNotLogged": "not connected",
      "subsCooldown": "cooldown",
      "hudTitle": "Subscription balance",
      "settingsLoading": "Loading settings…",
      "settingsUnavailable": "Settings are unavailable",
      "settingsRetry": "Retry",
      "hudHint": "drag · edge docks · click refresh",
      "fcCalibrating": "calibrating…",
      "fcIdle": "no usage",
      "fcHours": "h",
      "fcMinutes": "m",
      "reconnect": "Reconnect",
      "connect": "Connect",
      "missingClientIdAntigravity": "Google OAuth requires a custom Client ID. Please configure antigravityClientId in plugin settings below, or click '📥 From CLI' to import active credentials.",
      "disconnect": "Disconnect",
      "removeSlot": "Remove slot",
      "pastePlaceholder": "Paste redirected URL or code",
      "submitCode": "Submit code",
      "proxyPlaceholder": "Per-account proxy (http://, https://, socks5://) - optional",
      "proxyCheck": "Check proxy",
      "proxyOk": "proxy ok",
      "proxyFail": "proxy fail",
      "deviceLogin": "Device login",
      "deviceHint": "Headless: open the link, enter the code, keep this tab open.",
      "deviceCopy": "Copy code",
      "devicePending": "Waiting for confirmation",
      "deviceAuthorized": "Signed in",
      "deviceExpired": "Expired - start again",
      "verifyPrefix": "Google requires one-time account verification. ",
      "verifyLink": "Open verification link",
      "verifySuffix": " then reconnect.",
      "addAccount": "+ Add account",
      "save": "Save",
      "saved": "Saved",
      "loading": "Loading…",
      "unavailable": "Settings are unavailable",
      "accountLabel": "Account",
      "plan": "Plan",
      "storedAs": "Stored as",
      "switchLabel": "Provider",
      "chipActive": "Subscriptions",
      "expiryLabel": "expires",
      "slashLogin": "Login to a subscription provider",
      "slashLogout": "Log out a subscription provider",
      "slashStatus": "Subscription status",
      "none": "none",
      "forecast": "≈",
      "windowPrimary": "Primary window",
      "windowSecondary": "Secondary window",
      "resetLabel": "reset",
      "check": "Check",
      "checking": "Checking…",
      "importToken": "Save token",
      "importTokenPlace": "Paste token or API key",
      "importLocalCli": "📥 From CLI",
      "importLocalCliTitle": "Auto-import token from locally installed CLI on server",
      "importLocalSuccess": "Successfully imported token from local CLI!",
      "howToGetToken": "❓ Instructions",
      "howToGetTokenTitle": "How to get token / API key for this provider",
      "instructionsTitle": "How to obtain token",
      "close": "Close",
      "reconnectRequired": "Reconnect required",
      "manualTitle": "If the browser did not come back",
      "updateChecking": "Checking updates…",
      "updateUpToDate": "Up to date",
      "updateAvailable": "Update available",
      "updateNow": "Update",
      "updating": "Updating…",
      "updateSuccessRestart": "Update complete. Restarting service…",
      "updateFailed": "Update failed",
      "healthMatrix": "Health Matrix & Quota Runway",
      "healthAccount": "Account",
      "healthScore": "Health",
      "healthLatency": "Latency",
      "healthStatus": "Status",
      "healthQuota": "Quota / Runway",
      "healthQuarantine": "Quarantine",
      "healthWarmup": "Warmup",
      "healthActive": "Active",
      "healthIdle": "Idle",
      "speedMetricsHint": "Time to first token (TTFT) and token generation speed",
      "backupExport": "Export Backup",
      "backupImport": "Import Backup",
      "backupExportTitle": "Export Encrypted Backup",
      "backupImportTitle": "Import Encrypted Backup",
      "backupExportAction": "Export",
      "backupImportAction": "Import",
      "backupPassphrase": "Vault Passphrase (min 12 chars)",
      "backupExportHint": "Encrypt connected subscription accounts and slots with AES-256-GCM. ⚠️ Contains sensitive OAuth refresh tokens; use a strong password (min 12 chars).",
      "vaultTokenWarning": "⚠️ Contains sensitive OAuth refresh tokens",
      "backupImportHint": "Restore encrypted subscription accounts and credentials from a vault payload.",
      "backupPayloadPlaceholder": "Paste DSHE... encrypted string here",
      "backupExportOk": "Backup exported successfully",
      "backupImportOk": "Backup imported successfully",
      "backupDownload": "Download .enc",
      "quarantinePark": "Park",
      "quarantineParkTitle": "Park account in quarantine for 1 hour",
      "probeWarmupNow": "Probe Now",
      "probeWarmupTitle": "Run immediate warmup health probe",
      "releaseQuarantine": "Release",
      "releaseQuarantineTitle": "Release account from quarantine",
      "resetsIn": "Resets in",
      "toastQuarantined": "Account placed in quarantine",
      "toastReleased": "Account active and healthy",
      "toastQuotaWarning": "Quota threshold exceeded",
      "enableToasts": "In-app toast alerts",
      "field.enableToasts": "Show popup toast notifications on quarantine or quota events",
      "helpCodex1": "Sign in through the CLI on the server: run \"codex login\" in a terminal.",
      "helpCodex2": "Click \"{fromCli}\" to import ~/.codex/auth.json automatically.",
      "helpCodex3": "Or click \"{deviceLogin}\" above and enter the code at auth.openai.com.",
      "helpClaude1": "Run \"claude login\" in the server console.",
      "helpClaude2": "Click \"{fromCli}\": the plugin imports ~/.claude/credentials.json.",
      "helpClaude3": "Or paste your session token or API key from the Anthropic Console and click \"{saveToken}\".",
      "helpCursor1": "Automatic: if Cursor is used on the server, click \"{fromCli}\" (reads ~/.cursor/cli-config.json).",
      "helpCursor2": "Manual: open Cursor Settings (the \"{connect}\" button or the link below) and copy your session token or API key.",
      "helpAntigravity1": "Easiest: click \"{fromCli}\". The server already holds an active token in ~/.gemini/antigravity-cli/antigravity-oauth-token.",
      "helpAntigravity2": "Clicking \"{fromCli}\" loads fresh credentials at once.",
      "helpAntigravity3": "Manual: paste the session JSON or OAuth tokens and click \"{saveToken}\".",
      "helpAntigravityNote": "Note: the \"{connect}\" button needs a custom Google client_id in the plugin settings; use \"{fromCli}\" to sign in without one.",
      "helpKimi1": "Open the Moonshot developer console (the link below, or click \"{connect}\").",
      "helpKimi2": "Create and copy your API key (sk-...).",
      "helpKimiCli": "Or click \"{fromCli}\" if ~/.kimi-code is configured.",
      "helpGlm1": "Open the Zhipu BigModel API keys page (the link below, or click \"{connect}\").",
      "helpGlm2": "Copy your GLM API key.",
      "helpGlmCli": "Or click \"{fromCli}\" if the ZCode CLI is installed (~/.zcode).",
      "helpGrok1": "Run the grok CLI login on the server.",
      "helpGrok2": "Click \"{fromCli}\" (~/.grok/auth.json).",
      "helpGrok3": "Or paste your xAI API key and click \"{saveToken}\".",
      "helpKiro1": "Click \"{fromCli}\" to import ~/.kiro/credentials.json.",
      "helpKiro2": "Or paste KIRO_API_KEY and click \"{saveToken}\".",
      "helpCopilot1": "Click \"{deviceLogin}\" (or \"{connect}\") on the slot card.",
      "helpCopilot2": "A one-time code appears on the card.",
      "helpCopilot3": "Open https://github.com/login/device, enter the code and approve access for the GitHub account that holds the Copilot subscription.",
      "helpCopilot4": "The plugin captures the tokens and turns the Copilot models on.",
      "helpPasteSave": "Paste it into the input field and click \"{saveToken}\".",
      "helpGeneric": "Paste your token or API key into the field above and click \"{saveToken}\".",
      "helpOpenConsole": "Open provider console",
      "resetJustNow": "just now",
      "resetIn": "in {time}",
      "resetDays": "{n}d",
      "resetHours": "{n}h",
      "resetMinutes": "{n}m",
      "subsWindowNamed": "{label} window",
      "loginStatus": "Connected: {providers}",
      "loginStatusNone": "Connected: none"
};

    const zh = {
      "notConnected": "未连接",
      "verifyAccount": "需要验证账户",
      "coolingDown": "冷却等待中",
      "usageFull": "用量已达 100%",
      "connected": "已连接",
      "title": "个人订阅管理",
      "vendorNotAllowed": "此处不可使用该服务商。",
      "cardIntro": "AI 服务订阅账户、自动轮换与速率限制管理。",
      "show": "展开",
      "hide": "收起",
      "intro": "通过个人订阅登录。凭据安全保存在服务器端凭据库中，浏览器不回读敏感令牌。点击“连接”后，若页面跳转至 localhost 或服务商页面，请将重定向网址或授权代码粘贴到下方。",
      "useOrigin": "将当前 Web UI 地址作为 OAuth 重定向地址 (redirect_uri)",
      "useOriginHint": "除非您为当前域名申请了专属 OAuth 客户端，否则请保持关闭。官方 CLI 客户端通常需使用其公开重定向地址并配合粘贴代码流程。",
      "closeModal": "关闭",
      "groupAuth": "授权与重定向设置",
      "groupPrivacy": "隐私与模型展示",
      "groupRotation": "账户轮换与限制",
      "groupProvider": "服务商特性设置",
      "groupFallback": "本地兜底与容灾",
      "privacyMask": "脱敏隐藏邮箱与账户标识",
      "privacyMaskHint": "演示或录屏时自动将邮箱显示为 j***n@example.com。",
      "autoLoopback": "自动回环监听 (Auto Loopback)",
      "autoLoopbackHint": "在服务器本地回环端口监听以自动捕获 OAuth 令牌，无需手动复制粘贴。",
      "hideDeprecated": "隐藏已废弃的旧模型",
      "hideDeprecatedHint": "在模型下拉列表中隐藏早期或已被替代的旧版模型。",
      "composerQuota": "输入框额度指示器",
      "composerQuotaHint": "在聊天输入框工具栏直接显示当前订阅额度指示器。",
      "composerQuotaOff": "已禁用",
      "composerQuotaPercent": "百分比显示",
      "composerQuotaBar": "进度条显示",
      "composerQuotaForecast": "剩余耗尽预测",
      "expiryNotifyDays": "订阅到期预警阈值（天）",
      "expiryNotifyDaysHint": "当订阅续费或令牌将在指定天数内过期时弹出通知（设为 0 关闭）。",
      "codexFastMode": "Codex 快速高吞吐模式 (1.5x)",
      "codexFastModeHint": "对支持的 OpenAI Codex 订阅模型开启 1.5x 高速通道。",
      "codexVerbosity": "Codex 流式输出详细级别",
      "codexVerbosityHint": "调节 Codex 响应分块输出的详细程度。",
      "codexVerbosityDefault": "默认",
      "codexVerbosityLow": "低",
      "codexVerbosityMedium": "中",
      "codexVerbosityHigh": "高",
      "ollamaFallback": "Ollama 本地模型自动兜底",
      "ollamaFallbackHint": "当云端配额耗尽或服务商故障时，自动将请求转发给本地 Ollama 实例。",
      "ollamaBaseUrl": "Ollama 服务基础 URL",
      "ollamaFallbackModel": "Ollama 兜底模型名称",
      "advancedSettings": "高级配置与监控",
      "cooldownMs": "故障与限流冷却时间（分钟）",
      "cooldownMsHint": "当账户遇到 429 或故障时暂停该账户的分钟数。",
      "probeIntervalMin": "健康探测轮询间隔（分钟）",
      "probeIntervalMinHint": "后台探活及更新账户配额剩余额度的轮询间隔。",
      "notifyLimits": "配额耗尽时发送通知",
      "notifyLimitsHint": "当账户使用量达到上限时触发系统通知提醒。",
      "hostOnline": "主机在线",
      "hostOffline": "主机无法连接",
      "statsTitle": "会话遥测统计",
      "statsRequests": "成功 / 总请求数",
      "statsLatency": "平均响应延迟",
      "statsSuccessRate": "会话成功率",
      "statsLastActivity": "最近活跃时间",
      "smokeTitle": "链路连通性冒烟测试 (Ping)",
      "smokeDesc": "向当前订阅服务商发起实时探活并测量双向网络往返延迟 (RTT)。",
      "runSmoke": "⚡ 执行冒烟探活 (Ping)",
      "smokeTesting": "正在探活…",
      "smokeOk": "冒烟测试成功",
      "smokeFail": "冒烟测试失败",
      "modelsCatalogTitle": "精选订阅模型",
      "modelsCatalogDesc": "当前 Tracy Cowork 活跃订阅下可用模型一览。",
      "resetCredits": "重置 ChatGPT 额度",
      "resetCreditsHint": "ChatGPT 重置卡：紧急重置 5 小时额度窗口。扣除前需等待 5 秒倒计时确认。",
      "resetCreditsAction": "重置 ChatGPT 限制",
      "usageLimitsTitle": "用量限制",
      "slotDetailsTitle": "槽位详情",
      "resetAvailable": "可用重置次数",
      "resetExpires": "最早到期时间",
      "resetAck": "我确认将消耗一次重置机会",
      "resetWait": "确认倒计时",
      "resetReady": "可以重置",
      "resetGo": "立即重置额度",
      "resetBusy": "正在重置…",
      "resetDone": "配额已成功重置",
      "resetNothing": "服务端指示当前无需重置（未消耗机会）",
      "resetNoCredit": "无可用重置点数（未消耗机会）",
      "resetRedeemed": "该点数先前已兑换使用",
      "diagGenerate": "生成匿名诊断报告",
      "diagCopy": "复制报告",
      "diagIssues": "打开 Issue 反馈",
      "diagHint": "诊断报告不包含令牌、邮箱、代理地址或任何个人隐私数据。",
      "cacheAnalyze": "分析会话缓存",
      "cacheHitRate": "缓存命中率",
      "tokensSaved": "已节省 Token",
      "subsPill": "订阅",
      "subsModalTitle": "订阅管理中心",
      "subsActiveHero": "当前主用订阅",
      "subsPoolTitle": "服务商账户池",
      "subsRefresh": "刷新",
      "subsOpenSettings": "全部设置 →",
      "subsFastMode": "加速模式 1.5x",
      "subsHealthy": "健康运行中",
      "subsFree": "空闲可用",
      "subsUsed": "已用",
      "subsModalClose": "关闭",
      "subsLogged": "已连接",
      "subsNotLogged": "未连接",
      "subsCooldown": "冷却中",
      "hudTitle": "订阅额度余量",
      "settingsLoading": "正在加载设置…",
      "settingsUnavailable": "设置加载失败",
      "settingsRetry": "重试",
      "hudHint": "可拖拽 · 边缘停靠 · 点击刷新",
      "fcCalibrating": "校准中…",
      "fcIdle": "暂无消耗",
      "fcHours": "小时",
      "fcMinutes": "分",
      "reconnect": "重新连接",
      "connect": "连接",
      "missingClientIdAntigravity": "Google OAuth 需要自定义 Client ID。请在下方设置中配置 antigravityClientId，或点击‘📥 从 CLI 导入’直接导入本地会话。",
      "disconnect": "断开连接",
      "removeSlot": "移除槽位",
      "pastePlaceholder": "粘贴重定向 URL 或授权代码",
      "submitCode": "提交授权代码",
      "proxyPlaceholder": "单账户独立代理 (http://, https://, socks5://) - 可选",
      "proxyCheck": "测试代理",
      "proxyOk": "代理连接成功",
      "proxyFail": "代理连接失败",
      "deviceLogin": "设备码登录",
      "deviceHint": "无头模式：打开下方链接，输入设备码，并保持当前标签页开启。",
      "deviceCopy": "复制设备码",
      "devicePending": "等待授权确认中",
      "deviceAuthorized": "授权成功",
      "deviceExpired": "设备码已过期，请重试",
      "verifyPrefix": "Google 要求完成一次性账户验证。",
      "verifyLink": "打开验证链接",
      "verifySuffix": "，完成后点击重新连接。",
      "addAccount": "+ 添加账户",
      "save": "保存",
      "saved": "已保存",
      "loading": "加载中…",
      "unavailable": "设置不可用",
      "accountLabel": "账户",
      "plan": "套餐方案",
      "storedAs": "存储标识",
      "switchLabel": "切换服务商",
      "chipActive": "已启用订阅",
      "expiryLabel": "到期时间",
      "slashLogin": "登录订阅服务商",
      "slashLogout": "登出订阅服务商",
      "slashStatus": "查看订阅状态",
      "none": "无",
      "forecast": "≈",
      "windowPrimary": "主配额窗口",
      "windowSecondary": "次配额窗口",
      "resetLabel": "重置倒计时",
      "check": "检测",
      "checking": "检测中…",
      "importToken": "保存令牌",
      "importTokenPlace": "粘贴令牌或 API Key",
      "importLocalCli": "📥 从 CLI 导入",
      "importLocalCliTitle": "从服务器已安装的本地 CLI 自动读取并导入令牌",
      "importLocalSuccess": "已成功从本地 CLI 导入凭据！",
      "howToGetToken": "❓ 获取指引",
      "howToGetTokenTitle": "如何获取此服务商的令牌或 API 密钥",
      "instructionsTitle": "获取令牌指引",
      "close": "关闭",
      "reconnectRequired": "需要重新连接",
      "manualTitle": "若浏览器未能自动跳转回调",
      "updateChecking": "检查更新中…",
      "updateUpToDate": "已是最新版本",
      "updateAvailable": "有新版本可用",
      "updateNow": "立即更新",
      "updating": "正在更新…",
      "updateSuccessRestart": "更新成功，服务重启中…",
      "updateFailed": "更新失败",
      "healthMatrix": "健康矩阵与配额预测",
      "healthAccount": "账户",
      "healthScore": "健康度",
      "healthLatency": "延迟",
      "healthStatus": "状态",
      "healthQuota": "额度 / 余量",
      "healthQuarantine": "隔离期",
      "healthWarmup": "预热中",
      "healthActive": "活跃",
      "healthIdle": "空闲",
      "speedMetricsHint": "首字响应延迟 (TTFT) 与每秒生成速度 (Tokens/s)",
      "backupExport": "导出备份",
      "backupImport": "导入备份",
      "backupExportTitle": "导出加密备份",
      "backupImportTitle": "导入加密备份",
      "backupExportAction": "导出",
      "backupImportAction": "导入",
      "backupPassphrase": "凭据库密码（至少 12 位）",
      "backupExportHint": "使用 AES-256-GCM 安全加密导出所有订阅账户与配置。⚠️ 包含敏感的 OAuth 刷新令牌，请使用至少 12 位的强密码保护。",
      "vaultTokenWarning": "⚠️ 包含敏感的 OAuth 刷新令牌",
      "backupImportHint": "从已加密的备份内容中导入并恢复订阅账户与凭据。",
      "backupPayloadPlaceholder": "在此粘贴 DSHE... 加密内容",
      "backupExportOk": "备份导出成功",
      "backupImportOk": "备份导入成功",
      "backupDownload": "下载 .enc 文件",
      "quarantinePark": "隔离",
      "quarantineParkTitle": "将账户临时隔离 1 小时",
      "probeWarmupNow": "立即探测",
      "probeWarmupTitle": "立即执行健康预热探测",
      "releaseQuarantine": "解除隔离",
      "releaseQuarantineTitle": "立即解除账户隔离状态",
      "resetsIn": "重置倒计时",
      "toastQuarantined": "账户进入隔离期",
      "toastReleased": "账户已解除隔离恢复使用",
      "toastQuotaWarning": "额度预警",
      "enableToasts": "应用内弹窗提醒",
      "field.enableToasts": "当账户发生隔离或额度达到警戒线时显示即时弹窗提醒",
      "helpCodex1": "在服务器上通过 CLI 登录：在终端运行“codex login”。",
      "helpCodex2": "点击“{fromCli}”自动导入 ~/.codex/auth.json。",
      "helpCodex3": "或者点击上方的“{deviceLogin}”，并在 auth.openai.com 输入代码。",
      "helpClaude1": "在服务器控制台运行“claude login”。",
      "helpClaude2": "点击“{fromCli}”：插件会导入 ~/.claude/credentials.json。",
      "helpClaude3": "或者从 Anthropic 控制台复制你的会话令牌或 API Key，然后点击“{saveToken}”。",
      "helpCursor1": "自动导入：若服务器上使用 Cursor，点击“{fromCli}”（读取 ~/.cursor/cli-config.json）。",
      "helpCursor2": "手动导入：打开 Cursor 设置（“{connect}”按钮或下方链接），复制你的会话令牌或 API 密钥。",
      "helpAntigravity1": "推荐方式：点击“{fromCli}”。服务器已在 ~/.gemini/antigravity-cli/antigravity-oauth-token 中保存了有效令牌。",
      "helpAntigravity2": "点击“{fromCli}”可立即加载最新凭据。",
      "helpAntigravity3": "手动输入：粘贴会话 JSON 或 OAuth 令牌，然后点击“{saveToken}”。",
      "helpAntigravityNote": "注：“{connect}”按钮需要在插件设置中配置自定义 Google client_id；不配置时请使用“{fromCli}”登录。",
      "helpKimi1": "打开 Moonshot 开发者控制台（下方链接，或点击“{connect}”）。",
      "helpKimi2": "创建并复制你的 API 密钥（sk-...）。",
      "helpKimiCli": "如果已配置 ~/.kimi-code，也可以点击“{fromCli}”。",
      "helpGlm1": "打开智谱 BigModel API 密钥页面（下方链接，或点击“{connect}”）。",
      "helpGlm2": "复制你的 GLM API 密钥。",
      "helpGlmCli": "若已安装 ZCode CLI（~/.zcode），也可以点击“{fromCli}”。",
      "helpGrok1": "在服务器上运行 grok CLI 登录。",
      "helpGrok2": "点击“{fromCli}”（~/.grok/auth.json）。",
      "helpGrok3": "或者粘贴你的 xAI API 密钥，然后点击“{saveToken}”。",
      "helpKiro1": "点击“{fromCli}”从 ~/.kiro/credentials.json 导入。",
      "helpKiro2": "或者粘贴 KIRO_API_KEY，然后点击“{saveToken}”。",
      "helpCopilot1": "点击卡片上的“{deviceLogin}”（或“{connect}”）。",
      "helpCopilot2": "界面将展示一次性设备授权码。",
      "helpCopilot3": "在浏览器打开 https://github.com/login/device 输入代码，并为拥有 Copilot 订阅的 GitHub 账户授权。",
      "helpCopilot4": "授权成功后，插件会自动捕获会话并激活 GitHub Copilot 模型。",
      "helpPasteSave": "将其粘贴到输入框中，然后点击“{saveToken}”。",
      "helpGeneric": "请在上方输入框中粘贴令牌或 API Key，然后点击“{saveToken}”。",
      "helpOpenConsole": "打开服务商控制台",
      "resetJustNow": "刚刚",
      "resetIn": "{time}后",
      "resetDays": "{n}天",
      "resetHours": "{n}小时",
      "resetMinutes": "{n}分",
      "subsWindowNamed": "{label} 窗口",
      "loginStatus": "已连接：{providers}",
      "loginStatusNone": "已连接：无"
};
    // #51: live countdown to the quota window reset (account.quota.resetAt).
                function cleanErrorMessage(raw) {
      if (!raw) return ''
      var text = typeof raw === 'string' ? raw : (raw.message || String(raw))
      text = text.trim()
      if (text.charAt(0) === '{' && text.charAt(text.length - 1) === '}') {
        try {
          var parsed = JSON.parse(text)
          if (parsed.error && parsed.error.message) text = parsed.error.message
          else if (parsed.message) text = parsed.message
          else if (parsed.code) text = parsed.code
        } catch { /* ignore parse error */ }
      }
      var firstLine = text.split('\n')[0].trim()
      if (firstLine.length > 160) return firstLine.slice(0, 157) + '...'
      return firstLine
    }

    function normalizePlanBadge(provider, plan) {
      if (!plan && provider !== 'kimi' && provider !== 'glm') return null
      var p = String(plan || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      var label = plan
      if (provider === 'codex') {
        if (p.indexOf('pro20') >= 0 || p === 'pro') label = 'Pro 20x'
        else if (p.indexOf('pro5') >= 0 || p.indexOf('prolite') >= 0) label = 'Pro 5x'
        else if (p.indexOf('team') >= 0) label = 'Team'
        else if (p.indexOf('plus') >= 0) label = 'Plus'
        else if (p.indexOf('enterp') >= 0) label = 'Enterprise'
      } else if (provider === 'grok') {
        if (p.indexOf('super') >= 0) label = 'SuperGrok'
        else if (p.indexOf('plus') >= 0) label = 'X Premium+'
        else if (p.indexOf('premium') >= 0) label = 'X Premium'
      } else if (provider === 'antigravity') {
        if (p.indexOf('ultra') >= 0) label = 'Ultra'
        else if (p.indexOf('pro') >= 0) label = 'Pro'
      } else if (provider === 'kimi') {
        label = 'Coding Plan'
      } else if (provider === 'glm') {
        label = '150% Boost'
      }
      return label ? React.createElement('span', { className: 'dsub-planBadge' }, label) : null
    }

    // Time until a quota window resets, in the interface language ("in 2h 15m").
    function formatRelativeReset(resetAt, tr, now) {
      if (!resetAt || !Number.isFinite(resetAt) || resetAt <= 0) return ''
      var delta = resetAt - (now || Date.now())
      if (delta <= 0) return tr('resetJustNow')
      var totalMinutes = Math.max(1, Math.round(delta / 60000))
      var days = Math.floor(totalMinutes / 1440)
      var hours = Math.floor((totalMinutes % 1440) / 60)
      var minutes = totalMinutes % 60
      var bits = []
      if (days) bits.push(tr('resetDays', { n: days }))
      if (hours) bits.push(tr('resetHours', { n: hours }))
      if (minutes || !bits.length) bits.push(tr('resetMinutes', { n: minutes }))
      return tr('resetIn', { time: bits.join(' ') })
    }

    function ResetCountdown(props) {
      const [now, setNow] = React.useState(Date.now())
      React.useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
      }, [])
      const ms = (props.resetAt || 0) - now
      if (ms <= 0) return null
      const total = Math.floor(ms / 1000)
      if (total > 3600) {
        return React.createElement('span', { className: 'dsub-sub', style: { fontVariantNumeric: 'tabular-nums' } },
          t('resetLabel') + ' ' + formatRelativeReset(props.resetAt, t, now))
      }
      const m = Math.floor(total / 60)
      const sec = total % 60
      const pad = (n) => String(n).padStart(2, '0')
      return React.createElement('span', { className: 'dsub-sub', style: { fontVariantNumeric: 'tabular-nums' } },
        t('resetLabel') + ' ' + pad(m) + ':' + pad(sec))
    }

    function badgeFor(account, t) {
      if (!account || !account.configured) return t('notConnected')
      if (account.validationUrl) return t('verifyAccount')
      // Issue 303: a quarantined account says why it is parked.
      if (account.quarantineReason && account.quarantineUntil && account.quarantineUntil > Date.now()) {
        return account.quarantineReason === 'VERIFY' ? t('verifyAccount') : String(account.quarantineReason)
      }
      if (account.cooldownUntil && account.cooldownUntil > Date.now()) return t('coolingDown')
      if (account.usagePercent != null && account.usagePercent >= 100) return t('usageFull')
      return t('connected')
    }

    // The card in the Plugins tab draws its own header and collapse toggle:
    // the core only provides the list frame.
        // Core chevron icon. Without a guarded require, a missing IconChevronDownOutline14 could take down the whole client half.
    let ChevronIcon = null
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
      ChevronIcon = primitives && primitives.IconChevronDownOutline14
    } catch {
      ChevronIcon = null
    }
    function FallbackChevron(props) {
      return React.createElement('svg', { className: props.className, width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none' },
        React.createElement('path', { d: 'M3.5 5.25L7 8.75l3.5-3.5', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      )
    }
    const Chevron = ChevronIcon || FallbackChevron



    function SubsSection(props) {
      // The translator comes from the slot because its registration declares locale.
      const t = (props && props.t) || ((key) => key)
      const [draft, setDraft] = React.useState(null)
      const [accounts, setAccounts] = React.useState([])
      const [providers, setProviders] = React.useState(null)
      const [paste, setPaste] = React.useState({})
      const [device, setDevice] = React.useState({})  // #90 key -> {state,userCode,authUrl,intervalMs,status}
      const [proxyRes, setProxyRes] = React.useState({})  // #88 key -> {ok,latencyMs,error}
      const [diag, setDiag] = React.useState('')
      const [sessionAnalysis, setSessionAnalysis] = React.useState(null)
      const [analyzingCache, setAnalyzingCache] = React.useState(false)
      const [reset, setReset] = React.useState({})  // #85 key -> challenge state
      const [, setResetTick] = React.useState(0)
      React.useEffect(() => {
        const anyPending = Object.values(reset).some((r) => r && r.phase === 'confirm' && !r.result)
        if (!anyPending) return undefined
        const id = setInterval(() => setResetTick((n) => n + 1), 1000)
        return () => clearInterval(id)
      }, [reset])

      // #85: reset credits challenge flow (prepare -> 5s cooldown + ack -> consume).
      const resetPrepare = async (provider, index, key) => {
        setReset((m) => Object.assign({}, m, { [key]: { phase: 'loading' } }))
        try {
          const res = await fetch('/dsh-subscriptions/reset-credits/prepare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, index }),
          })
          const d = await res.json()
          if (!d || !d.ok) throw new Error((d && d.error && d.error.message) || 'prepare failed')
          setReset((m) => Object.assign({}, m, { [key]: {
            phase: 'confirm',
            challengeId: d.challengeId,
            availableCount: d.availableCount,
            readyAt: d.readyAt,
            expiresAt: d.expiresAt,
            creditExpiresAt: d.creditExpiresAt || null,
          } }))
        } catch (e) {
          setReset((m) => Object.assign({}, m, { [key]: { phase: 'idle', error: String(e && e.message || e) } }))
        }
      }
      const resetConsume = async (key) => {
        const st = reset[key]
        if (!st || st.phase !== 'confirm' || !st.ack || Date.now() < st.readyAt || st.busy) return
        setReset((m) => Object.assign({}, m, { [key]: Object.assign({}, st, { busy: true }) }))
        try {
          const res = await fetch('/dsh-subscriptions/reset-credits/consume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ challengeId: st.challengeId, acknowledged: true }),
          })
          const d = await res.json()
          if (!d || !d.ok) throw new Error((d && d.error && d.error.message) || 'consume failed')
          const code = d.result && d.result.code
          setReset((m) => Object.assign({}, m, { [key]: Object.assign({}, st, { busy: false, result: code, windowsReset: (d.result && d.result.windowsReset) || [] }) }))
          reload().catch(() => {})
        } catch (e) {
          setReset((m) => Object.assign({}, m, { [key]: Object.assign({}, st, { busy: false, error: String(e && e.message || e) }) }))
        }
      }
      // #99: one click - fetch the anonymized report and copy it to the clipboard.
      const runAnalyzeSession = () => {
        setAnalyzingCache(true)
        fetch('/dsh-subscriptions/history?limit=50', { cache: 'no-store' })
          .then((r) => r.json())
          .then((h) => {
            const items = (h && h.items) || []
            const events = items.map((it) => ({
              usage: {
                inputTokens: it.inputTokens ?? it.promptTokens ?? (it.tokens && it.tokens.prompt) ?? 0,
                cacheReadTokens: it.cacheReadTokens ?? it.cachedTokens ?? (it.tokens && it.tokens.cached) ?? 0,
                outputTokens: it.outputTokens ?? it.completionTokens ?? (it.tokens && it.tokens.completion) ?? 0,
                promptTokens: it.inputTokens ?? it.promptTokens ?? (it.tokens && it.tokens.prompt) ?? 0,
                cachedTokens: it.cacheReadTokens ?? it.cachedTokens ?? (it.tokens && it.tokens.cached) ?? 0,
                completionTokens: it.outputTokens ?? it.completionTokens ?? (it.tokens && it.tokens.completion) ?? 0,
              },
            }))
            return fetch('/dsh-subscriptions/analyze-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ events }),
            })
          })
          .then((r) => r.json())
          .then((d) => {
            setAnalyzingCache(false)
            if (d && d.ok && d.analysis) {
              setSessionAnalysis(d.analysis)
            }
          })
          .catch((e) => {
            setAnalyzingCache(false)
            setErr(cleanErrorMessage(e && e.message || e))
          })
      }
      const genDiag = () => {
        fetch('/dsh-subscriptions/diagnostics', { cache: 'no-store' })
          .then((r) => r.json())
          .then((d) => {
            const txt = d && d.ok ? JSON.stringify(d.report, null, 2) : ('error: ' + ((d && d.error && d.error.message) || 'unknown'))
            setDiag(txt)
            try { navigator.clipboard.writeText(txt) } catch { /* clipboard write disallowed */ }
          })
          .catch((e) => setDiag('error: ' + String(e && e.message || e)))
      }
      const [checkRes, setCheckRes] = React.useState({})
      const [hostPing, setHostPing] = React.useState({ ok: true, latencyMs: null })
      const [telemetry, setTelemetry] = React.useState(null)
      const [smoke, setSmoke] = React.useState({ testing: false, result: null })
      const [updater, setUpdater] = React.useState({ checking: false, updating: false, status: null, message: '' })
      const [backupModal, setBackupModal] = React.useState(null)
      const [backupPass, setBackupPass] = React.useState('')
      const [backupData, setBackupData] = React.useState('')
      const [backupErr, setBackupErr] = React.useState('')
      const [backupInfo, setBackupInfo] = React.useState('')
      const [backupLoading, setBackupLoading] = React.useState(false)

      const doExportBackup = async () => {
        setBackupErr(''); setBackupInfo(''); setBackupLoading(true)
        try {
          const res = await fetch('/dsh-subscriptions/export-backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passphrase: backupPass, algorithm: 'pbkdf2' }),
          })
          const d = await res.json().catch(() => ({}))
          if (!res.ok || !d.ok) throw new Error((d.error && d.error.message) || ('HTTP ' + res.status))
          setBackupData(d.vault)
          setBackupInfo(t('backupExportOk') + ' (' + d.slotCount + ' slots)')
        } catch (e) {
          setBackupErr(cleanErrorMessage(e.message || e))
        }
        setBackupLoading(false)
      }

      const doImportBackup = async () => {
        setBackupErr(''); setBackupInfo(''); setBackupLoading(true)
        try {
          const res = await fetch('/dsh-subscriptions/import-backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passphrase: backupPass, vault: backupData.trim() }),
          })
          const d = await res.json().catch(() => ({}))
          if (!res.ok || !d.ok) throw new Error((d.error && d.error.message) || ('HTTP ' + res.status))
          setBackupInfo(t('backupImportOk') + ' (' + d.slotCount + ' slots)')
          if (d.accounts) setAccounts(d.accounts)
          await reload()
        } catch (e) {
          setBackupErr(cleanErrorMessage(e.message || e))
        }
        setBackupLoading(false)
      }

      const downloadBackupFile = () => {
        if (!backupData) return
        try {
          const blob = new window.Blob([backupData], { type: 'text/plain;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'dsh-subscriptions-backup.enc'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        } catch { /* ignore */ }
      }

      const checkUpdater = () => {
        setUpdater((u) => Object.assign({}, u, { checking: true, message: '' }))
        return fetch('/dsh-subscriptions/update', { cache: 'no-store' })
          .then((res) => res.json())
          .then((data) => {
            setUpdater((u) => Object.assign({}, u, { checking: false, status: data }))
            return data
          })
          .catch((e) => {
            setUpdater((u) => Object.assign({}, u, { checking: false, message: cleanErrorMessage(e.message || e) }))
          })
      }

      const performUpdate = async () => {
        setUpdater((u) => Object.assign({}, u, { updating: true, message: '' }))
        try {
          const res = await fetch('/dsh-subscriptions/update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-dsh-plugin-update': '1',
            },
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || !data.ok) {
            throw new Error((data && data.error && (data.error.message || data.error.code)) || ('HTTP ' + res.status))
          }
          setUpdater((u) => Object.assign({}, u, { updating: false, message: t('updateSuccessRestart') }))
          setTimeout(() => {
            window.location.reload()
          }, 3500)
        } catch (e) {
          setUpdater((u) => Object.assign({}, u, { updating: false, message: (t('updateFailed') + ': ' + cleanErrorMessage(e.message || e)) }))
        }
      }

      const reloadTelemetry = () => {
        fetch('/dsh-subscriptions/telemetry', { cache: 'no-store' })
          .then((r) => r.json())
          .then((d) => { if (d && d.ok && d.telemetry) setTelemetry(d.telemetry) })
          .catch(() => {})
      }

      const runSmokeTest = async (provider, index) => {
        setSmoke({ testing: true, result: null })
        try {
          const res = await fetch('/dsh-subscriptions/smoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, index }),
          })
          const d = await res.json()
          setSmoke({ testing: false, result: d })
          reloadTelemetry()
        } catch (e) {
          setSmoke({ testing: false, result: { ok: false, error: { message: String(e && e.message || e) } } })
        }
      }
      const [checking, setChecking] = React.useState({})
      const [saved, setSaved] = React.useState(false)
      const [tokenDraft, setTokenDraft] = React.useState({})
      const [openHelp, setOpenHelp] = React.useState({})
      const [err, setErr] = React.useState('')
      const [info, setInfo] = React.useState('')
      const [revision, setRevision] = React.useState(null)

      const applyPayload = (data) => {
        if (data && data.revision != null) setRevision(data.revision)
        setDraft(JSON.parse(JSON.stringify((data && data.config) || {})))
        setAccounts((data && data.accounts) || [])
        setProviders((data && Array.isArray(data.providers)) ? data.providers : null)
      }

      const reload = () => {
        const t0 = Date.now()
        return fetch('/dsh-subscriptions/config', { cache: 'no-store' })
          .then((res) => res.json())
          .then((data) => {
            setHostPing({ ok: true, latencyMs: Date.now() - t0 })
            applyPayload(data)
            reloadTelemetry()
            return data
          })
          .catch((err) => {
            setHostPing({ ok: false, latencyMs: null })
            throw err
          })
      }

      React.useEffect(() => {
        let alive = true
        reload().catch((e) => { if (alive) setErr(String(e && e.message ? e.message : e)) })
        checkUpdater().catch(() => {})
        return () => { alive = false }
      }, [])

      // #90: poll device login while any slot is in 'pending' state.
      React.useEffect(() => {
        const pendingKeys = Object.entries(device).filter(([, d]) => d && d.status === 'pending')
        if (!pendingKeys.length) return
        const timers = pendingKeys.map(([key, d]) => setInterval(() => {
          devicePollOnce(key.split(':')[0], Number(key.split(':')[1]))
        }, d.intervalMs || 5000))
        return () => timers.forEach(clearInterval)
      })

      // #81: settings snapshot status - never render phantom inputs before the
      // config snapshot arrives, and offer a retry when the store is unavailable.
      if (!draft) {
        return React.createElement('div', { className: 'dsub-wrap' },
          React.createElement('div', { className: 'dsub-row' },
            React.createElement('span', { className: 'dsub-sub' }, err ? t('settingsUnavailable') : t('settingsLoading')),
            err ? React.createElement('button', {
              type: 'button', className: 'dsub-mini',
              onClick: () => { setErr(''); reload().catch((e) => setErr(String(e && e.message || e))) },
            }, t('settingsRetry')) : null,
          ),
          err ? React.createElement('div', { className: 'dsub-bad' }, err) : null,
        )
      }

      const slots = Array.isArray(draft.slots) ? draft.slots : []
      const setSlots = (next) => setDraft((d) => Object.assign({}, d, { slots: next }))
      const accountOf = (provider, index) => accounts.find((a) => a.provider === provider && a.index === index) || {}

      const save = async () => {
        setErr(''); setSaved(false)
        const payload = revision != null ? Object.assign({}, draft, { revision }) : draft
        const res = await fetch('/dsh-subscriptions/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (res.status === 409) {
            reload().catch(() => {})
            throw new Error((data.error && data.error.message) || 'Configuration modified concurrently; reloaded.')
          }
          throw new Error(hostErrorText(data, res.status))
        }
        applyPayload(data)
        setSaved(true); setTimeout(() => setSaved(false), 2000)
      }

      const connect = async (provider, index) => {
        setErr('')
        if (provider === 'copilot') {
          return deviceStartLogin(provider, index).catch((e) => setErr(cleanErrorMessage(e.message || e)))
        }
        if (provider === 'antigravity' && (!draft || !draft.antigravityClientId || !String(draft.antigravityClientId).trim())) {
          setErr(t('missingClientIdAntigravity'))
          return
        }
        const res = await fetch('/dsh-subscriptions/oauth/start?provider=' + encodeURIComponent(provider) + '&index=' + encodeURIComponent(index), { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(hostErrorText(data, res.status))
        if (data.url) window.open(data.url, '_blank', 'noopener')
      }

      // #90: device-code login (headless). Server mints user_code; we show it,
      // open the verification page, and poll until authorized.
      const deviceStartLogin = async (provider, index) => {
        const key = provider + ':' + index
        setErr('')
        const res = await fetch('/dsh-subscriptions/oauth/device/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, index }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(hostErrorText(data, res.status))
        setDevice((m) => Object.assign({}, m, { [key]: { state: data.state, userCode: data.userCode, authUrl: data.authUrl, intervalMs: data.intervalMs || 5000, status: 'pending' } }))
      }

      const devicePollOnce = async (provider, index) => {
        const key = provider + ':' + index
        const d = device[key]
        if (!d || !d.state) return
        const res = await fetch('/dsh-subscriptions/oauth/device/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: d.state }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setDevice((m) => Object.assign({}, m, { [key]: Object.assign({}, d, { status: 'expired' }) }))
          return
        }
        if (data.status === 'authorized') {
          setDevice((m) => Object.assign({}, m, { [key]: Object.assign({}, d, { status: 'authorized' }) }))
          reload().catch(() => {})
          return
        }
        if (data.status === 'expired') {
          setDevice((m) => Object.assign({}, m, { [key]: Object.assign({}, d, { status: 'expired' }) }))
        }
      }

      const complete = async (provider, index) => {
        setErr('')
        const key = provider + ':' + index
        const url = paste[key] || ''
        const res = await fetch('/dsh-subscriptions/oauth/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: provider, index: index, url: url }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(hostErrorText(data, res.status))
        setAccounts(data.accounts || [])
        setPaste((p) => Object.assign({}, p, { [key]: '' }))
      }

      // #88: probe the account proxy with a real request and measure latency.
      const doProxyCheck = async (provider, index) => {
        const key = provider + ':' + index
        setChecking((c) => Object.assign({}, c, { ['proxy:' + key]: true }))
        setErr('')
        try {
          const res = await fetch('/dsh-subscriptions/proxy-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, index }),
          })
          const data = await res.json().catch(() => ({}))
          setProxyRes((m) => Object.assign({}, m, { [key]: data }))
        } catch (e) { setErr(cleanErrorMessage(e.message || e)) }
        setChecking((c) => Object.assign({}, c, { ['proxy:' + key]: false }))
      }



      const doParkQuarantine = async (provider, index, durationMs) => {
        setErr("")
        try {
          const res = await fetch("/dsh-subscriptions/quarantine/park", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider, index, durationMs: durationMs || 3600000, reason: "MANUAL_PARK" }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error((data.error && data.error.message) || ("HTTP " + res.status))
          setAccounts(data.accounts || [])
          setInfo(t("toastQuarantined"))
          setTimeout(() => setInfo(""), 3000)
        } catch (e) { setErr(cleanErrorMessage(e.message || e)) }
      }

      const doProbeQuarantine = async (provider, index, releaseOnly) => {
        setErr("")
        const key = provider + ":" + index
        setChecking((c) => Object.assign({}, c, { [key]: true }))
        try {
          const res = await fetch("/dsh-subscriptions/quarantine/probe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider, index, release: Boolean(releaseOnly) }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error((data.error && data.error.message) || ("HTTP " + res.status))
          setAccounts(data.accounts || [])
          if (data.success || data.released) {
            setInfo(t("toastReleased"))
            setTimeout(() => setInfo(""), 3000)
          } else if (data.error) {
            setErr(cleanErrorMessage(data.error))
          }
        } catch (e) { setErr(cleanErrorMessage(e.message || e)) }
        setChecking((c) => Object.assign({}, c, { [key]: false }))
      }

      const doCheck = async (provider, index) => {
        const key = provider + ':' + index
        setChecking((c) => Object.assign({}, c, { [key]: true }))
        setErr('')
        try {
          const res = await fetch('/dsh-subscriptions/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, index }),
          })
          const data = await res.json().catch(() => ({}))
          setCheckRes((m) => Object.assign({}, m, { [key]: data }))
          if (data && data.quota) {
            setAccounts((prev) => prev.map((a) => a.provider===provider && a.index===index ? Object.assign({}, a, { quota: data.quota }) : a))
          }
        } catch (e) { setErr(cleanErrorMessage(e.message || e)) }
        setChecking((c) => Object.assign({}, c, { [key]: false }))
      }

      const logout = async (provider, index) => {
        setErr('')
        const res = await fetch('/dsh-subscriptions/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: provider, index: index }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(hostErrorText(data, res.status))
        setAccounts(data.accounts || [])
      }

            const importLocalCli = async (provider, index) => {
        setErr('')
        setInfo('')
        const res = await fetch('/dsh-subscriptions/import-local', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, index }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(hostErrorText(data, res.status))
        if (data.config) applyPayload(data)
        else await reload()
        setInfo(t('importLocalSuccess'))
        setTimeout(() => setInfo(''), 3000)
      }

      const importToken = async (provider, index) => {
        setErr('')
        const tok = (tokenDraft[provider + ':' + index] || '').trim()
        if (!tok) return
        const res = await fetch('/dsh-subscriptions/import-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, index, refreshToken: tok }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(hostErrorText(data, res.status))
        setAccounts(data.accounts || [])
        setTokenDraft((d) => Object.assign({}, d, { [provider + ':' + index]: '' }))
      }

      const addSlot = (provider) => {
        const used = slots.filter((s) => s.provider === provider).map((s) => s.index)
        let index = 1
        while (used.indexOf(index) >= 0) index++
        setSlots(slots.concat([{ provider: provider, index: index, label: '' }]))
      }

      // The host lists only the vendors it allows (allowedVendors), so an empty list
      // means none: the built-in four are only for a host too old to send the list.
      const names = providers || [
        { id: 'codex', name: 'ChatGPT Codex' },
        { id: 'claude', name: 'Claude' },
        { id: 'grok', name: 'Grok' },
        { id: 'antigravity', name: 'Antigravity' },
      ]

      const connectedCount = accounts.filter((a) => a.configured).length

      return React.createElement('div', { className: 'dsub-wrap' },
        React.createElement('div', { className: 'dsub-header-bar' },
          React.createElement('div', { className: 'dsub-row', style: { marginTop: 0 } },
            React.createElement('span', {
              className: 'dsub-badge ' + (hostPing.ok ? 'dsub-badge-ok' : 'dsub-badge-bad')
            }, hostPing.ok
              ? (hostPing.latencyMs != null ? 'Host online (' + hostPing.latencyMs + ' ms)' : t('hostOnline'))
              : t('hostOffline')
            ),
            React.createElement('span', {
              className: 'dsub-badge ' + (connectedCount > 0 ? 'dsub-badge-ok' : 'dsub-badge-warn')
            }, connectedCount > 0
              ? (connectedCount + ' ' + t('subsLogged'))
              : t('subsNotLogged')
            ),
            React.createElement('span', {
              className: 'dsub-badge dsub-badge-neutral'
            }, 'Pool: ' + accounts.length + ' accounts'),
            updater.status && updater.status.updateAvailable
              ? React.createElement('span', { className: 'dsub-badge dsub-badge-warn' },
                  '⬆ ' + t('updateAvailable') + ' (v' + (updater.status.latestVersion || '') + ')'
                )
              : (updater.status && updater.status.currentVersion
                  ? React.createElement('span', { className: 'dsub-badge dsub-badge-neutral' },
                      'v' + updater.status.currentVersion
                    )
                  : null
                ),
          ),
          React.createElement('div', { className: 'dsub-row', style: { marginTop: 0, gap: '8px' } },
            updater.status && updater.status.updateAvailable && updater.status.canAutoUpdate
              ? React.createElement('button', {
                  type: 'button',
                  className: 'dsub-mini dsub-btn-primary',
                  disabled: updater.updating,
                  onClick: () => performUpdate(),
                }, updater.updating ? t('updating') : (t('updateNow') + ' → v' + updater.status.latestVersion))
              : null,
            React.createElement('button', {
              type: 'button',
              className: 'dsub-mini',
              disabled: smoke.testing,
              onClick: () => runSmokeTest(),
            }, smoke.testing ? t('smokeTesting') : t('runSmoke')),
          ),
        ),
        updater.message ? React.createElement('div', {
          className: updater.message.includes(t('updateSuccessRestart')) ? 'dsub-alert-ok' : 'dsub-alert-bad',
          style: { marginBottom: '12px' }
        }, updater.message) : null,
        smoke.result ? React.createElement('div', {
          className: smoke.result.ok ? 'dsub-alert-ok' : 'dsub-alert-bad',
          style: { marginBottom: '12px' }
        }, smoke.result.ok
          ? ('🟢 ' + t('smokeOk') + ': ' + (smoke.result.provider || 'Provider').toUpperCase() + ' · ' + (smoke.result.latencyMs != null ? smoke.result.latencyMs + ' ms' : 'OK') + (smoke.result.label ? ' (' + smoke.result.label + ')' : ''))
          : ('❌ ' + t('smokeFail') + ': ' + (smoke.result.error && (smoke.result.error.message || smoke.result.error.code) || 'Unknown error'))
        ) : null,
        telemetry && telemetry.totalRequests > 0 ? React.createElement('div', { className: 'dsub-grid-2', style: { marginBottom: '14px' } },
          React.createElement('div', { className: 'dsub-stat-box' },
            React.createElement('div', { className: 'dsub-stat-val' }, telemetry.successRequests + ' / ' + telemetry.totalRequests),
            React.createElement('div', { className: 'dsub-stat-lbl' }, t('statsRequests')),
          ),
          React.createElement('div', { className: 'dsub-stat-box' },
            React.createElement('div', { className: 'dsub-stat-val' }, (telemetry.avgLatencyMs || 0) + ' ms'),
            React.createElement('div', { className: 'dsub-stat-lbl' }, t('statsLatency')),
          ),
          React.createElement('div', { className: 'dsub-stat-box' },
            React.createElement('div', { className: 'dsub-stat-val' }, (telemetry.successRate || 100) + '%'),
            React.createElement('div', { className: 'dsub-stat-lbl' }, t('statsSuccessRate')),
          ),
          React.createElement('div', { className: 'dsub-stat-box' },
            React.createElement('div', { className: 'dsub-stat-val' }, (telemetry.cacheHitPercent || 0) + '%'),
            React.createElement('div', { className: 'dsub-stat-lbl' }, t('cacheHitRate')),
          ),
          React.createElement('div', { className: 'dsub-stat-box' },
            React.createElement('div', { className: 'dsub-stat-val' }, telemetry.lastRequestAt ? Math.round((Date.now() - telemetry.lastRequestAt) / 60000) + 'm ago' : '—'),
            React.createElement('div', { className: 'dsub-stat-lbl' }, t('statsLastActivity')),
          ),
        ) : null,
        accounts && accounts.length ? React.createElement('details', { className: 'dsub-group', open: true, style: { marginBottom: '14px' } },
          React.createElement('summary', { className: 'dsub-groupHead' }, '📊 ' + (t('healthMatrix') || 'Health Matrix & Quota Runway')),
          React.createElement('div', { style: { padding: '8px 0', overflowX: 'auto' } },
            React.createElement('table', { style: { width: '100%', fontSize: '12px', borderCollapse: 'collapse' } },
              React.createElement('thead', null,
                React.createElement('tr', { style: { borderBottom: '1px solid var(--dsw-alias-border-l2)', textAlign: 'left', opacity: 0.7 } },
                  React.createElement('th', { style: { padding: '6px' } }, t('healthAccount')),
                  React.createElement('th', { style: { padding: '6px' } }, t('healthScore')),
                  React.createElement('th', { style: { padding: '6px' } }, t('healthLatency')),
                  React.createElement('th', { style: { padding: '6px' } }, t('healthStatus')),
                  React.createElement('th', { style: { padding: '6px' } }, t('healthQuota')),
                ),
              ),
              React.createElement('tbody', null,
                accounts.map((acc, idx) => {
                  const sc = acc.healthScore != null ? acc.healthScore : 100
                  const healthColor = sc >= 80 ? 'var(--dsw-alias-state-success-primary)' : (sc >= 50 ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-state-error-primary)')
                  const isQ = acc.status === 'quarantine' || (acc.quarantineUntil && Number(acc.quarantineUntil) > Date.now())
                  const statusLabel = isQ ? ('⛔ ' + t('healthQuarantine')) : (acc.status === 'probing' ? ('🟡 ' + t('healthWarmup')) : (acc.configured ? ('🟢 ' + t('healthActive')) : ('⚪ ' + t('healthIdle'))))
                  const pct = acc.usagePercent != null ? Math.round(acc.usagePercent) : null
                  return React.createElement('tr', { key: (acc.ref || acc.provider + acc.index || idx), style: { borderBottom: '1px solid var(--dsw-alias-border-l3)' } },
                    React.createElement('td', { style: { padding: '6px', fontWeight: 600 } }, (acc.provider ? acc.provider.toUpperCase() : 'LLM') + ' #' + (acc.index || 1) + (acc.label ? ' (' + acc.label + ')' : '')),
                    React.createElement('td', { style: { padding: '6px', color: healthColor } }, sc + '%'),
                    React.createElement('td', { style: { padding: '6px' } }, acc.latencyMs ? acc.latencyMs + ' ms' : '—'),
                    React.createElement('td', { style: { padding: '6px' } }, statusLabel),
                    React.createElement('td', { style: { padding: '6px' } }, pct != null ? (pct + '% used') : '—'),
                  )
                }),
              ),
            ),
          ),
        ) : null,
        React.createElement('div', { className: 'dsub-block' },
          React.createElement('div', { className: 'dsub-h' }, t('title')),
          React.createElement('div', { className: 'dsub-sub' },
            t('intro')),
          React.createElement('details', { className: 'dsub-group', open: true },
            React.createElement('summary', { className: 'dsub-groupHead' }, t('groupAuth')),
          React.createElement('label', { className: 'dsub-row' },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!draft.useWebCallback,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { useWebCallback: e.target.checked })),
            }),
            React.createElement('span', null, t('useOrigin')),
          ),
          React.createElement('div', { className: 'dsub-sub' },
            t('useOriginHint')),
          React.createElement('label', { className: 'dsub-row' },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!draft.autoLoopback,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { autoLoopback: e.target.checked })),
            }),
            React.createElement('span', null, t('autoLoopback')),
          ),
          React.createElement('div', { className: 'dsub-sub' },
            t('autoLoopbackHint')),
          ),
          React.createElement('details', { className: 'dsub-group', open: true },
            React.createElement('summary', { className: 'dsub-groupHead' }, t('groupPrivacy')),
          React.createElement('label', { className: 'dsub-row' },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!draft.privacyMask,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { privacyMask: e.target.checked })),
            }),
            React.createElement('span', null, t('privacyMask')),
          ),
          React.createElement('div', { className: 'dsub-sub' },
            t('privacyMaskHint')),
          React.createElement('label', { className: 'dsub-row' },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!draft.hideDeprecatedModels,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { hideDeprecatedModels: e.target.checked })),
            }),
            React.createElement('span', null, t('hideDeprecated')),
          ),
          React.createElement('div', { className: 'dsub-sub' },
            t('hideDeprecatedHint')),
          ),
          React.createElement('details', { className: 'dsub-group', open: true },
            React.createElement('summary', { className: 'dsub-groupHead' }, t('groupRotation')),
          React.createElement('div', { className: 'dsub-row' },
            React.createElement('span', { className: 'dsub-h' }, t('composerQuota')),
            React.createElement('select', {
              className: 'dsub-select',
              value: draft.composerQuota || 'percent',
              onChange: (e) => setDraft((d) => Object.assign({}, d, { composerQuota: e.target.value })),
            },
              React.createElement('option', { value: 'off' }, t('composerQuotaOff')),
              React.createElement('option', { value: 'percent' }, t('composerQuotaPercent')),
              React.createElement('option', { value: 'bar' }, t('composerQuotaBar')),
              React.createElement('option', { value: 'forecast' }, t('composerQuotaForecast')),
            ),
          ),
          React.createElement('div', { className: 'dsub-sub' },
            t('composerQuotaHint')),
          React.createElement('div', { className: 'dsub-row' },
            React.createElement('span', { className: 'dsub-h' }, t('expiryNotifyDays')),
            React.createElement('input', {
              type: 'number',
              className: 'dsub-inp',
              style: { width: '80px', minWidth: '80px' },
              min: 0,
              max: 90,
              value: draft.expiryNotifyDays != null ? draft.expiryNotifyDays : 7,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { expiryNotifyDays: Number(e.target.value) || 0 })),
            }),
          ),
          React.createElement('div', { className: 'dsub-sub' },
            t('expiryNotifyDaysHint')),
          ),
          React.createElement('details', { className: 'dsub-group', open: true },
            React.createElement('summary', { className: 'dsub-groupHead' }, t('groupProvider')),
          React.createElement('label', { className: 'dsub-row' },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!draft.codexFastMode,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { codexFastMode: e.target.checked })),
            }),
            React.createElement('span', null, t('codexFastMode')),
          ),
          React.createElement('div', { className: 'dsub-sub' },
            t('codexFastModeHint')),
          React.createElement('div', { className: 'dsub-row' },
            React.createElement('span', { className: 'dsub-h' }, t('codexVerbosity')),
            React.createElement('select', {
              className: 'dsub-select',
              value: draft.codexVerbosity || 'default',
              onChange: (e) => setDraft((d) => Object.assign({}, d, { codexVerbosity: e.target.value })),
            },
              React.createElement('option', { value: 'default' }, t('codexVerbosityDefault')),
              React.createElement('option', { value: 'low' }, t('codexVerbosityLow')),
              React.createElement('option', { value: 'medium' }, t('codexVerbosityMedium')),
              React.createElement('option', { value: 'high' }, t('codexVerbosityHigh')),
            ),
          ),
          React.createElement('div', { className: 'dsub-sub' },
            t('codexVerbosityHint')),
          ),
          React.createElement('details', { className: 'dsub-group', open: true },
            React.createElement('summary', { className: 'dsub-groupHead' }, t('groupFallback')),
          React.createElement('label', { className: 'dsub-row' },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!draft.ollamaFallback,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { ollamaFallback: e.target.checked })),
            }),
            React.createElement('span', null, t('ollamaFallback')),
          ),
          React.createElement('div', { className: 'dsub-sub' },
            t('ollamaFallbackHint')),
          draft.ollamaFallback ? React.createElement('div', { className: 'dsub-row' },
            React.createElement('input', {
              type: 'text',
              className: 'dsub-inp dsub-grow',
              placeholder: 'http://localhost:11434',
              value: draft.ollamaBaseUrl || '',
              onChange: (e) => setDraft((d) => Object.assign({}, d, { ollamaBaseUrl: e.target.value })),
            }),
            React.createElement('input', {
              type: 'text',
              className: 'dsub-inp dsub-grow',
              placeholder: 'llama3:latest',
              value: draft.ollamaFallbackModel || '',
              onChange: (e) => setDraft((d) => Object.assign({}, d, { ollamaFallbackModel: e.target.value })),
            }),
          ) : null,
          ),
          React.createElement('details', { className: 'dsub-group' },
            React.createElement('summary', { className: 'dsub-groupHead' }, '🎯 ' + t('modelsCatalogTitle')),
            React.createElement('div', { className: 'dsub-sub', style: { marginTop: '4px' } }, t('modelsCatalogDesc')),
            React.createElement('div', { className: 'dsub-model-grid' },
              React.createElement('div', { className: 'dsub-model-chip' }, React.createElement('code', null, 'gpt-4o'), React.createElement('span', { className: 'dsub-model-tag' }, '128k · Vision')),
              React.createElement('div', { className: 'dsub-model-chip' }, React.createElement('code', null, 'o1 / o3-mini'), React.createElement('span', { className: 'dsub-model-tag' }, '200k · Reasoning')),
              React.createElement('div', { className: 'dsub-model-chip' }, React.createElement('code', null, 'claude-3-7-sonnet'), React.createElement('span', { className: 'dsub-model-tag' }, '200k · Hybrid')),
              React.createElement('div', { className: 'dsub-model-chip' }, React.createElement('code', null, 'claude-3-5-sonnet'), React.createElement('span', { className: 'dsub-model-tag' }, '200k · Coding')),
              React.createElement('div', { className: 'dsub-model-chip' }, React.createElement('code', null, 'grok-beta'), React.createElement('span', { className: 'dsub-model-tag' }, '128k · Speed')),
              React.createElement('div', { className: 'dsub-model-chip' }, React.createElement('code', null, 'gemini-2.5-pro'), React.createElement('span', { className: 'dsub-model-tag' }, '1M · Context')),
              React.createElement('div', { className: 'dsub-model-chip' }, React.createElement('code', null, 'kimi-k1.5'), React.createElement('span', { className: 'dsub-model-tag' }, '128k · Math')),
              React.createElement('div', { className: 'dsub-model-chip' }, React.createElement('code', null, 'glm-4-plus'), React.createElement('span', { className: 'dsub-model-tag' }, '128k · Chinese')),
            ),
          ),
          React.createElement('details', { className: 'dsub-details' },
            React.createElement('summary', { className: 'dsub-summary' }, t('advancedSettings')),
            React.createElement('div', { className: 'dsub-block' },
              React.createElement('div', { className: 'dsub-row' },
                React.createElement('span', { className: 'dsub-h' }, t('cooldownMs')),
                React.createElement('input', {
                  type: 'number',
                  className: 'dsub-inp',
                  style: { width: '80px', minWidth: '80px' },
                  min: 1,
                  max: 120,
                  value: Math.round((draft.cooldownMs || 600000) / 60000),
                  onChange: (e) => setDraft((d) => Object.assign({}, d, { cooldownMs: (Number(e.target.value) || 10) * 60000 })),
                }),
              ),
              React.createElement('div', { className: 'dsub-sub' }, t('cooldownMsHint')),
              React.createElement('div', { className: 'dsub-row' },
                React.createElement('span', { className: 'dsub-h' }, t('probeIntervalMin')),
                React.createElement('input', {
                  type: 'number',
                  className: 'dsub-inp',
                  style: { width: '80px', minWidth: '80px' },
                  min: 1,
                  max: 1440,
                  value: draft.probeIntervalMin != null ? draft.probeIntervalMin : 15,
                  onChange: (e) => setDraft((d) => Object.assign({}, d, { probeIntervalMin: Number(e.target.value) || 15 })),
                }),
              ),
              React.createElement('div', { className: 'dsub-sub' }, t('probeIntervalMinHint')),
              React.createElement('label', { className: 'dsub-row' },
                React.createElement('input', {
                  type: 'checkbox',
                  checked: draft.notifyLimits !== false,
                  onChange: (e) => setDraft((d) => Object.assign({}, d, { notifyLimits: e.target.checked })),
                }),
                React.createElement('span', null, t('notifyLimits')),
              ),
              React.createElement('div', { className: 'dsub-sub' }, t('notifyLimitsHint')),
            ),
          ),
        ),
        React.createElement('div', { className: 'dsub-block' },
          React.createElement('div', { className: 'dsub-row' },
            React.createElement('button', { type: 'button', className: 'dsub-mini', onClick: genDiag }, t('diagGenerate')),
            React.createElement('button', { type: 'button', className: 'dsub-mini', onClick: runAnalyzeSession }, analyzingCache ? '…' : t('cacheAnalyze')),
            React.createElement('button', { type: 'button', className: 'dsub-mini', onClick: () => { setBackupModal('export'); setBackupErr(''); setBackupInfo('') } }, '🔒 ' + t('backupExport')),
            React.createElement('button', { type: 'button', className: 'dsub-mini', onClick: () => { setBackupModal('import'); setBackupErr(''); setBackupInfo('') } }, '📥 ' + t('backupImport')),
            React.createElement('a', { href: 'https://github.com/GooDAnDReaDY/dsh-subscriptions/issues', target: '_blank', rel: 'noopener noreferrer', className: 'dsub-mini' }, t('diagIssues')),
          ),
          React.createElement('div', { className: 'dsub-sub' }, t('diagHint')),
          sessionAnalysis ? React.createElement('div', { className: 'dsub-sub', style: { marginTop: '6px', fontWeight: 500 } },
            t('cacheHitRate') + ': ' + sessionAnalysis.weightedCacheHitPercent + '% · ' +
            t('tokensSaved') + ': ' + sessionAnalysis.savedTokens + ' / ' + sessionAnalysis.totalTokens
          ) : null,
          diag ? React.createElement('div', { className: 'dsub-row' },
            React.createElement('button', {
              type: 'button', className: 'dsub-mini',
              onClick: () => { try { navigator.clipboard.writeText(diag) } catch { /* clipboard write error */ } },
            }, t('diagCopy')),
            React.createElement('pre', { className: 'dsub-diag' }, diag),
          ) : null,
          backupModal ? React.createElement('div', { className: 'dsub-panel-box', style: { marginTop: '10px' } },
            React.createElement('div', { className: 'dsub-panel-title' },
              React.createElement('span', null, backupModal === 'export' ? ('🔒 ' + t('backupExportTitle')) : ('📥 ' + t('backupImportTitle'))),
              React.createElement('button', {
                type: 'button',
                className: 'dsub-mini',
                onClick: () => { setBackupModal(null); setBackupPass(''); setBackupData(''); setBackupErr(''); setBackupInfo('') }
              }, '✕ ' + t('closeModal'))
            ),
            React.createElement('div', { className: 'dsub-panel-desc' },
              backupModal === 'export' ? t('backupExportHint') : t('backupImportHint')
            ),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' } },
              backupModal === 'import' ? React.createElement('textarea', {
                className: 'dsub-diag',
                style: { width: '100%', height: '80px', fontFamily: 'monospace', fontSize: '11px' },
                placeholder: t('backupPayloadPlaceholder'),
                value: backupData,
                onChange: (e) => setBackupData(e.target.value),
              }) : null,
              React.createElement('div', { className: 'dsub-row' },
                React.createElement('input', {
                  type: 'password',
                  className: 'dsub-grow',
                  placeholder: t('backupPassphrase'),
                  value: backupPass,
                  onChange: (e) => setBackupPass(e.target.value),
                }),
                backupModal === 'export' ? React.createElement('button', {
                  type: 'button',
                  className: 'dsub-mini',
                  disabled: backupLoading || !backupPass || backupPass.length < 12,
                  onClick: doExportBackup,
                }, backupLoading ? '…' : t('backupExportAction')) : React.createElement('button', {
                  type: 'button',
                  className: 'dsub-mini',
                  disabled: backupLoading || !backupPass || !backupData,
                  onClick: doImportBackup,
                }, backupLoading ? '…' : t('backupImportAction'))
              ),
              backupErr ? React.createElement('div', { className: 'dsub-bad' }, backupErr) : null,
              backupInfo ? React.createElement('div', { className: 'dsub-ok' }, backupInfo) : null,
              (backupModal === 'export' && backupData) ? React.createElement('div', { className: 'dsub-row' },
                React.createElement('button', {
                  type: 'button',
                  className: 'dsub-mini',
                  onClick: () => { try { navigator.clipboard.writeText(backupData) } catch { /* ignore */ } },
                }, t('diagCopy')),
                React.createElement('button', {
                  type: 'button',
                  className: 'dsub-mini',
                  onClick: downloadBackupFile,
                }, t('backupDownload')),
                React.createElement('pre', { className: 'dsub-diag', style: { maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' } }, backupData)
              ) : null
            )
          ) : null,
        ),
        names.map((prov) => {
          const rows = slots
            .map((slot, i) => ({ slot: slot, i: i }))
            .filter((row) => row.slot.provider === prov.id)
          return React.createElement('div', { className: 'dsub-block', key: prov.id },
            React.createElement('div', { className: 'dsub-h' }, prov.name),
            rows.map((row) => {
              const account = accountOf(row.slot.provider, row.slot.index)
              const key = row.slot.provider + ':' + row.slot.index
              const on = !!account.configured
              return React.createElement('div', { className: 'dsub-card', key: key },
                React.createElement('div', { className: 'dsub-row' },
                  React.createElement('input', {
                    className: 'dsub-grow',
                    value: row.slot.label || '',
                    placeholder: account.label || (t('accountLabel') + ' ' + row.slot.index),
                    onChange: (e) => {
                      const next = slots.slice()
                      next[row.i] = Object.assign({}, next[row.i], { label: e.target.value })
                      setSlots(next)
                    },
                  }),
                  React.createElement('span', { className: 'dsub-badge' + (account.validationUrl ? ' dsub-badge-warn' : (on ? ' dsub-badge-on' : '')) }, badgeFor(account, t)),
                  normalizePlanBadge(row.slot.provider, account.plan || (account.quota && account.quota.plan)),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    onClick: () => connect(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, on ? t('reconnect') : t('connect')),
                  ((row.slot.provider === 'codex' || row.slot.provider === 'copilot') ? React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    onClick: () => deviceStartLogin(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, t('deviceLogin')) : null),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    disabled: !on,
                    onClick: () => logout(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, t('disconnect')),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    disabled: checking[key],
                    onClick: () => doCheck(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, checking[key] ? t('checking') : t('check')),
                  (account && account.quarantineUntil && Number(account.quarantineUntil) > Date.now() ? React.createElement(React.Fragment, null,
                    React.createElement('button', {
                      type: 'button', className: 'dsub-mini', title: t('probeWarmupTitle'),
                      disabled: checking[key],
                      onClick: () => doProbeQuarantine(row.slot.provider, row.slot.index, false),
                    }, checking[key] ? t('checking') : ('🔄 ' + t('probeWarmupNow'))),
                    React.createElement('button', {
                      type: 'button', className: 'dsub-mini', title: t('releaseQuarantineTitle'),
                      disabled: checking[key],
                      onClick: () => doProbeQuarantine(row.slot.provider, row.slot.index, true),
                    }, ('✕ ' + t('releaseQuarantine'))),
                  ) : (on ? React.createElement('button', {
                    type: 'button', className: 'dsub-mini', title: t('quarantineParkTitle'),
                    onClick: () => doParkQuarantine(row.slot.provider, row.slot.index, 3600000),
                  }, ('⏸ ' + t('quarantinePark'))) : null)),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini', title: t('removeSlot'),
                    onClick: () => {
                      const slot = row.slot
                      Promise.resolve(on ? logout(slot.provider, slot.index) : null)
                        .then(() => setSlots(slots.filter((_, k) => k !== row.i)))
                        .catch((e) => setErr(cleanErrorMessage(e.message || e)))
                    },
                  }, '\u00d7'),
                ),
                (account && account.quarantineUntil && Number(account.quarantineUntil) > Date.now()) ? React.createElement('div', { className: 'dsub-row', style: { marginTop: 4 } },
                  React.createElement('span', { className: 'dsub-sub', style: { color: 'var(--dsw-alias-state-error-primary)', fontVariantNumeric: 'tabular-nums' } },
                    '⛔ ' + (account.quarantineReason || 'QUARANTINE') + ' · ' + t('resetsIn') + ' ' + formatRelativeReset(account.quarantineUntil, t, Date.now())
                  ),
                ) : (account && account.quota && account.quota.resetAt && Number(account.quota.resetAt) > Date.now()) ? React.createElement('div', { className: 'dsub-row', style: { marginTop: 4 } },
                  React.createElement(ResetCountdown, { resetAt: account.quota.resetAt }),
                ) : null,
                React.createElement('div', { className: 'dsub-manual' },
                  React.createElement('span', { className: 'dsub-sub' }, t('manualTitle')),
                React.createElement('div', { className: 'dsub-row' },
                  React.createElement('input', {
                    className: 'dsub-grow',
                    value: paste[key] || '',
                    placeholder: t('pastePlaceholder'),
                    onChange: (e) => setPaste((p) => Object.assign({}, p, { [key]: e.target.value })),
                  }),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    onClick: () => complete(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, t('submitCode')),
                ),
                React.createElement('div', { className: 'dsub-row', style: { justifyContent: 'space-between' } },
                  React.createElement('button', {
                    type: 'button',
                    className: 'dsub-mini',
                    title: t('importLocalCliTitle'),
                    style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 },
                    onClick: () => importLocalCli(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, t('importLocalCli')),
                  React.createElement('button', {
                    type: 'button',
                    className: 'dsub-mini' + (openHelp[key] ? ' dsub-btnActive' : ''),
                    title: t('howToGetTokenTitle'),
                    onClick: (e) => { if (e) { e.preventDefault(); e.stopPropagation(); } setOpenHelp((h) => Object.assign({}, h, { [key]: !h[key] })); },
                  }, t('howToGetToken')),
                ),
                React.createElement('div', { className: 'dsub-row' },
                  React.createElement('input', {
                    className: 'dsub-grow',
                    value: tokenDraft[key] || '',
                    placeholder: t('importTokenPlace'),
                    onChange: (e) => setTokenDraft((d) => Object.assign({}, d, { [key]: e.target.value })),
                  }),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    title: t('importToken'),
                    onClick: () => importToken(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, t('importToken')),
                ),
                (openHelp[key] ? (function renderInlineHelp(){
                  const prov = row.slot.provider;
                  const info = INSTRUCTIONS[prov] || { title: prov, steps: [], note: 'helpGeneric' };
                  const labels = { fromCli: t('importLocalCli'), saveToken: t('importToken'), deviceLogin: t('deviceLogin'), connect: t('connect') };
                  const steps = info.steps.map((k, i) => (i + 1) + '. ' + t(k, labels));
                  if (info.note) steps.push(t(info.note, labels));
                  return React.createElement('div', { className: 'dsub-helpBox' },
                    React.createElement('div', { className: 'dsub-helpHead' },
                      React.createElement('span', null, 'ℹ️ ' + info.title + ' — ' + t('instructionsTitle')),
                      React.createElement('button', {
                        type: 'button', className: 'dsub-mini',
                        style: { padding: '1px 6px', fontSize: 11 },
                        onClick: (e) => {
                          if (e) { e.preventDefault(); e.stopPropagation(); }
                          setOpenHelp((h) => Object.assign({}, h, { [key]: false }));
                        },
                      }, '✕')
                    ),
                    steps.map((st, i) => React.createElement('div', { key: i, className: 'dsub-helpStep' }, st)),
                    info.link ? React.createElement('div', { style: { marginTop: 8 } },
                      React.createElement('a', {
                        href: info.link,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        className: 'dsub-mini',
                        style: { display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' },
                      }, '🔗 ' + t('helpOpenConsole'))
                    ) : null
                  );
                })() : null),
                React.createElement('div', { className: 'dsub-row' },
                  React.createElement('input', {
                    className: 'dsub-grow',
                    value: row.slot.proxyUrl || '',
                    placeholder: t('proxyPlaceholder'),
                    onChange: (e) => {
                      const next = slots.slice()
                      next[row.i] = Object.assign({}, next[row.i], { proxyUrl: e.target.value })
                      setSlots(next)
                    },
                  }),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    disabled: checking['proxy:' + key],
                    onClick: () => doProxyCheck(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, checking['proxy:' + key] ? '\u2026' : t('proxyCheck')),
                ),
                (function(){
                  var r = proxyRes[key]
                  if (!r) return null
                  var txt = r.ok ? (t('proxyOk') + ' ' + r.latencyMs + 'ms' + (r.viaProxy ? '' : ' (direct)')) : (t('proxyFail') + ': ' + ((r.error && r.error.message) || ''))
                  return React.createElement('div', { className: r.ok ? 'dsub-ok' : 'dsub-bad' }, txt)
                })(),
                ),
                (function devicePanel(){
                  var d = device[key]
                  if (!d) return null
                  var txt = d.status === 'authorized' ? t('deviceAuthorized') : (d.status === 'expired' ? t('deviceExpired') : t('devicePending'))
                  var cls = d.status === 'authorized' ? 'dsub-ok' : (d.status === 'expired' ? 'dsub-bad' : 'dsub-verify')
                  return React.createElement('div', { className: 'dsub-verify' },
                    React.createElement('div', { className: cls }, txt),
                    d.status === 'pending' ? React.createElement(React.Fragment, null,
                      React.createElement('div', { style: { fontSize: '2em', fontWeight: 700, letterSpacing: '0.15em', margin: '4px 0' } }, d.userCode),
                      React.createElement('div', { className: 'dsub-row' },
                        React.createElement('button', {
                          type: 'button', className: 'dsub-mini',
                          onClick: () => { try { navigator.clipboard.writeText(d.userCode) } catch { /* clipboard write error */ } },
                        }, t('deviceCopy')),
                        React.createElement('a', { href: d.authUrl, target: '_blank', rel: 'noopener noreferrer', className: 'dsub-mini' }, t('verifyLink')),
                      ),
                      React.createElement('div', { className: 'dsub-sub' }, t('deviceHint')),
                    ) : null,
                  )
                })(),
                (row.slot.provider === 'codex' && on ? (function resetPanel(){
                  var st = reset[key] || { phase: 'idle' }
                  var now = Date.now()
                  function resultText(code) {
                    if (code === 'reset') return t('resetDone')
                    if (code === 'nothing_to_reset') return t('resetNothing')
                    if (code === 'no_credit') return t('resetNoCredit')
                    if (code === 'already_redeemed') return t('resetRedeemed')
                    return code
                  }
                  if (st.phase !== 'confirm') {
                    return React.createElement('div', { className: 'dsub-panel-box' },
                      React.createElement('div', { className: 'dsub-panel-title' },
                        React.createElement('span', null, '⚡ ' + t('resetCredits')),
                        React.createElement('button', {
                          type: 'button',
                          className: 'dsub-mini',
                          disabled: st.phase === 'loading',
                          onClick: () => resetPrepare(row.slot.provider, row.slot.index, key).catch((e) => setErr(String(e && e.message || e))),
                        }, st.phase === 'loading' ? '…' : t('resetCreditsAction'))
                      ),
                      React.createElement('div', { className: 'dsub-panel-desc' }, t('resetCreditsHint'))
                    )
                  }
                  var ready = now >= st.readyAt
                  var secs = Math.max(0, Math.ceil((st.readyAt - now) / 1000))
                  return React.createElement('div', { className: 'dsub-panel-box dsub-panel-warn' },
                    React.createElement('div', { className: 'dsub-panel-title' },
                      React.createElement('span', null, '⚠️ ' + t('resetCredits')),
                      React.createElement('span', { className: 'dsub-tag-ok' }, t('resetAvailable') + ': ' + st.availableCount)
                    ),
                    st.creditExpiresAt ? React.createElement('div', { className: 'dsub-panel-desc' },
                      t('resetExpires') + ': ' + new Date(st.creditExpiresAt).toLocaleString()
                    ) : null,
                    React.createElement('label', { className: 'dsub-row', style: { cursor: 'pointer', margin: '4px 0' } },
                      React.createElement('input', {
                        type: 'checkbox',
                        checked: !!st.ack,
                        onChange: (e) => setReset((m) => Object.assign({}, m, { [key]: Object.assign({}, st, { ack: e.target.checked }) })),
                      }),
                      React.createElement('span', { style: { fontSize: '12px', fontWeight: 500 } }, t('resetAck')),
                    ),
                    React.createElement('div', { className: 'dsub-row', style: { gap: '8px' } },
                      React.createElement('button', {
                        type: 'button',
                        className: 'dsub-mini dsub-btn-danger',
                        disabled: !st.ack || !ready || !!st.busy,
                        onClick: () => resetConsume(key).catch((e) => setErr(String(e && e.message || e))),
                      }, st.busy ? t('resetBusy') : (ready ? t('resetGo') : (t('resetWait') + ' ' + secs + 's'))),
                      !ready && !st.busy ? React.createElement('span', { className: 'dsub-sub' }, t('resetWait') + ' ' + secs + 's') : null,
                      st.ack && ready ? React.createElement('span', { className: 'dsub-ok', style: { fontSize: '12px', fontWeight: 600 } }, '✓ ' + t('resetReady')) : null,
                      React.createElement('button', {
                        type: 'button',
                        className: 'dsub-mini',
                        style: { marginLeft: 'auto' },
                        onClick: () => setReset((m) => Object.assign({}, m, { [key]: { phase: 'idle' } })),
                      }, t('cancel'))
                    ),
                    st.result ? React.createElement('div', { className: 'dsub-ok', style: { fontWeight: 600 } }, resultText(st.result)) : null,
                    st.error ? React.createElement('div', { className: 'dsub-bad' }, st.error) : null,
                  )
                })() : null),
                account.accountNotice ? React.createElement('div', { className: 'dsub-verify' }, account.accountNotice) : null,
                account.refreshError ? React.createElement('div', { className: 'dsub-bad' }, t('reconnectRequired') + ': ' + account.refreshError) : null,
                (function(){ var r=checkRes[key]; if(!r) return null; var txt=r.ok ? ('ok ' + (r.email||'')) : ('fail ' + (r.error && r.error.message || '')); var cls=r.ok ? 'dsub-ok' : 'dsub-bad'; var q=r.quota; if(q && q.remaining!=null) txt += ' quota:'+q.remaining+(q.limit!=null?'/'+q.limit:''); return React.createElement('div', {className: cls}, txt) })(),
                account.validationUrl ? React.createElement('div', { className: 'dsub-verify' },
                  t('verifyPrefix'),
                  React.createElement('a', { href: account.validationUrl, target: '_blank', rel: 'noopener noreferrer' }, t('verifyLink')),
                  t('verifySuffix'),
                ) : null,
                (function usageLimitsBlock(){
                  var wins = account.usage
                  var q = account.quota
                  var hasWins = Array.isArray(wins) && wins.length > 0
                  var hasQuota = q && q.usedPercent != null
                  var hasUsagePct = !hasWins && !hasQuota && account.usagePercent != null

                  if (!hasWins && !hasQuota && !hasUsagePct) return null

                  function windowLabel(w){
                    var id = String((w && w.id) || '')
                    var given = w && (w.ru || w.en)
                    if (given && given !== id) return given
                    if (id === 'primary_window') return t('windowPrimary')
                    if (id === 'secondary_window') return t('windowSecondary')
                    if (!id) return t('quota')
                    return id.replace(/_/g, ' ')
                  }

                  function renderItem(label, pct, detail){
                    var p = Math.min(100, Math.max(0, Math.round(pct)))
                    var tagCls = p >= 90 ? 'dsub-tag-bad' : (p >= 70 ? 'dsub-tag-warn' : 'dsub-tag-ok')
                    var fillBg = p >= 90 ? 'var(--dsw-alias-state-error-primary)' : (p >= 70 ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-state-success-primary)')
                    return React.createElement('div', { key: label, className: 'dsub-usage-card' },
                      React.createElement('div', { className: 'dsub-usage-head' },
                        React.createElement('span', null, label),
                        React.createElement('span', { className: tagCls }, p + '%')
                      ),
                      React.createElement('div', { className: 'dsub-usage-track' },
                        React.createElement('div', {
                          className: 'dsub-usage-fill',
                          style: { width: p + '%', background: fillBg }
                        })
                      ),
                      detail ? React.createElement('div', { className: 'dsub-usage-meta' }, detail) : null
                    )
                  }

                  var items = []
                  if (hasWins) {
                    wins.forEach(function(w, idx){
                      if (w && w.usedPercent != null) {
                        var extra = null
                        if (idx === 0 && account.requests && w.usedPercent < 100) {
                          var rem = 100 - w.usedPercent
                          var est = Math.floor(rem / (w.usedPercent / account.requests))
                          if (est > 0) extra = React.createElement('span', null, t('forecast') + ' ' + est)
                        }
                        var resetElem = w.resetAt ? React.createElement(ResetCountdown, { key: 'reset-' + idx, resetAt: w.resetAt }) : null
                        var extraContent = (resetElem && extra)
                          ? React.createElement('span', { className: 'dsub-row', style: { gap: '6px' } }, resetElem, extra)
                          : (resetElem || extra)
                        items.push(renderItem(windowLabel(w), w.usedPercent, extraContent))
                      }
                    })
                  }
                  if (hasQuota) {
                    items.push(renderItem(t('quota'), q.usedPercent, q.resetAt ? React.createElement(ResetCountdown, { key: 'reset', resetAt: q.resetAt }) : null))
                  } else if (hasUsagePct) {
                    items.push(renderItem(t('quota'), account.usagePercent, null))
                  }

                  var at = (q && q.measuredAt) || (account.usageAt || 0)
                  var agoStr = null
                  if (at) {
                    var m = Math.round((Date.now() - at) / 60000)
                    if (m >= 1) agoStr = m + 'm ' + (t('close') === '关闭' ? '前' : 'ago')
                  }

                  return React.createElement('div', { className: 'dsub-panel-box' },
                    React.createElement('div', { className: 'dsub-panel-title' },
                      React.createElement('span', null, '📊 ' + t('usageLimitsTitle')),
                      agoStr ? React.createElement('span', { className: 'dsub-sub' }, agoStr) : null
                    ),
                    React.createElement('div', { className: 'dsub-usage-grid' }, items)
                  )
                })(),
                ((account.paidTierName || account.ref || (telemetry && telemetry.accounts && telemetry.accounts[account.ref])) ? React.createElement('div', { className: 'dsub-slot-meta-row' },
                  account.paidTierName ? React.createElement('span', { className: 'dsub-sub' },
                    React.createElement('strong', null, t('plan') + ': '),
                    account.paidTierName
                  ) : null,
                  (function(){
                    const accTelem = telemetry && telemetry.accounts && telemetry.accounts[account.ref]
                    if (!accTelem) return null
                    const parts = []
                    if (accTelem.avgTtftMs != null) parts.push('TTFT: ' + accTelem.avgTtftMs + 'ms')
                    else if (accTelem.lastTtftMs != null) parts.push('TTFT: ' + accTelem.lastTtftMs + 'ms')
                    if (accTelem.avgTps != null) parts.push(accTelem.avgTps + ' t/s')
                    else if (accTelem.lastTps != null) parts.push(accTelem.lastTps + ' t/s')
                    if (parts.length === 0) return null
                    return React.createElement('span', { className: 'dsub-speed-tag', title: t('speedMetricsHint') },
                      '⚡ ' + parts.join(' · ')
                    )
                  })(),
                  account.ref ? React.createElement('span', { className: 'dsub-ref-tag' },
                    React.createElement('span', null, t('storedAs')),
                    React.createElement('code', null, account.ref)
                  ) : null
                ) : null),
              )
            }),
            React.createElement('button', {
              type: 'button', className: 'dsub-mini',
              onClick: () => addSlot(prov.id),
            }, t('addAccount')),
          )
        }),
        React.createElement('div', { className: 'dsub-foot' },
          React.createElement('button', {
            type: 'button', className: 'dsub-save',
            onClick: () => save().catch((e) => setErr(cleanErrorMessage(e.message || e))),
          }, t('save')),
          saved ? React.createElement('span', { className: 'dsub-ok' }, t('saved')) : null,
          info ? React.createElement('span', { className: 'dsub-ok' }, info) : null,
          err ? React.createElement('span', { className: 'dsub-bad' }, err) : null,
        ),
      )
    }

    // The card in the Plugins tab follows the bash/agent-loop/web-search cards:
    // titled header with description and chevron, collapsible, bordered.
    function PluginCard(props) {
      const cardT = (props && props.t) || t
      const page = !!(props && props.view === 'page')
      const [open, setOpen] = React.useState(!!page)
      // Row seat (plugins.row.config): the host page draws title/icon/crumb and the
      // padding, so the summary is a one-liner and the page drops our card chrome.
      if (props && props.view === 'summary') {
        return React.createElement('div', { className: 'dsub-description' }, cardT('cardIntro'))
      }
      // Check host snapshot status (#408, #459): loading, unavailable, or error
      if (props && props.status === 'loading') {
        return React.createElement(page ? 'div' : 'li', {
          className: page ? 'dsub-page' : 'dsub-card',
        },
          React.createElement('div', { className: 'dsub-header', style: { cursor: 'default' } },
            React.createElement('div', { className: 'dsub-headText' },
              React.createElement('div', { className: 'dsub-name' }, cardT('title')),
              React.createElement('div', { className: 'dsub-description' }, cardT('loading') || cardT('settingsLoading') || 'Loading…'),
            ),
          )
        )
      }
      if (props && props.status === 'unavailable') {
        return React.createElement(page ? 'div' : 'li', {
          className: page ? 'dsub-page' : 'dsub-card',
        },
          React.createElement('div', { className: 'dsub-header', style: { cursor: 'default' } },
            React.createElement('div', { className: 'dsub-headText' },
              React.createElement('div', { className: 'dsub-name' }, cardT('title')),
              React.createElement('div', { className: 'dsub-description', style: { color: 'var(--dsw-alias-state-warn-primary)' } },
                cardT('unavailable') || cardT('settingsUnavailable') || 'Settings are unavailable',
              ),
            ),
          )
        )
      }
      if (props && props.status === 'error') {
        return React.createElement(page ? 'div' : 'li', {
          className: page ? 'dsub-page' : 'dsub-card',
        },
          React.createElement('div', { className: 'dsub-header', style: { cursor: 'default' } },
            React.createElement('div', { className: 'dsub-headText' },
              React.createElement('div', { className: 'dsub-name' }, cardT('title')),
              React.createElement('div', { className: 'dsub-description', style: { color: 'var(--dsw-alias-state-error-primary)' } },
                (props.error && (props.error.message || String(props.error))) || cardT('error') || cardT('settingsError') || 'Settings error',
              ),
            ),
          )
        )
      }
      return React.createElement(page ? 'div' : 'li', {
        className: page ? 'dsub-page' : 'dsub-card' + (open ? ' dsub-cardOpen' : ''),
      },
        React.createElement('button', {
          type: 'button',
          className: 'dsub-header',
          style: page ? { display: 'none' } : undefined,
          onClick: () => setOpen(!open),
          'aria-expanded': page ? true : open,
        },
          React.createElement('div', { className: 'dsub-headText' },
            React.createElement('div', { className: 'dsub-name' }, cardT('title')),
            React.createElement('div', { className: 'dsub-description' }, cardT('cardIntro')),
          ),
          React.createElement(Chevron, { className: 'dsub-chev' + (open ? ' dsub-chevOpen' : '') }),
        ),
        (page || open) ? React.createElement('div', { className: 'dsub-body' },
          React.createElement(ErrorBoundary, null, React.createElement(SubsSection, props)),
        ) : null,
      )
    }

    function registerLocales(ctx) {
      // Languages can come from more than this plugin: dictionary packages declare
      // Russian for foreign namespaces. The core throws on re-declaring the same
      // namespace+language pair, and an unguarded call used to take down the
      // whole plugin - in the UI it surfaced as Failed to
      // load plugins listing perfectly innocent neighbours.
      //
      // So each language is declared separately and politely: if someone got
      // there first we yield, while our own English still lands.
      const addLocale = (locale, dictionary) => {
        try {
          return ctx.locale.register(NS, locale, dictionary)
        } catch {
          return () => {}
        }
      }
      ctx.effect(() => {
        const undo = [addLocale('en', en), addLocale('zh', zh)]
        return () => { for (const off of undo) off() }
      }, 'dsh-subscriptions: locales')
    // Labels outside a component take the translator bound to the namespace.
      setT(ctx.locale.bind(NS))
    }

    // The card as a whole page of the Settings dialog, for hosts that hide the
    // Plugins page. The root class scopes the settings look (spacing, cards, focus).
    function SettingsSectionCard(props) {
      return React.createElement('div', { className: 'dsub-settings' },
        React.createElement(PluginCard, Object.assign({}, props, { view: 'page' })))
    }

    function registerSettings(ctx, placement) {
      if (placement === 'settings' || placement === 'both') {
        // dsh orders Account at -10 and General at 0, so -5 is right below Account.
        ctx.effect(() => {
          try {
            return ctx.slots.inject('settings.section', () => ctx.slots.register(
              {
                name: 'settings.section',
                id: ROW_ID,
                order: -5,
                label: () => t('title') || 'Subscriptions',
                locale: NS,
                inject: () => ({ ctx: ctx }),
              },
              SettingsSectionCard,
            ))
          } catch {
            return () => {}
          }
        }, 'dsh-subscriptions: settings section')
      }
      // 'none': the embedding host draws its own surface over the same routes.
      if (placement === 'settings' || placement === 'none') return
      // The canonical place is the Plugins tab: a card with its own header
      // and collapse instead of a row in the side list. The registration key must
      // equal the settings namespace, otherwise the tab silently hides the slot.
      ctx.effect(() => {
        const cleanups = []
        try {
          if (ctx.slots && typeof ctx.slots.inject === 'function') {
            const un1 = ctx.slots.inject('plugins.item', () => ctx.slots.register(
              {
                name: 'plugins.item',
                id: ROW_ID,
                order: 60,
                label: () => t('title') || 'Subscriptions',
                locale: NS,
                inject: () => ({ ctx: ctx }),
              },
              PluginCard,
            ))
            if (typeof un1 === 'function') cleanups.push(un1)

            // DSH 0.2 bundle config seat: rendered in PackageDetail when viewing package
            const unBundle = ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register(
              {
                name: 'plugins.bundle.config',
                key: PKG,
                locale: NS,
                inject: () => ({ ctx: ctx }),
              },
              PluginCard,
            ))
            if (typeof unBundle === 'function') cleanups.push(unBundle)

            // DSH 0.1/0.2 row config seats
            for (const key of [ROW_CONFIG_KEY, ROW_ID + '#' + ROW_ID, ROW_ID]) {
              const unRow = ctx.slots.inject('plugins.row.config', () => ctx.slots.register(
                {
                  name: 'plugins.row.config',
                  key,
                  locale: NS,
                  inject: () => ({ ctx: ctx }),
                },
                PluginCard,
              ))
              if (typeof unRow === 'function') cleanups.push(unRow)
            }


          }
        } catch {
          // Slot system not available — expected on headless / non-web profiles.
        }
        return () => {
          for (const off of cleanups) {
            try { off() } catch { /* best-effort cleanup */ }
          }
        }
      }, 'dsh-subscriptions: settings slots')
    }

    // Hot provider switcher in the composer row: a click cycles
    // the active subscription provider for the next request.
        const ORDER = ['codex', 'claude', 'grok', 'antigravity']

    async function refreshLoggedIn() {
      try {
        const res = await fetch('/dsh-subscriptions/status', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        const loggedIn = (data && data.loggedIn) || {}
        const usage = (data && data.usagePercent) || {}
        const logged = ORDER.filter((p) => loggedIn[p])
        const maxUsage = logged.reduce((m, p) => Math.max(m, usage[p] || 0), 0)
        return {
          logged,
          usage: maxUsage,
          expiresAt: (data && data.expiresAt) || {},
          labels: (data && data.labels) || {},
          expiryNotifyDays: (data && data.expiryNotifyDays) || 7,
          composerQuota: (data && data.composerQuota) || 'off',
          active: (data && data.active) || null,
        }
      } catch { return { logged: [], usage: 0, expiresAt: {}, labels: {}, expiryNotifyDays: 7, fastMode: false, composerQuota: 'off', active: null } }
    }

    // #84: compact quota indicator of the active subscription in the input area.
    // The runway forecast uses a rolling window of /status samples.
    const fcSamples = { windows: {} }

    function fcObserve(key, remaining, now) {
      const windows = fcSamples.windows
      const prev = windows[key]
      const samples = (prev && prev.samples) || []
      const last = samples[samples.length - 1]
      if (!last || (now > last.at && (Math.abs(remaining - last.pct) >= 0.1 || now - last.at >= 15 * 60 * 1000))) {
        samples.push({ at: now, pct: remaining })
      }
      windows[key] = { samples: samples.filter((x) => x.at >= now - 24 * 60 * 60 * 1000).slice(-192) }
    }

    function fcEstimate(key, remaining) {
      const rec = fcSamples.windows[key]
      if (!rec) return { status: 'calibrating' }
      const samples = rec.samples
      if (samples.length < 3) return { status: 'calibrating' }
      const first = samples[0]
      const last = samples[samples.length - 1]
      const span = last.at - first.at
      const consumed = first.pct - last.pct
      if (span < 30 * 60 * 1000 || consumed < 1) return { status: 'calibrating' }
      const t0 = first.at
      let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0
      for (const x of samples) {
        const wx = (x.at - t0) / 3600000
        const wy = first.pct - x.pct
        const w = Math.exp((x.at - last.at) / (6 * 3600000))
        sw += w; sx += w * wx; sy += w * wy; sxx += w * wx * wx; sxy += w * wx * wy
      }
      const den = sw * sxx - sx * sx
      const pace = den > 0 ? (sw * sxy - sx * sy) / den : 0
      if (!Number.isFinite(pace) || pace < 0.02) return { status: 'idle' }
      return { status: 'ready', runwaySeconds: Math.round((remaining / pace) * 3600) }
    }

    function ComposerQuota(props) {
      const t = (props && props.t) || ((k) => k)
      const [state, setState] = React.useState({ mode: 'off', active: null })
      React.useEffect(() => {
        let alive = true
        const pull = () => {
          refreshLoggedIn().then((r) => {
            if (!alive) return
            const mode = r.composerQuota || 'off'
            const a = r.active
            if (mode !== 'off' && a && a.provider && a.provider !== 'ollama' && a.usagePercent != null) {
              const remaining = Math.max(0, 100 - a.usagePercent)
              const key = 'subs:' + a.provider
              fcObserve(key, remaining, Date.now())
              const est = fcEstimate(key, remaining, Date.now())
              setState({ mode, active: a, remaining, est })
            } else {
              setState({ mode, active: a, remaining: null, est: null })
            }
          }).catch(() => {})
        }
        pull()
        const id = setInterval(pull, 60 * 1000)
        return () => { alive = false; clearInterval(id) }
      }, [])
      if (state.mode === 'off' || !state.active || state.remaining == null) return null
      const cls = state.remaining <= 10 ? ' dsub-cqBarFull' : (state.remaining <= 30 ? ' dsub-cqBarWarn' : '')
      var value = null
      if (state.mode === 'percent') {
        value = React.createElement('span', { className: 'dsub-cqB' }, Math.round(state.remaining) + '%')
      } else if (state.mode === 'bar') {
        value = React.createElement('span', { className: 'dsub-cqBar' + cls },
          React.createElement('span', { className: 'dsub-cqBarFill', style: { width: Math.min(100, Math.max(0, state.remaining)) + '%' } }))
      } else if (state.mode === 'forecast') {
        var est = state.est
        if (!est || est.status === 'calibrating') value = React.createElement('span', { className: 'dsub-cqB' }, t('fcCalibrating'))
        else if (est.status === 'idle') value = React.createElement('span', { className: 'dsub-cqB' }, t('fcIdle'))
        else {
          var secs = est.runwaySeconds || 0
          var txt = secs >= 3600 ? ('~' + (Math.round((secs / 3600) * 10) / 10) + t('fcHours')) : ('~' + Math.max(1, Math.round(secs / 60)) + t('fcMinutes'))
          value = React.createElement('span', { className: 'dsub-cqB' }, txt)
        }
      } else return null
      return React.createElement('span', { className: 'dsub-cq', title: t('forecast') + ' · ' + state.active.provider }, value)
    }

    // #83: SUBS(N) pill in the session header with a pool health LED and
    // a modal accounts console (close: X button, Escape, outside click).
    function brandBadge(prov) {
      const p = String(prov || '').toLowerCase()
      if (p.includes('codex') || p.includes('chatgpt') || p.includes('openai')) return { label: 'OpenAI', cls: 'dsub-brandCodex', icon: '⚡' }
      if (p.includes('claude') || p.includes('anthropic')) return { label: 'Claude', cls: 'dsub-brandClaude', icon: '✳' }
      if (p.includes('grok') || p.includes('xai')) return { label: 'Grok', cls: 'dsub-brandGrok', icon: '✦' }
      if (p.includes('antigravity') || p.includes('google') || p.includes('gemini')) return { label: 'AGY', cls: 'dsub-brandAgy', icon: '◆' }
      if (p.includes('kimi')) return { label: 'Kimi', cls: 'dsub-brandKimi', icon: '🌙' }
      if (p.includes('glm') || p.includes('zcode')) return { label: 'GLM', cls: 'dsub-brandGlm', icon: '⚡' }
      if (p.includes('copilot') || p.includes('github')) return { label: 'Copilot', cls: 'dsub-brandCodex', icon: '🐙' }
      if (p.includes('cursor')) return { label: 'Cursor', cls: 'dsub-brandCodex', icon: '💻' }
      if (p.includes('kiro')) return { label: 'Kiro', cls: 'dsub-brandAgy', icon: '☁️' }
      if (p.includes('qwen')) return { label: 'Qwen', cls: 'dsub-brandKimi', icon: '🌐' }
      if (p.includes('ernie') || p.includes('baidu')) return { label: 'ERNIE', cls: 'dsub-brandGlm', icon: '🐻' }
      if (p.includes('spark') || p.includes('xfyun')) return { label: 'Spark', cls: 'dsub-brandGrok', icon: '✨' }
      if (p.includes('jetbrains')) return { label: 'JetBrains', cls: 'dsub-brandClaude', icon: '🚀' }
      if (p.includes('perplexity')) return { label: 'Perplexity', cls: 'dsub-brandClaude', icon: '🔮' }
      if (p.includes('replit')) return { label: 'Replit', cls: 'dsub-brandCodex', icon: '⚡' }
      if (p.includes('cody') || p.includes('sourcegraph')) return { label: 'Cody', cls: 'dsub-brandAgy', icon: '🔍' }
      if (p.includes('ollama')) return { label: 'Ollama', cls: 'dsub-brandOllama', icon: '🦙' }
      return { label: (p.charAt(0).toUpperCase() || 'P'), cls: 'dsub-brandCodex', icon: '●' }
    }

    const PLUGIN_LABELS = new Set(['plugins', '插件', 'plugin'])

    function resolvePluginLabels(customCtx) {
      const labels = new Set(PLUGIN_LABELS)
      const loc = (customCtx && customCtx.locale) || (typeof window !== 'undefined' && window.__dshCtx && window.__dshCtx.locale)
      if (loc && typeof loc.bind === 'function') {
        try {
          const sp = loc.bind('settings.plugins')
          const nav = typeof sp === 'function' ? sp('nav') : null
          if (nav && typeof nav === 'string') labels.add(nav.trim().toLowerCase())
        } catch { /* bestEffort */ }
        try {
          const pm = loc.bind('pluginManager')
          const panel = typeof pm === 'function' ? (pm('panel') || pm('title')) : null
          if (panel && typeof panel === 'string') labels.add(panel.trim().toLowerCase())
        } catch { /* bestEffort */ }
      }
      return labels
    }

    function matchesPluginLabel(el, customLabels) {
      if (!el) return false
      const dataTab = (el.getAttribute('data-tab') || '').trim().toLowerCase()
      const dataSection = (el.getAttribute('data-section') || '').trim().toLowerCase()
      const dataKey = (el.getAttribute('data-key') || '').trim().toLowerCase()
      const id = (el.getAttribute('id') || '').trim().toLowerCase()
      if (dataTab === 'plugins' || dataSection === 'plugins' || dataKey === 'plugins' || id === 'plugins') return true

      if (el.querySelector && el.querySelector('path[d*="M10.3232"]')) return true

      const txt = (el.textContent || '').trim().toLowerCase()
      const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase()
      const title = (el.getAttribute('title') || '').trim().toLowerCase()
      const labels = customLabels || PLUGIN_LABELS
      return labels.has(txt) || labels.has(aria) || labels.has(title) || labels.has(dataTab)
    }

    function findAndClickCard(doc) {
      for (const key of [PKG, 'dsh-subscriptions', '@goodandready/dsh-subscriptions']) {
        const card = doc.querySelector(`[data-plugin-package="${key}"]`) || doc.querySelector(`[data-plugin-item="${ROW_ID}"]`)
        if (card) {
          const open = [...card.querySelectorAll('button')].filter((b) => b.getAttribute('role') !== 'switch')
          const target = open.length >= 1 ? open[0] : card
          if (typeof target.click === 'function') {
            target.click()
            return true
          }
        }
      }
      return false
    }

    function openPluginSettings(doc = document, schedule = (run, ms) => window.setTimeout(run, ms), navCtx) {
      try {
        if (findAndClickCard(doc)) return

        const activeLabels = resolvePluginLabels(navCtx)
        const checkEl = (el) => matchesPluginLabel(el, activeLabels)

        const buttons = [...doc.querySelectorAll('button, a, div[role="button"], div[role="tab"]')]
        const panel = buttons.find(checkEl)
        if (panel) {
          panel.click()
          const poll = (left) => {
            if (findAndClickCard(doc)) return
            if (left > 0) schedule(() => poll(left - 1), 100)
          }
          schedule(() => poll(40), 100)
          return
        }

        const triggers = buttons.filter((b) => b.getAttribute('aria-haspopup') === 'dialog' && b.hasAttribute('aria-expanded'))
        if (triggers.length > 0) {
          const trigger = triggers.find((b) => b.getAttribute('aria-expanded') !== 'true') || triggers[0]
          if (trigger && typeof trigger.click === 'function') {
            trigger.click()
            const pollSection = (left) => {
              try {
                const section = [...doc.querySelectorAll('button, a, div[role="tab"], [role="button"]')].find(checkEl)
                if (section && typeof section.click === 'function') {
                  section.click()
                  const poll = (cLeft) => {
                    if (findAndClickCard(doc)) return
                    if (cLeft > 0) schedule(() => poll(cLeft - 1), 100)
                  }
                  schedule(() => poll(40), 100)
                  return
                }
              } catch { /* bestEffort */ }
              if (left > 0) schedule(() => pollSection(left - 1), 80)
            }
            schedule(() => pollSection(20), 80)
          }
        }
      } catch { /* bestEffort */ }
    }
    function SubsPill(props) {
      const t = (props && props.t) || ((k) => k)
      const [state, setState] = React.useState({ logged: [], usage: 0, accounts: [], open: false, active: null, loading: false })
      const [toasts, setToasts] = React.useState([])
      const lastAlertTsRef = React.useRef(Date.now() - 30000)

      const dismissToast = (id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }

      const pollAlerts = () => {
        fetch('/dsh-subscriptions/alerts?limit=5', { cache: 'no-store' })
          .then((res) => res.json())
          .then((data) => {
            if (data && Array.isArray(data.alerts)) {
              const fresh = data.alerts.filter((a) => a && a.timestamp > lastAlertTsRef.current)
              if (fresh.length > 0) {
                lastAlertTsRef.current = Math.max(...fresh.map((a) => a.timestamp))
                fresh.forEach((al) => {
                  const toastId = 't_' + al.timestamp + '_' + Math.random().toString(36).slice(2, 5)
                  const cls = al.severity === 'error' ? 'dsub-toast-bad' : (al.severity === 'info' ? 'dsub-toast-ok' : 'dsub-toast-warn')
                  const newToast = { id: toastId, message: al.message, cls }
                  setToasts((prev) => [newToast, ...prev].slice(0, 3))
                  setTimeout(() => dismissToast(toastId), 5000)
                })
              }
            }
          })
          .catch(() => {})
      }

      const pull = () => {
        setState((s) => Object.assign({}, s, { loading: true }))
        refreshLoggedIn().then((r) => {
          const logged = r.logged || []
          fetch('/dsh-subscriptions/config', { cache: 'no-store' })
            .then((res) => res.json())
            .then((cfg) => {
              setState((s) => Object.assign({}, s, { logged, usage: r.usage, accounts: (cfg && cfg.accounts) || [], active: r.active, loading: false }))
            })
            .catch(() => {
              setState((s) => Object.assign({}, s, { logged, usage: r.usage, accounts: [], active: r.active, loading: false }))
            })
        }).catch(() => {
          setState((s) => Object.assign({}, s, { loading: false }))
        })
      }

      React.useEffect(() => {
        pull()
        pollAlerts()
        const id = setInterval(() => { pull(); pollAlerts(); }, 25 * 1000)
        return () => clearInterval(id)
      }, [])

      React.useEffect(() => {
        if (!state.open) return undefined
        const onKey = (e) => { if (e.key === 'Escape') setState((s) => Object.assign({}, s, { open: false })) }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [state.open])

      const n = state.logged.length
      const total = state.accounts.length || n
      const led = n === 0 ? 'dsub-ledOff' : (state.usage >= 90 ? 'dsub-ledBad' : (state.usage >= 50 ? 'dsub-ledWarn' : 'dsub-ledOk'))
      const now = Date.now()

      // Header Pill Label
      let pillText = t('subsPill') + ' (' + n + ')'
      if (state.active) {
        const a = state.active
        const wins = Array.isArray(a.windows) ? a.windows : []
        const winStr = wins.map((w) => {
          let s = (w.label || w.id) + ' ' + Math.round(w.usedPercent) + '%'
          if (w.resetAt && w.resetAt > now) {
            s += ' (' + formatRelativeReset(w.resetAt, t, now) + ')'
          }
          return s
        }).join(' ')
        const provName = a.provider ? (a.provider.charAt(0).toUpperCase() + a.provider.slice(1)) : ''
        pillText = (a.provider === 'codex' && a.fastMode ? '⚡ ' : '') + provName + (winStr ? ' · ' + winStr : (a.usagePercent != null ? ' · ' + Math.round(a.usagePercent) + '%' : ''))
      }

      // Active Hero Card Renderer
      const renderActiveHero = () => {
        if (!state.active) return null
        const a = state.active
        const b = brandBadge(a.provider)
        const wins = Array.isArray(a.windows) ? a.windows : []
        const primaryWin = wins.find((w) => (w.label || w.id) === '5h') || wins[0]
        const secWin = wins.find((w) => (w.label || w.id) === '7d') || wins[1]
        const primPct = primaryWin && primaryWin.usedPercent != null ? Math.round(primaryWin.usedPercent) : (a.usagePercent != null ? Math.round(a.usagePercent) : 0)
        const secPct = secWin && secWin.usedPercent != null ? Math.round(secWin.usedPercent) : null

        return React.createElement('div', { className: 'dsub-heroCard' },
          React.createElement('div', { className: 'dsub-heroHead' },
            React.createElement('div', { className: 'dsub-heroTitle' },
              React.createElement('span', { className: 'dsub-brandBadge ' + b.cls, style: { width: 24, height: 24, fontSize: 11 } }, b.icon),
              React.createElement('span', null, (a.provider ? a.provider.toUpperCase() : 'LLM') + (a.index ? ' #' + a.index : '')),
              a.fastMode ? React.createElement('span', { className: 'dsub-pillTag', style: { background: 'color-mix(in srgb,var(--dsw-alias-state-warn-primary) 15%,transparent)', color: 'var(--dsw-alias-state-warn-primary)' } }, '⚡ FAST 1.5x') : null,
            ),
            React.createElement('span', { className: 'dsub-heroModel' }, a.model || 'active model'),
          ),
          React.createElement('div', { className: 'dsub-heroBars' },
            React.createElement('div', null,
              React.createElement('div', { className: 'dsub-barLabelRow' },
                React.createElement('span', { style: { fontWeight: 600 } }, ((primaryWin && primaryWin.label) ? t('subsWindowNamed', { label: primaryWin.label }) : t('subs5hWindow')) + (primaryWin && primaryWin.resetAt ? ' (' + formatRelativeReset(primaryWin.resetAt, t, now) + ')' : '')),
                React.createElement('span', { style: { fontVariantNumeric: 'tabular-nums', fontWeight: 600 } }, primPct + '% ' + t('subsUsed') + ' (' + (100 - primPct) + '% ' + t('subsFree') + ')'),
              ),
              React.createElement('div', { className: 'dsub-barTrack' },
                React.createElement('div', {
                  className: 'dsub-barFillGrad',
                  style: {
                    width: Math.min(100, Math.max(0, primPct)) + '%',
                    background: primPct >= 90 ? 'var(--dsw-alias-state-error-primary)' : (primPct >= 50 ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-state-success-primary)'),
                  },
                }),
              ),
            ),
            secWin ? React.createElement('div', null,
              React.createElement('div', { className: 'dsub-barLabelRow' },
                React.createElement('span', null, t('subsWindowNamed', { label: secWin.label || '7d' }) + (secWin && secWin.resetAt ? ' (' + formatRelativeReset(secWin.resetAt, t, now) + ')' : '')),
                React.createElement('span', { style: { fontVariantNumeric: 'tabular-nums' } }, secPct + '%'),
              ),
              React.createElement('div', { className: 'dsub-barTrack' },
                React.createElement('div', {
                  className: 'dsub-barFillGrad',
                  style: {
                    width: Math.min(100, Math.max(0, secPct)) + '%',
                    background: secPct >= 90 ? 'var(--dsw-alias-state-error-primary)' : (secPct >= 50 ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-brand-primary)'),
                  },
                }),
              ),
            ) : null,
          ),
        )
      }

      // Accounts list
      const rows = state.accounts.map((a, i) => {
        const isLogged = state.logged.includes(a.provider)
        const cooled = a.cooldownUntil && a.cooldownUntil > now
        const quarantined = Boolean(a.quarantineReason) && Number(a.quarantineUntil || 0) > now
        const pct = a.usagePercent != null ? Math.round(a.usagePercent) : null
        const b = brandBadge(a.provider)
        const isActiveThis = state.active && state.active.provider === a.provider && state.active.index === a.index

        let statusClass = 'dsub-statusOff'
        let statusText = t('subsNotLogged')
        if (quarantined) {
          statusClass = 'dsub-statusBad'
          statusText = a.quarantineReason === 'VERIFY' ? t('verifyAccount') : String(a.quarantineReason)
        } else if (cooled) {
          statusClass = 'dsub-statusWarn'
          // Only some model families may be cooled down - say which ones.
          statusText = t('subsCooldown') + (Array.isArray(a.cooldownFamilies) && a.cooldownFamilies.length ? ' · ' + a.cooldownFamilies.join('/') : '')
        } else if (isLogged) {
          if (pct >= 90) { statusClass = 'dsub-statusBad'; statusText = '90%+ ' + t('subsUsed') }
          else if (pct >= 50) { statusClass = 'dsub-statusWarn'; statusText = pct + '% ' + t('subsUsed') }
          else { statusClass = 'dsub-statusOk'; statusText = (pct != null ? pct + '% · ' : '') + t('subsLogged') }
        }

        return React.createElement('div', { className: 'dsub-accountCard', key: i },
          React.createElement('div', { className: 'dsub-brandBadge ' + b.cls }, b.icon),
          React.createElement('div', { className: 'dsub-accInfo' },
            React.createElement('div', { className: 'dsub-accNameRow' },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                React.createElement('span', { className: 'dsub-accName' }, a.provider.toUpperCase() + (a.index ? ' #' + a.index : '')),
                isActiveThis ? React.createElement('span', { className: 'dsub-pillTag', style: { background: 'color-mix(in srgb,var(--dsw-alias-state-success-primary) 15%,transparent)', color: 'var(--dsw-alias-state-success-primary)' } }, 'ACTIVE') : null,
                a.proxy ? React.createElement('span', { className: 'dsub-dim', title: a.proxy }, '🌐 proxy') : null,
              ),
              React.createElement('span', { className: 'dsub-accStatusTag ' + statusClass, role: 'status', 'aria-live': 'polite' }, statusText),
            ),
            (isLogged && pct != null) ? React.createElement('div', { className: 'dsub-barTrack', style: { marginTop: 4, height: 4 } },
              React.createElement('div', {
                className: 'dsub-barFillGrad',
                style: {
                  width: Math.min(100, Math.max(0, pct)) + '%',
                  background: pct >= 90 ? 'var(--dsw-alias-state-error-primary)' : (pct >= 50 ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-state-success-primary)'),
                },
              }),
            ) : null,
          ),
        )
      })

      return React.createElement(React.Fragment, null,
        toasts.length > 0 ? React.createElement('div', { className: 'dsub-toast-container' },
          toasts.map((toast) => React.createElement('div', { className: 'dsub-toast ' + toast.cls, key: toast.id },
            React.createElement('span', null, toast.message),
            React.createElement('button', {
              type: 'button',
              className: 'dsub-toast-close',
              onClick: () => dismissToast(toast.id),
            }, "\u00d7"),
          ))
        ) : null,
        React.createElement('button', {
          type: 'button',
          className: 'dsub-pill',
          'aria-expanded': state.open ? 'true' : 'false',
          title: t('subsPill') + ': ' + (n > 0 ? (n + ' ' + t('connected')) : t('notConnected')),
          onClick: () => setState((s) => Object.assign({}, s, { open: !s.open })),
        },
          React.createElement('span', { className: 'dsub-led ' + led }),
          React.createElement('span', null, pillText),
          React.createElement('span', { style: { fontSize: 9, opacity: 0.6, marginLeft: 2 } }, '▼'),
        ),
        state.open ? React.createElement('div', {
          className: 'dsub-modalWrap',
          onClick: (e) => { if (e.target === e.currentTarget) setState((s) => Object.assign({}, s, { open: false })) },
        },
          React.createElement('div', { className: 'dsub-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('subsModalTitle') },
            React.createElement('div', { className: 'dsub-modalHead' },
              React.createElement('div', { className: 'dsub-modalTitleWrap' },
                React.createElement('div', { className: 'dsub-modalIcon' }, '⚡'),
                React.createElement('div', null,
                  React.createElement('div', { style: { fontWeight: 700, fontSize: 15 } }, t('subsModalTitle')),
                  React.createElement('div', { className: 'dsub-dim' }, n + ' of ' + total + ' ' + t('connected')),
                ),
              ),
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                React.createElement('button', {
                  type: 'button',
                  className: 'dsub-mini',
                  title: t('subsRefresh'),
                  onClick: () => pull(),
                }, state.loading ? '…' : '🔄'),
                React.createElement('button', {
                  type: 'button',
                  className: 'dsub-mini',
                  autoFocus: true,
                  'aria-label': t('closeModal'),
                  onClick: () => setState((s) => Object.assign({}, s, { open: false })),
                }, '✕'),
              ),
            ),
            renderActiveHero(),
            React.createElement('div', { className: 'dsub-poolTitle' }, t('subsPoolTitle')),
            rows.length ? rows : React.createElement('div', { className: 'dsub-sub', style: { padding: '12px 0' } }, t('subsNotLogged')),
            React.createElement('div', { className: 'dsub-modalFoot' },
              React.createElement('span', { className: 'dsub-dim' }, 'Tracy Subscriptions'),
              React.createElement('a', {
                className: 'dsub-btnSec',
                href: '#',
                onClick: (e) => {
                  e.preventDefault()
                  setState((s) => Object.assign({}, s, { open: false }))
                  const clientCtx = props.ctx || window.__dshCtx

                  try {
                    const nav = (clientCtx && clientCtx.pluginNavigation) || (window.__dshCtx && window.__dshCtx.pluginNavigation)
                    if (nav && typeof nav.openBundle === 'function') {
                      nav.openBundle(PKG)
                    }
                  } catch { /* bestEffort */ }

                  try {
                    const layout = (clientCtx && clientCtx.layout) || (window.__dshCtx && window.__dshCtx.layout)
                    if (layout && typeof layout.selectPanel === 'function') {
                      layout.selectPanel('plugins')
                    }
                  } catch { /* bestEffort */ }

                  openPluginSettings(document, undefined, clientCtx)
                },
              }, t('subsOpenSettings')),
            ),
          ),
        ) : null,
      )
    }

    function registerSubsPill(ctx) {
      ctx.effect(() => {
        ctx.slots.inject('conversation.session.header.actions', () =>
          ctx.slots.register(
            {
              name: 'conversation.session.header.actions',
              id: 'dsh-subscriptions-subs-pill',
              order: 15,
              locale: NS,
            },
            () => React.createElement(ErrorBoundary, null, React.createElement(SubsPill, { t, ctx })),
          ),
        )
      }, 'dsh-subscriptions: subs pill')
    }

    function registerComposerQuota(ctx) {
      ctx.effect(() => {
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.right',
              id: 'dsh-subscriptions-composer-quota',
              order: 5,
              locale: NS,
            },
            () => React.createElement(ErrorBoundary, null, React.createElement(ComposerQuota, { t })),
          ),
        )
      }, 'dsh-subscriptions: composer quota')
    }

    function registerSlashCommands(ctx) {
      ctx.effect(() => {
        const triggers = ctx.get('inputTriggers')
        if (!triggers) return () => {}
        const providerMatch = new RegExp('^(' + ORDER.join('|') + ')$')
        const run = (cmd, line) => {
          const args = (line.trim().replace(/^\/\S+\s*/, '')).split(/\s+/).filter(Boolean)
          const prov = args[0]
          if (cmd === 'logout') {
            if (!prov || !providerMatch.test(prov)) return
            fetch('/dsh-subscriptions/logout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ provider: prov, index: 1 }),
            }).catch(() => {})
            return
          }
          if (cmd === 'status' || (cmd === 'login' && prov === 'status')) { refreshLoggedIn().catch(() => {}); return }
          // login <provider>
          if (!prov || !providerMatch.test(prov)) return
          fetch('/dsh-subscriptions/oauth/start?provider=' + encodeURIComponent(prov) + '&index=1', { cache: 'no-store' })
            .then((r) => r.json()).then((data) => {
              if (data && data.url) window.open(data.url, '_blank', 'noopener')
            }).catch(() => {})
        }
        const line = (line) => line.trim()
        const sources = [
          { name: 'login', description: t('slashLogin') },
          { name: 'logout', description: t('slashLogout') },
        ]
        const disposers = sources.map((src) =>
          triggers.registerSource({
            trigger: '/',
            name: src.name,
            order: 40,
            description: src.description,
            candidates: (_s, req) => {
              if (req.position !== 'leading') return Promise.resolve([])
              const q = req.query.trim().toLowerCase()
              const name = src.name
              if (q !== '' && !name.startsWith(q)) return Promise.resolve([])
              return Promise.resolve([{ name, description: src.description }])
            },
            matchEnter: (_session, l) => {
              const t2 = line(l)
              const tok = t2.split(/\s+/)[0]
              if (tok !== '/' + src.name) return Promise.resolve(undefined)
              // '/login status' surfaces the connected providers as composer text.
              if (src.name === 'login' && /\bstatus\b/.test(t2)) {
                return refreshLoggedIn().then((logged) =>
                  ({ text: logged.length ? t('loginStatus', { providers: logged.join(', ') }) : t('loginStatusNone') }))
              }
              run(src.name, t2)
              return Promise.resolve('handled')
            },
          }),
        )
        return () => { for (const off of disposers) off() }
      }, 'dsh-subscriptions: slash commands')
    }

    // Surface options set by the embedding host (cardPlacement, headerPill,
    // slashCommands). A host without the /ui door gets the upstream surfaces.
    const DEFAULT_UI = { cardPlacement: 'plugins', headerPill: true, slashCommands: true }
    function readUiOptions() {
      return fetch('/dsh-subscriptions/ui', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => Object.assign({}, DEFAULT_UI, (data && data.ui) || {}))
        .catch(() => DEFAULT_UI)
    }

    exports.inject = ['slots', 'locale', 'sessions']
    exports.apply = function apply(ctx) {
      if (typeof window !== 'undefined') {
        window.__dshCtx = ctx
      }
      setT(ctx.locale.bind(NS))
      try {
        ctx.inject(['pluginNavigation'], (navCtx) => {
          ctx.pluginNavigation = navCtx.pluginNavigation
        })
      } catch { /* optional */ }
      try {
        ctx.inject(['layout'], (layoutCtx) => {
          ctx.layout = layoutCtx.layout
        })
      } catch { /* optional */ }
      registerLocales(ctx)
      let live = true
      ctx.effect(() => () => { live = false }, 'dsh-subscriptions: surface options')
      readUiOptions().then((ui) => {
        if (!live) return
        registerSettings(ctx, ui.cardPlacement)
        // Alert toasts render inside the pill, so headerPill: false hides them too.
        if (ui.headerPill) registerSubsPill(ctx)
        registerComposerQuota(ctx)
        if (ui.slashCommands) registerSlashCommands(ctx)
      })
    }
    return module.exports
  },
})
