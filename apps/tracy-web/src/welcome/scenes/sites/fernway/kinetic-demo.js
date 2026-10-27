/*
 * JA Kinetic's own demo homepage, as the content of the shared Kinetic layout in site.js. The Add site wizard's
 * design system step previews this page (the template is chosen, Customize has not happened yet), so no Fernway
 * name, logo or text appears here. Copy follows the template's demo captures in img/hero-showcase
 * (preview-ja-kinetic-home*.webp), rewritten without dashes.
 */
(function () {
  'use strict';
  var mark = '<svg class="fw-kinetic-mark" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16 9.5 4l2.5 6 4-3.5M9 12l3 4.5"/></svg>';
  window.TracySiteContents = window.TracySiteContents || {};
  window.TracySiteContents.kinetic = {
    name: 'Kinetic',
    logo: function (cls) { return '<span class="fw-logo fw-logo-text ' + (cls || '') + '">' + mark + '<b>Kinetic</b></span>'; },
    nav: [['Home', true, true], ['Product', true], ['Pricing'], ['Company', true], ['Pages', true]],
    signIn: 'Sign in', headButton: 'Start free',
    eyebrow: '// Observability, reimagined', title: 'Ship fast. Sleep through the night.',
    sub: 'Kinetic unifies metrics, logs and traces into one on-call workflow, so you find the failing span before your users do.',
    primary: 'Start free', ghost: '<b>$</b> kinetic init', trust: 'Trusted by 2,000+ on-call teams',
    panelTitle: 'kinetic tail --service=checkout-api',
    rows: [['checkout-api', 'INFO', '84ms', '200', '14:32:01'], ['cart-api', 'INFO', '112ms', '200', '14:32:01'], ['payment-api', 'WARN', '503ms', 'retry 1/3', '14:32:02'],
      ['payment-api', 'ERROR', '410ms', 'gateway timeout', '14:32:02'], ['payment-api', 'INFO', '410ms', '200', '14:32:03']],
    panelFoot: '1.2M events / min',
    clientsLabel: 'Trusted by engineering teams shipping at scale',
    clients: ['Vercel', 'Linear', 'Supabase', 'Retool', 'Ramp', 'Loom'],
    ticker: ['OpenTelemetry native', 'Zero seat fees', '30 day hot retention', 'Tail based sampling', '1.2M events per minute', 'SOC 2 Type II'],
    servicesEyebrow: '(01) / What you get', servicesTitle: 'One platform for every signal',
    servicesLead: 'Logs, metrics and traces share one schema and one query, so the correlation is already there when an alert fires.',
    cards: [
      ['Unified telemetry', 'One timeline for every signal', 'Logs, metrics and traces land in the same store, so a spike links straight to the request that caused it.', ['Logs', 'Metrics', 'Traces', 'Profiles']],
      ['Smart alerting', 'Alerts that page the right person', 'Baselines learn your traffic, so the pager stays quiet until something really changes.'],
      ['Query speed', '&lt;400ms', 'Median query time across 30 days of hot data, on every plan.', null, true],
      ['Incidents', 'From alert to resolved in four moves', 'Open the alert, follow the span, roll back the deploy, write the note. All from one screen.', null, false,
        [['Resolved', 'p99 spike on checkout'], ['Resolved', 'Cart cache misses'], ['Open', 'Payment gateway timeouts', true]]]
    ],
    pricingTitle: 'Pricing', pricingMeta: '3 plans · no seat fees',
    plans: [
      ['Hobby', '$0', 'For side projects and first services.', ['One project', '7 day retention', 'Community support', 'All signal types'], 'Start free', false],
      ['Team', '$29', 'For teams on call every week.', ['Everything in Hobby', '30 day retention', 'Smart alerting', 'Slack and pager hooks'], 'Start a trial', true],
      ['Scale', '$99', 'For platforms with many services.', ['Everything in Team', 'Tail based sampling', 'SSO and audit log', 'Priority support'], 'Talk to sales', false]
    ],
    ctaEyebrow: '// Start now', ctaTitle: 'Find the failing span first.', ctaText: 'Free for 14 days. No card needed.',
    ctaPrimary: 'Start free', ctaGhost: 'Book a demo',
    about: 'Kinetic unifies metrics, logs and traces for on-call teams.',
    columns: [['Product', ['Metrics', 'Logs', 'Traces', 'Alerting']], ['Company', ['About', 'Careers', 'Blog']], ['Contact', ['hello@kinetic.example', 'Status page', 'Docs']]],
    base: ['© 2026 Kinetic', 'Privacy · Terms']
  };
})();
