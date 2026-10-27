<?php
// tracy-php: fingerprints
// Every seed fingerprint of the site in one call: {"<post id>": "<hash>"} for each post, of any
// type and status, that carries the `_tracy_seed` meta the seeder writes (seed.mjs upsertPost).
// One call replaces one `wp post meta get <id> _tracy_seed` per existing post.
//
// Run by scripts/lib/post-batch.mjs as `wp eval-file -` with this file on stdin behind a
// `$tracy_payload_b64` prelude; by hand as `wp eval-file fingerprints.php '{"ids":[1,2]}'` or
// with the JSON on stdin. Payload: `{"ids": [...]}` limits the answer to those ids; `{}` is all.
// Output: JSON only, nothing else on stdout.

$payload = isset( $tracy_payload_b64 )
	? json_decode( base64_decode( $tracy_payload_b64 ), true )
	: ( isset( $args[0] ) ? json_decode( $args[0], true ) : json_decode( (string) stream_get_contents( STDIN ), true ) );
if ( ! is_array( $payload ) ) {
	$payload = array();
}

$ids = get_posts(
	array(
		'post_type'        => array_values( get_post_types( array(), 'names' ) ),
		'post_status'      => array_values( get_post_stati( array(), 'names' ) ),
		'numberposts'      => -1,
		'fields'           => 'ids',
		'meta_key'         => '_tracy_seed',
		'orderby'          => 'ID',
		'order'            => 'ASC',
		'no_found_rows'    => true,
		'suppress_filters' => true,
	)
);
if ( ! empty( $payload['ids'] ) ) {
	$wanted = array_map( 'intval', (array) $payload['ids'] );
	$ids    = array_values( array_intersect( $ids, $wanted ) );
}
update_meta_cache( 'post', $ids );
$out = new stdClass();
foreach ( $ids as $id ) {
	$out->{ (string) $id } = (string) get_post_meta( $id, '_tracy_seed', true );
}
echo json_encode( $out );
