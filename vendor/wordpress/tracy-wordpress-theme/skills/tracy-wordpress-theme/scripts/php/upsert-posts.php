<?php
// tracy-php: upsert-posts
// Create or update a batch of posts through the WordPress API — wp_insert_post / wp_update_post
// / update_post_meta, never SQL — the way `wp post create` and `wp post update` do it one at a
// time (the data is slashed as wp-cli slashes it). One call per ten posts replaces one wp call
// per post plus one per meta key.
//
// Run by scripts/lib/post-batch.mjs as `wp eval-file -` with this file on stdin behind a
// `$tracy_payload_b64` prelude; by hand as `wp eval-file upsert-posts.php '<json>'` or with the
// JSON on stdin. Payload: {"items": [item, ...]} where an item is
//   { post_type, post_title, post_name, post_status, post_excerpt, post_content,
//     post_parent?, menu_order?, post_date?, post_category?, post_author?, tags_input?, sticky?, meta: {key: value | array},
//     existing_id: <id>|null, clear_template: bool, clear_category: bool,
//     terms?: {taxonomy: term}   (set after a create only, as the seeder's onCreate did)
//   } or { existing_id, meta_only: true, meta: {key: value} }.
// Output: JSON only — [{id, slug, action: created|updated|error, error}] in item order. An error
// never stops the batch; the caller stops the seed on the first one.

$payload = isset( $tracy_payload_b64 )
	? json_decode( base64_decode( $tracy_payload_b64 ), true )
	: ( isset( $args[0] ) ? json_decode( $args[0], true ) : json_decode( (string) stream_get_contents( STDIN ), true ) );
$items = is_array( $payload ) && isset( $payload['items'] ) ? $payload['items'] : array();

if ( ! function_exists( 'tracy_seed_sticky' ) ) {
	// `sticky` is not a post field: the sticky list is an option (stick_post / unstick_post).
	function tracy_seed_sticky( $id, array $it ) {
		if ( ! array_key_exists( 'sticky', $it ) || null === $it['sticky'] ) {
			return;
		}
		if ( $it['sticky'] ) {
			stick_post( $id );
		} else {
			unstick_post( $id );
		}
	}
}

if ( ! function_exists( 'tracy_seed_clear_tags' ) ) {
	// Removes every tag from a post; null when done, else the error text. The taxonomy is put on the
	// post's type for this request, so clearing does not depend on the page-tags plugin being present,
	// and a failed write is reported instead of leaving the old tags behind a stored fingerprint.
	function tracy_seed_clear_tags( $id ) {
		if ( ! taxonomy_exists( 'post_tag' ) ) {
			return 'post_tag: the taxonomy is not registered';
		}
		register_taxonomy_for_object_type( 'post_tag', get_post_type( $id ) );
		$r = wp_set_object_terms( $id, array(), 'post_tag' );
		return is_wp_error( $r ) ? 'post_tag: ' . $r->get_error_message() : null;
	}
}

