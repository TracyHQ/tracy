<?php
/**
 * Title: Incident timeline
 * Slug: wp-ja-kinetic/section-incident-timeline
 * Description: A four-column timeline joined by a rule: every cell is a node icon, a timestamp, a phase, an optional badge, a title and a line of copy. Every spec section of type `incident-timeline`.
 * Categories: wp-ja-kinetic, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: timeline, incident, steps, journey, changelog, releases, acm
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"section","className":"ja-acm acm-incident-timeline style-1"} -->
<section class="wp-block-group ja-acm acm-incident-timeline style-1">
<!-- wp:group {"className":"hx-section"} -->
<div class="wp-block-group hx-section">
<!-- wp:group {"className":"hx-container hx-pad acm-incident-inner"} -->
<div class="wp-block-group hx-container hx-pad acm-incident-inner">
<!-- wp:group {"className":"acm-incident-head"} -->
<div class="wp-block-group acm-incident-head">
<!-- wp:paragraph {"className":"hx-eyebrow","metadata":{"role":"content","name":"incident-timeline.eyebrow"}} -->
<p class="hx-eyebrow"><?php esc_html_e( '// anatomy of an incident', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"hx-h2","metadata":{"role":"content","name":"incident-timeline.title"}} -->
<h2 class="wp-block-heading hx-h2"><?php esc_html_e( 'From alert to resolved in four moves', 'wp-ja-kinetic' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-incident hx-cols-4","metadata":{"name":"incident-timeline.columns"}} -->
<div class="wp-block-group hx-incident hx-cols-4">
<!-- wp:group {"className":"hx-inc-cell","metadata":{"name":"incident-timeline.item.1"}} -->
<div class="wp-block-group hx-inc-cell">
<!-- wp:group {"tagName":"span","className":"hx-inc-line"} -->
<span class="wp-block-group hx-inc-line"></span>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-head"} -->
<div class="wp-block-group hx-inc-head">
<!-- wp:group {"className":"hx-inc-node hx-ico-zap","metadata":{"name":"incident-timeline.step_icon.1"}} -->
<div class="wp-block-group hx-inc-node hx-ico-zap"></div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-time","metadata":{"role":"content","name":"incident-timeline.step_time.1"}} -->
<p class="hx-inc-time"><?php esc_html_e( 'v3.4', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-phase","metadata":{"role":"content","name":"incident-timeline.step_phase.1"}} -->
<p class="hx-inc-phase"><?php esc_html_e( 'Jun 2026', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-inc-badge"} -->
<div class="wp-block-group hx-inc-badge">
<!-- wp:paragraph {"className":"hx-inc-badge-l","metadata":{"role":"content","name":"incident-timeline.step_badge.1"}} -->
<p class="hx-inc-badge-l"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:heading {"level":4,"className":"hx-inc-title","metadata":{"role":"content","name":"incident-timeline.step_title.1"}} -->
<h4 class="wp-block-heading hx-inc-title"><?php esc_html_e( 'Tail-based sampling, generally available', 'wp-ja-kinetic' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-inc-text","metadata":{"role":"content","name":"incident-timeline.step_text.1"}} -->
<p class="hx-inc-text"><?php esc_html_e( 'Keep 100% of error and slow traces while sampling the rest. Configure per-service retention rules from the UI — no agent redeploy required.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-cell","metadata":{"name":"incident-timeline.item.2"}} -->
<div class="wp-block-group hx-inc-cell">
<!-- wp:group {"tagName":"span","className":"hx-inc-line"} -->
<span class="wp-block-group hx-inc-line"></span>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-head"} -->
<div class="wp-block-group hx-inc-head">
<!-- wp:group {"className":"hx-inc-node hx-ico-search","metadata":{"name":"incident-timeline.step_icon.2"}} -->
<div class="wp-block-group hx-inc-node hx-ico-search"></div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-time","metadata":{"role":"content","name":"incident-timeline.step_time.2"}} -->
<p class="hx-inc-time"><?php esc_html_e( 'v3.3', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-phase","metadata":{"role":"content","name":"incident-timeline.step_phase.2"}} -->
<p class="hx-inc-phase"><?php esc_html_e( 'May 2026', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-inc-badge"} -->
<div class="wp-block-group hx-inc-badge">
<!-- wp:paragraph {"className":"hx-inc-badge-l","metadata":{"role":"content","name":"incident-timeline.step_badge.2"}} -->
<p class="hx-inc-badge-l"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:heading {"level":4,"className":"hx-inc-title","metadata":{"role":"content","name":"incident-timeline.step_title.2"}} -->
<h4 class="wp-block-heading hx-inc-title"><?php esc_html_e( 'KineticQL joins are up to 3× faster', 'wp-ja-kinetic' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-inc-text","metadata":{"role":"content","name":"incident-timeline.step_text.2"}} -->
<p class="hx-inc-text"><?php esc_html_e( 'A new vectorised join planner cuts cross-signal query latency dramatically on high-cardinality data. Existing saved queries benefit automatically.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-cell","metadata":{"name":"incident-timeline.item.3"}} -->
<div class="wp-block-group hx-inc-cell">
<!-- wp:group {"tagName":"span","className":"hx-inc-line"} -->
<span class="wp-block-group hx-inc-line"></span>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-head"} -->
<div class="wp-block-group hx-inc-head">
<!-- wp:group {"className":"hx-inc-node hx-ico-rocket","metadata":{"name":"incident-timeline.step_icon.3"}} -->
<div class="wp-block-group hx-inc-node hx-ico-rocket"></div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-time","metadata":{"role":"content","name":"incident-timeline.step_time.3"}} -->
<p class="hx-inc-time"><?php esc_html_e( 'v3.2', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-phase","metadata":{"role":"content","name":"incident-timeline.step_phase.3"}} -->
<p class="hx-inc-phase"><?php esc_html_e( 'Apr 2026', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-inc-badge"} -->
<div class="wp-block-group hx-inc-badge">
<!-- wp:paragraph {"className":"hx-inc-badge-l","metadata":{"role":"content","name":"incident-timeline.step_badge.3"}} -->
<p class="hx-inc-badge-l"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:heading {"level":4,"className":"hx-inc-title","metadata":{"role":"content","name":"incident-timeline.step_title.3"}} -->
<h4 class="wp-block-heading hx-inc-title"><?php esc_html_e( 'SCIM provisioning for Team & Enterprise', 'wp-ja-kinetic' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-inc-text","metadata":{"role":"content","name":"incident-timeline.step_text.3"}} -->
<p class="hx-inc-text"><?php esc_html_e( 'Automate user lifecycle from Okta, Entra ID and OneLogin. Group-to-role mapping and just-in-time provisioning are included.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-cell","metadata":{"name":"incident-timeline.item.4"}} -->
<div class="wp-block-group hx-inc-cell">
<!-- wp:group {"tagName":"span","className":"hx-inc-line"} -->
<span class="wp-block-group hx-inc-line"></span>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-head"} -->
<div class="wp-block-group hx-inc-head">
<!-- wp:group {"className":"hx-inc-node hx-ico-database","metadata":{"name":"incident-timeline.step_icon.4"}} -->
<div class="wp-block-group hx-inc-node hx-ico-database"></div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-time","metadata":{"role":"content","name":"incident-timeline.step_time.4"}} -->
<p class="hx-inc-time"><?php esc_html_e( 'v3.1', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-phase","metadata":{"role":"content","name":"incident-timeline.step_phase.4"}} -->
<p class="hx-inc-phase"><?php esc_html_e( 'Mar 2026', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-inc-badge"} -->
<div class="wp-block-group hx-inc-badge">
<!-- wp:paragraph {"className":"hx-inc-badge-l","metadata":{"role":"content","name":"incident-timeline.step_badge.4"}} -->
<p class="hx-inc-badge-l"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:heading {"level":4,"className":"hx-inc-title","metadata":{"role":"content","name":"incident-timeline.step_title.4"}} -->
<h4 class="wp-block-heading hx-inc-title"><?php esc_html_e( 'Dashboard time-range sync', 'wp-ja-kinetic' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-inc-text","metadata":{"role":"content","name":"incident-timeline.step_text.4"}} -->
<p class="hx-inc-text"><?php esc_html_e( 'Resolved an edge case where linked panels could fall out of sync after a relative range refresh. Thanks to everyone who reported it.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-cell","metadata":{"name":"incident-timeline.item.5"}} -->
<div class="wp-block-group hx-inc-cell">
<!-- wp:group {"tagName":"span","className":"hx-inc-line"} -->
<span class="wp-block-group hx-inc-line"></span>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-head"} -->
<div class="wp-block-group hx-inc-head">
<!-- wp:group {"className":"hx-inc-node hx-ico-git-merge","metadata":{"name":"incident-timeline.step_icon.5"}} -->
<div class="wp-block-group hx-inc-node hx-ico-git-merge"></div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-time","metadata":{"role":"content","name":"incident-timeline.step_time.5"}} -->
<p class="hx-inc-time"><?php esc_html_e( 'v3.0', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-phase","metadata":{"role":"content","name":"incident-timeline.step_phase.5"}} -->
<p class="hx-inc-phase"><?php esc_html_e( 'Feb 2026', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-inc-badge"} -->
<div class="wp-block-group hx-inc-badge">
<!-- wp:paragraph {"className":"hx-inc-badge-l","metadata":{"role":"content","name":"incident-timeline.step_badge.5"}} -->
<p class="hx-inc-badge-l"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:heading {"level":4,"className":"hx-inc-title","metadata":{"role":"content","name":"incident-timeline.step_title.5"}} -->
<h4 class="wp-block-heading hx-inc-title"><?php esc_html_e( 'KineticQL correlated subqueries', 'wp-ja-kinetic' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-inc-text","metadata":{"role":"content","name":"incident-timeline.step_text.5"}} -->
<p class="hx-inc-text"><?php esc_html_e( 'Reference the result of one query inside another — join a rolling baseline against live traffic without exporting to a notebook.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-cell","metadata":{"name":"incident-timeline.item.6"}} -->
<div class="wp-block-group hx-inc-cell">
<!-- wp:group {"tagName":"span","className":"hx-inc-line"} -->
<span class="wp-block-group hx-inc-line"></span>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-head"} -->
<div class="wp-block-group hx-inc-head">
<!-- wp:group {"className":"hx-inc-node hx-ico-bell","metadata":{"name":"incident-timeline.step_icon.6"}} -->
<div class="wp-block-group hx-inc-node hx-ico-bell"></div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-time","metadata":{"role":"content","name":"incident-timeline.step_time.6"}} -->
<p class="hx-inc-time"><?php esc_html_e( 'v2.9', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-phase","metadata":{"role":"content","name":"incident-timeline.step_phase.6"}} -->
<p class="hx-inc-phase"><?php esc_html_e( 'Jan 2026', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-inc-badge"} -->
<div class="wp-block-group hx-inc-badge">
<!-- wp:paragraph {"className":"hx-inc-badge-l","metadata":{"role":"content","name":"incident-timeline.step_badge.6"}} -->
<p class="hx-inc-badge-l"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:heading {"level":4,"className":"hx-inc-title","metadata":{"role":"content","name":"incident-timeline.step_title.6"}} -->
<h4 class="wp-block-heading hx-inc-title"><?php esc_html_e( 'Per-team alert escalation policies', 'wp-ja-kinetic' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-inc-text","metadata":{"role":"content","name":"incident-timeline.step_text.6"}} -->
<p class="hx-inc-text"><?php esc_html_e( 'Route pages by service, severity and time-of-day, with follow-the-sun escalation chains configured in the UI.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-cell","metadata":{"name":"incident-timeline.item.7"}} -->
<div class="wp-block-group hx-inc-cell">
<!-- wp:group {"tagName":"span","className":"hx-inc-line"} -->
<span class="wp-block-group hx-inc-line"></span>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-head"} -->
<div class="wp-block-group hx-inc-head">
<!-- wp:group {"className":"hx-inc-node hx-ico-shield","metadata":{"name":"incident-timeline.step_icon.7"}} -->
<div class="wp-block-group hx-inc-node hx-ico-shield"></div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-time","metadata":{"role":"content","name":"incident-timeline.step_time.7"}} -->
<p class="hx-inc-time"><?php esc_html_e( 'v2.8', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-phase","metadata":{"role":"content","name":"incident-timeline.step_phase.7"}} -->
<p class="hx-inc-phase"><?php esc_html_e( 'Dec 2025', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-inc-badge"} -->
<div class="wp-block-group hx-inc-badge">
<!-- wp:paragraph {"className":"hx-inc-badge-l","metadata":{"role":"content","name":"incident-timeline.step_badge.7"}} -->
<p class="hx-inc-badge-l"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:heading {"level":4,"className":"hx-inc-title","metadata":{"role":"content","name":"incident-timeline.step_title.7"}} -->
<h4 class="wp-block-heading hx-inc-title"><?php esc_html_e( 'SOC 2 Type II report available', 'wp-ja-kinetic' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-inc-text","metadata":{"role":"content","name":"incident-timeline.step_text.7"}} -->
<p class="hx-inc-text"><?php esc_html_e( 'Independent audit complete. Download the report from the trust center and share it with your security team.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-cell","metadata":{"name":"incident-timeline.item.8"}} -->
<div class="wp-block-group hx-inc-cell">
<!-- wp:group {"tagName":"span","className":"hx-inc-line"} -->
<span class="wp-block-group hx-inc-line"></span>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-head"} -->
<div class="wp-block-group hx-inc-head">
<!-- wp:group {"className":"hx-inc-node hx-ico-gauge","metadata":{"name":"incident-timeline.step_icon.8"}} -->
<div class="wp-block-group hx-inc-node hx-ico-gauge"></div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-time","metadata":{"role":"content","name":"incident-timeline.step_time.8"}} -->
<p class="hx-inc-time"><?php esc_html_e( 'v2.7', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-phase","metadata":{"role":"content","name":"incident-timeline.step_phase.8"}} -->
<p class="hx-inc-phase"><?php esc_html_e( 'Nov 2025', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-inc-badge"} -->
<div class="wp-block-group hx-inc-badge">
<!-- wp:paragraph {"className":"hx-inc-badge-l","metadata":{"role":"content","name":"incident-timeline.step_badge.8"}} -->
<p class="hx-inc-badge-l"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:heading {"level":4,"className":"hx-inc-title","metadata":{"role":"content","name":"incident-timeline.step_title.8"}} -->
<h4 class="wp-block-heading hx-inc-title"><?php esc_html_e( 'Continuous profiling (beta)', 'wp-ja-kinetic' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-inc-text","metadata":{"role":"content","name":"incident-timeline.step_text.8"}} -->
<p class="hx-inc-text"><?php esc_html_e( 'Sample CPU and allocation profiles continuously and jump from a latency spike straight to the hot function.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-cell","metadata":{"name":"incident-timeline.item.9"}} -->
<div class="wp-block-group hx-inc-cell">
<!-- wp:group {"tagName":"span","className":"hx-inc-line"} -->
<span class="wp-block-group hx-inc-line"></span>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-head"} -->
<div class="wp-block-group hx-inc-head">
<!-- wp:group {"className":"hx-inc-node hx-ico-filter","metadata":{"name":"incident-timeline.step_icon.9"}} -->
<div class="wp-block-group hx-inc-node hx-ico-filter"></div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-time","metadata":{"role":"content","name":"incident-timeline.step_time.9"}} -->
<p class="hx-inc-time"><?php esc_html_e( 'v2.6', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-phase","metadata":{"role":"content","name":"incident-timeline.step_phase.9"}} -->
<p class="hx-inc-phase"><?php esc_html_e( 'Oct 2025', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-inc-badge"} -->
<div class="wp-block-group hx-inc-badge">
<!-- wp:paragraph {"className":"hx-inc-badge-l","metadata":{"role":"content","name":"incident-timeline.step_badge.9"}} -->
<p class="hx-inc-badge-l"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:heading {"level":4,"className":"hx-inc-title","metadata":{"role":"content","name":"incident-timeline.step_title.9"}} -->
<h4 class="wp-block-heading hx-inc-title"><?php esc_html_e( 'Smart log sampling cuts ingest 30%', 'wp-ja-kinetic' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-inc-text","metadata":{"role":"content","name":"incident-timeline.step_text.9"}} -->
<p class="hx-inc-text"><?php esc_html_e( 'A new adaptive sampler keeps the log lines that matter and drops the noise — typical bills fall by a third.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-cell","metadata":{"name":"incident-timeline.item.10"}} -->
<div class="wp-block-group hx-inc-cell">
<!-- wp:group {"tagName":"span","className":"hx-inc-line"} -->
<span class="wp-block-group hx-inc-line"></span>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-inc-head"} -->
<div class="wp-block-group hx-inc-head">
<!-- wp:group {"className":"hx-inc-node hx-ico-cloud","metadata":{"name":"incident-timeline.step_icon.10"}} -->
<div class="wp-block-group hx-inc-node hx-ico-cloud"></div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-time","metadata":{"role":"content","name":"incident-timeline.step_time.10"}} -->
<p class="hx-inc-time"><?php esc_html_e( 'v2.5', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-inc-phase","metadata":{"role":"content","name":"incident-timeline.step_phase.10"}} -->
<p class="hx-inc-phase"><?php esc_html_e( 'Sep 2025', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-inc-badge"} -->
<div class="wp-block-group hx-inc-badge">
<!-- wp:paragraph {"className":"hx-inc-badge-l","metadata":{"role":"content","name":"incident-timeline.step_badge.10"}} -->
<p class="hx-inc-badge-l"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:heading {"level":4,"className":"hx-inc-title","metadata":{"role":"content","name":"incident-timeline.step_title.10"}} -->
<h4 class="wp-block-heading hx-inc-title"><?php esc_html_e( 'Azure Monitor and GCP ingestion', 'wp-ja-kinetic' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-inc-text","metadata":{"role":"content","name":"incident-timeline.step_text.10"}} -->
<p class="hx-inc-text"><?php esc_html_e( 'Pull metrics and logs directly from Azure Monitor and Google Cloud with native, keyless ingestion.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
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
