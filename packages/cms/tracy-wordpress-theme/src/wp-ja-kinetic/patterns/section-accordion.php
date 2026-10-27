<?php
/**
 * Title: FAQ accordion
 * Slug: wp-ja-kinetic/section-accordion
 * Description: Eyebrow, heading and a column of native disclosure rows, each opening on its own, with an optional mono category heading starting a fresh group. Every spec section of type `accordion`.
 * Categories: wp-ja-kinetic, tracy
 * Block Types: core/details
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: accordion, faq, questions, details, disclosure, acm
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"section","className":"ja-acm acm-accordion style-1"} -->
<section class="wp-block-group ja-acm acm-accordion style-1">
<!-- wp:group {"className":"hx-section"} -->
<div class="wp-block-group hx-section">
<!-- wp:group {"className":"hx-container hx-pad"} -->
<div class="wp-block-group hx-container hx-pad">
<!-- wp:group {"className":"hx-faq-head"} -->
<div class="wp-block-group hx-faq-head">
<!-- wp:paragraph {"className":"hx-eyebrow","metadata":{"role":"content","name":"accordion.eyebrow"}} -->
<p class="hx-eyebrow"><?php esc_html_e( '// pricing faq', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"hx-h2","metadata":{"role":"content","name":"accordion.title"}} -->
<h2 class="wp-block-heading hx-h2"><?php esc_html_e( 'Pricing questions', 'wp-ja-kinetic' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-faq-sub","metadata":{"role":"content","name":"accordion.sub"}} -->
<p class="hx-faq-sub"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-faq-list"} -->
<div class="wp-block-group hx-faq-list">
<!-- wp:group {"metadata":{"name":"accordion.row.1"}} -->
<div class="wp-block-group">
<!-- wp:paragraph {"className":"hx-faq-group","metadata":{"role":"content","name":"accordion.group.1"}} -->
<p class="hx-faq-group"><?php esc_html_e( 'Plans & Billing', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:details {"className":"hx-faq-item","metadata":{"role":"content","name":"accordion.item.1"}} -->
<details class="wp-block-details hx-faq-item"><summary><?php esc_html_e( 'How does usage-based pricing work?', 'wp-ja-kinetic' ); ?></summary><!-- wp:group {"className":"hx-faq-a"} -->
<div class="wp-block-group hx-faq-a"><!-- wp:paragraph {"className":"acm-accordion-answer","metadata":{"role":"content","name":"accordion.a.1"}} -->
<p class="acm-accordion-answer"><?php esc_html_e( 'You pay for data ingested and queried, billed monthly. No per-seat fees -- invite your whole team. Overages are a flat per-GB rate.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
<!-- wp:group {"metadata":{"name":"accordion.row.2"}} -->
<div class="wp-block-group">
<!-- wp:details {"className":"hx-faq-item","metadata":{"role":"content","name":"accordion.item.2"}} -->
<details class="wp-block-details hx-faq-item"><summary><?php esc_html_e( 'Can I change plans at any time?', 'wp-ja-kinetic' ); ?></summary><!-- wp:group {"className":"hx-faq-a"} -->
<div class="wp-block-group hx-faq-a"><!-- wp:paragraph {"className":"acm-accordion-answer","metadata":{"role":"content","name":"accordion.a.2"}} -->
<p class="acm-accordion-answer"><?php esc_html_e( 'Yes. Upgrade or downgrade at any billing cycle boundary with no penalty. Changes take effect on the next invoice.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
<!-- wp:group {"metadata":{"name":"accordion.row.3"}} -->
<div class="wp-block-group">
<!-- wp:details {"className":"hx-faq-item","metadata":{"role":"content","name":"accordion.item.3"}} -->
<details class="wp-block-details hx-faq-item"><summary><?php esc_html_e( 'Do you offer annual discounts?', 'wp-ja-kinetic' ); ?></summary><!-- wp:group {"className":"hx-faq-a"} -->
<div class="wp-block-group hx-faq-a"><!-- wp:paragraph {"className":"acm-accordion-answer","metadata":{"role":"content","name":"accordion.a.3"}} -->
<p class="acm-accordion-answer"><?php esc_html_e( 'Yes. Annual plans include a 20% discount versus monthly billing. Contact sales to get your annual contract.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
<!-- wp:group {"metadata":{"name":"accordion.row.4"}} -->
<div class="wp-block-group">
<!-- wp:paragraph {"className":"hx-faq-group","metadata":{"role":"content","name":"accordion.group.4"}} -->
<p class="hx-faq-group"><?php esc_html_e( 'Data & Retention', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:details {"className":"hx-faq-item","metadata":{"role":"content","name":"accordion.item.4"}} -->
<details class="wp-block-details hx-faq-item"><summary><?php esc_html_e( 'Where is my data stored?', 'wp-ja-kinetic' ); ?></summary><!-- wp:group {"className":"hx-faq-a"} -->
<div class="wp-block-group hx-faq-a"><!-- wp:paragraph {"className":"acm-accordion-answer","metadata":{"role":"content","name":"accordion.a.4"}} -->
<p class="acm-accordion-answer"><?php esc_html_e( 'Data is stored in SOC 2-certified data centres in the EU and US. Region selection is available on Team and Enterprise plans.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
<!-- wp:group {"metadata":{"name":"accordion.row.5"}} -->
<div class="wp-block-group">
<!-- wp:details {"className":"hx-faq-item","metadata":{"role":"content","name":"accordion.item.5"}} -->
<details class="wp-block-details hx-faq-item"><summary><?php esc_html_e( 'How long is data retained?', 'wp-ja-kinetic' ); ?></summary><!-- wp:group {"className":"hx-faq-a"} -->
<div class="wp-block-group hx-faq-a"><!-- wp:paragraph {"className":"acm-accordion-answer","metadata":{"role":"content","name":"accordion.a.5"}} -->
<p class="acm-accordion-answer"><?php esc_html_e( 'Free and Team plans retain data for 30 days. Enterprise plans support custom retention periods of up to 2 years.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
<!-- wp:group {"metadata":{"name":"accordion.row.6"}} -->
<div class="wp-block-group">
<!-- wp:details {"className":"hx-faq-item","metadata":{"role":"content","name":"accordion.item.6"}} -->
<details class="wp-block-details hx-faq-item"><summary><?php esc_html_e( 'Can I export my data?', 'wp-ja-kinetic' ); ?></summary><!-- wp:group {"className":"hx-faq-a"} -->
<div class="wp-block-group hx-faq-a"><!-- wp:paragraph {"className":"acm-accordion-answer","metadata":{"role":"content","name":"accordion.a.6"}} -->
<p class="acm-accordion-answer"><?php esc_html_e( 'Yes. You can export any dataset as JSON, CSV, or Parquet at any time from the Kinetic dashboard or via the API.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
<!-- wp:group {"metadata":{"name":"accordion.row.7"}} -->
<div class="wp-block-group">
<!-- wp:paragraph {"className":"hx-faq-group","metadata":{"role":"content","name":"accordion.group.7"}} -->
<p class="hx-faq-group"><?php esc_html_e( 'Security & Compliance', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:details {"className":"hx-faq-item","metadata":{"role":"content","name":"accordion.item.7"}} -->
<details class="wp-block-details hx-faq-item"><summary><?php esc_html_e( 'Is Kinetic SOC 2 compliant?', 'wp-ja-kinetic' ); ?></summary><!-- wp:group {"className":"hx-faq-a"} -->
<div class="wp-block-group hx-faq-a"><!-- wp:paragraph {"className":"acm-accordion-answer","metadata":{"role":"content","name":"accordion.a.7"}} -->
<p class="acm-accordion-answer"><?php esc_html_e( 'Yes. Kinetic is SOC 2 Type II certified. Audit reports are available to Team and Enterprise customers on request.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
<!-- wp:group {"metadata":{"name":"accordion.row.8"}} -->
<div class="wp-block-group">
<!-- wp:details {"className":"hx-faq-item","metadata":{"role":"content","name":"accordion.item.8"}} -->
<details class="wp-block-details hx-faq-item"><summary><?php esc_html_e( 'Do you support SSO and SCIM?', 'wp-ja-kinetic' ); ?></summary><!-- wp:group {"className":"hx-faq-a"} -->
<div class="wp-block-group hx-faq-a"><!-- wp:paragraph {"className":"acm-accordion-answer","metadata":{"role":"content","name":"accordion.a.8"}} -->
<p class="acm-accordion-answer"><?php esc_html_e( 'Yes. Single sign-on via SAML 2.0 and SCIM directory provisioning are available on Enterprise plans.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
<!-- wp:group {"metadata":{"name":"accordion.row.9"}} -->
<div class="wp-block-group">
<!-- wp:paragraph {"className":"hx-faq-group","metadata":{"role":"content","name":"accordion.group.9"}} -->
<p class="hx-faq-group"><?php esc_html_e( 'Getting Started', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:details {"className":"hx-faq-item","metadata":{"role":"content","name":"accordion.item.9"}} -->
<details class="wp-block-details hx-faq-item"><summary><?php esc_html_e( 'How quickly can I get data flowing?', 'wp-ja-kinetic' ); ?></summary><!-- wp:group {"className":"hx-faq-a"} -->
<div class="wp-block-group hx-faq-a"><!-- wp:paragraph {"className":"acm-accordion-answer","metadata":{"role":"content","name":"accordion.a.9"}} -->
<p class="acm-accordion-answer"><?php esc_html_e( 'Most teams see their first traces within ten minutes. Point your OpenTelemetry exporter at our endpoint and data starts landing immediately — no agent rollout required.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
<!-- wp:group {"metadata":{"name":"accordion.row.10"}} -->
<div class="wp-block-group">
<!-- wp:details {"className":"hx-faq-item","metadata":{"role":"content","name":"accordion.item.10"}} -->
<details class="wp-block-details hx-faq-item"><summary><?php esc_html_e( 'Do I need to install an agent?', 'wp-ja-kinetic' ); ?></summary><!-- wp:group {"className":"hx-faq-a"} -->
<div class="wp-block-group hx-faq-a"><!-- wp:paragraph {"className":"acm-accordion-answer","metadata":{"role":"content","name":"accordion.a.10"}} -->
<p class="acm-accordion-answer"><?php esc_html_e( 'No. Kinetic ingests standard OpenTelemetry over OTLP, so if you are already instrumented you just change the endpoint. A lightweight collector is optional for host metrics.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
<!-- wp:group {"metadata":{"name":"accordion.row.11"}} -->
<div class="wp-block-group">
<!-- wp:details {"className":"hx-faq-item","metadata":{"role":"content","name":"accordion.item.11"}} -->
<details class="wp-block-details hx-faq-item"><summary><?php esc_html_e( 'Can I import my existing dashboards?', 'wp-ja-kinetic' ); ?></summary><!-- wp:group {"className":"hx-faq-a"} -->
<div class="wp-block-group hx-faq-a"><!-- wp:paragraph {"className":"acm-accordion-answer","metadata":{"role":"content","name":"accordion.a.11"}} -->
<p class="acm-accordion-answer"><?php esc_html_e( 'Yes. Dashboards-as-code lets you import existing Grafana JSON, and our converter maps most panels automatically. You can then version them in git.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
<!-- wp:group {"metadata":{"name":"accordion.row.12"}} -->
<div class="wp-block-group">
<!-- wp:paragraph {"className":"hx-faq-group","metadata":{"role":"content","name":"accordion.group.12"}} -->
<p class="hx-faq-group"><?php esc_html_e( 'Integrations', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:details {"className":"hx-faq-item","metadata":{"role":"content","name":"accordion.item.12"}} -->
<details class="wp-block-details hx-faq-item"><summary><?php esc_html_e( 'Which languages and frameworks do you support?', 'wp-ja-kinetic' ); ?></summary><!-- wp:group {"className":"hx-faq-a"} -->
<div class="wp-block-group hx-faq-a"><!-- wp:paragraph {"className":"acm-accordion-answer","metadata":{"role":"content","name":"accordion.a.12"}} -->
<p class="acm-accordion-answer"><?php esc_html_e( 'Node.js, Python, Go, Java, Ruby and Rust have first-class SDKs, and anything that speaks OTLP works out of the box — including most service meshes.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
<!-- wp:group {"metadata":{"name":"accordion.row.13"}} -->
<div class="wp-block-group">
<!-- wp:details {"className":"hx-faq-item","metadata":{"role":"content","name":"accordion.item.13"}} -->
<details class="wp-block-details hx-faq-item"><summary><?php esc_html_e( 'Does Kinetic work with OpenTelemetry?', 'wp-ja-kinetic' ); ?></summary><!-- wp:group {"className":"hx-faq-a"} -->
<div class="wp-block-group hx-faq-a"><!-- wp:paragraph {"className":"acm-accordion-answer","metadata":{"role":"content","name":"accordion.a.13"}} -->
<p class="acm-accordion-answer"><?php esc_html_e( 'Completely. Kinetic is OpenTelemetry-native for metrics, logs and traces; there is no proprietary agent to adopt and no lock-in.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
<!-- wp:group {"metadata":{"name":"accordion.row.14"}} -->
<div class="wp-block-group">
<!-- wp:details {"className":"hx-faq-item","metadata":{"role":"content","name":"accordion.item.14"}} -->
<details class="wp-block-details hx-faq-item"><summary><?php esc_html_e( 'Can I connect PagerDuty and Slack?', 'wp-ja-kinetic' ); ?></summary><!-- wp:group {"className":"hx-faq-a"} -->
<div class="wp-block-group hx-faq-a"><!-- wp:paragraph {"className":"acm-accordion-answer","metadata":{"role":"content","name":"accordion.a.14"}} -->
<p class="acm-accordion-answer"><?php esc_html_e( 'Yes. Alert routing ships with native PagerDuty and Slack destinations, plus generic webhooks for anything else in your on-call stack.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></details>
<!-- /wp:details -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