if ( ! function_exists( 'tracy_seed_upsert' ) ) {
	function tracy_seed_upsert( array $it ) {
		$existing = ! empty( $it['existing_id'] ) ? (int) $it['existing_id'] : 0;
		$meta     = isset( $it['meta'] ) && is_array( $it['meta'] ) ? $it['meta'] : array();
		if ( ! empty( $it['meta_only'] ) ) {
			foreach ( $meta as $k => $v ) {
				update_post_meta( $existing, $k, wp_slash( $v ) );
			}
			if ( ! empty( $it['clear_tags'] ) ) {
				$err = tracy_seed_clear_tags( $existing );
				if ( null !== $err ) {
					return array( 'id' => $existing, 'slug' => get_post_field( 'post_name', $existing ), 'action' => 'error', 'error' => $err );
				}
			}
			return array( 'id' => $existing, 'slug' => get_post_field( 'post_name', $existing ), 'action' => 'updated', 'error' => null );
		}
		$post = array(
			'post_type'    => $it['post_type'],
			'post_title'   => (string) $it['post_title'],
			'post_name'    => (string) $it['post_name'],
			'post_status'  => (string) $it['post_status'],
			'post_excerpt' => isset( $it['post_excerpt'] ) ? (string) $it['post_excerpt'] : '',
			'post_content' => isset( $it['post_content'] ) ? (string) $it['post_content'] : '',
			'meta_input'   => $meta,
		);
		if ( array_key_exists( 'post_parent', $it ) && null !== $it['post_parent'] ) {
			$post['post_parent'] = (int) $it['post_parent'];
		}
		if ( array_key_exists( 'menu_order', $it ) && null !== $it['menu_order'] ) {
			$post['menu_order'] = (int) $it['menu_order'];
		}
		if ( ! empty( $it['post_date'] ) ) {
			$post['post_date']     = (string) $it['post_date'];
			$post['post_date_gmt'] = get_gmt_from_date( (string) $it['post_date'] );
			$post['edit_date']     = true;
		}
		if ( ! empty( $it['post_category'] ) ) {
			$post['post_category'] = array_map( 'intval', (array) $it['post_category'] );
		}
		if ( ! empty( $it['post_author'] ) ) {
			$post['post_author'] = (int) $it['post_author'];
		}
		if ( array_key_exists( 'tags_input', $it ) && null !== $it['tags_input'] ) {
			$post['tags_input'] = $it['tags_input'];
		}
		if ( $existing ) {
			$post['ID'] = $existing;
			$r          = wp_update_post( wp_slash( $post ), true );
			if ( is_wp_error( $r ) ) {
				return array( 'id' => $existing, 'slug' => $post['post_name'], 'action' => 'error', 'error' => $r->get_error_message() );
			}
			tracy_seed_sticky( $existing, $it );
			if ( ! empty( $it['clear_tags'] ) ) {
				$err = tracy_seed_clear_tags( $existing );
				if ( null !== $err ) {
					// wp_update_post has stored the new fingerprint through meta_input: drop it, so a repeat seed retries this page.
					delete_post_meta( $existing, '_tracy_seed' );
					return array( 'id' => $existing, 'slug' => get_post_field( 'post_name', $existing ), 'action' => 'error', 'error' => $err );
				}
			}
			// wp_update_post merges the stored post in (page_template among it) and writes that
			// back after meta_input, so the template never changes through meta_input — measured
			// on WP 7.1. Meta is written key by key once the update is through, as before.
			foreach ( $meta as $k => $v ) {
				update_post_meta( $existing, $k, wp_slash( $v ) );
			}
			if ( ! empty( $it['clear_template'] ) ) {
				delete_post_meta( $existing, '_wp_page_template' );
			}
			if ( ! empty( $it['clear_category'] ) ) {
				wp_set_object_terms( $existing, array(), 'category' );
			}
			return array( 'id' => $existing, 'slug' => get_post_field( 'post_name', $existing ), 'action' => 'updated', 'error' => null );
		}
		$id = wp_insert_post( wp_slash( $post ), true );
		if ( is_wp_error( $id ) ) {
			return array( 'id' => 0, 'slug' => $post['post_name'], 'action' => 'error', 'error' => $id->get_error_message() );
		}
		tracy_seed_sticky( $id, $it );
		if ( ! empty( $it['terms'] ) && is_array( $it['terms'] ) ) {
			foreach ( $it['terms'] as $taxonomy => $term ) {
				$set = wp_set_object_terms( $id, $term, $taxonomy );
				if ( is_wp_error( $set ) ) {
					return array( 'id' => $id, 'slug' => $post['post_name'], 'action' => 'error', 'error' => $taxonomy . ': ' . $set->get_error_message() );
				}
			}
		}
		return array( 'id' => $id, 'slug' => get_post_field( 'post_name', $id ), 'action' => 'created', 'error' => null );
	}
}

$out = array();
foreach ( $items as $it ) {
	$out[] = tracy_seed_upsert( $it );
}
echo json_encode( $out );
