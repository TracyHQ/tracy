# Install and identify

1. Theme only: upload `wp-ja-impact-1.0.0.zip` (Appearance > Themes > Add New, or
   `wp theme install wp-ja-impact-1.0.0.zip --activate`). A theme alone carries no content.
2. Whole site: restore the quickstart `quickstart/ja-impact/wp7` (webroot tar and database dump,
   prefix `tr_`, URL placeholder replaced at restore) on a clean WordPress 7.x with PHP 8.1+.
3. Plugin: Contact Form 7 (`contact-form-7`, active). Without it the contact page prints its
   shortcode as plain text.
4. Identify the site before acting: `wp option get siteurl`, `wp option get blogname` ("JA Impact"),
   `wp theme list --status=active` (expect `wp-ja-impact`), `wp plugin list`.
5. Permalinks must be `/%postname%/`; the quickstart carries that and the `.htaccess`.
6. Admin user: the restored site has the builder's agent account only; create people through
   WordPress. The quickstart contains no secrets.
