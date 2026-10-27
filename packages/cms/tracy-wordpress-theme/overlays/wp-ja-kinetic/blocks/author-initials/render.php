<?php
/**
 * wp-ja-kinetic/author-initials — see block.json. Algorithm copied verbatim from
 * `article/default.php:79-85`: first letter of each of the first two words in the display
 * name, uppercased. `get_the_author()` returns the post's author (matches the source's own
 * `$author`, itself the article's `created_by_alias` or the user's name).
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_author = get_the_author();
if ( '' === trim( (string) $wp_ja_kinetic_author ) ) {
	return;
}
$wp_ja_kinetic_initials = '';
foreach ( preg_split( '/\s+/', trim( $wp_ja_kinetic_author ) ) as $wp_ja_kinetic_word ) {
	if ( '' !== $wp_ja_kinetic_word && mb_strlen( $wp_ja_kinetic_initials ) < 2 ) {
		$wp_ja_kinetic_initials .= mb_strtoupper( mb_substr( $wp_ja_kinetic_word, 0, 1 ) );
	}
}
?>
<span class="hx-author__av" aria-hidden="true"><?php echo esc_html( $wp_ja_kinetic_initials ); ?></span>
