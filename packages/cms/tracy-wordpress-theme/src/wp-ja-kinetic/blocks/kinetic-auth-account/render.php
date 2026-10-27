<?php
/**
 * wp-ja-kinetic/kinetic-auth-account — the source's profile view
 * (html/com_users/profile/default.php): an identity card (avatar initials, name, email, edit +
 * sign-out) beside an account-details card (real user fields in a 2-col grid). The page this
 * block sits on is guarded by wp_ja_kinetic_auth_guard() (inc/extra.php), which redirects a
 * signed-out visitor to the login page before this ever renders — the same "must be signed in"
 * behaviour the source's own component enforces. "Edit Profile" links to `?layout=edit` on this
 * SAME page (this block's own edit-mode branch below), not `wp-admin/profile.php` — the source's
 * own edit view (`profile/edit.php`) stays on its own themed chrome too (AU-018, run-3 audit).
 *
 * "Edit Profile" (capital P), the `l, d F Y` date format and the "Registered" group label are the
 * source's own verbatim values — `COM_USERS_EDIT_PROFILE`, `DATE_FORMAT_LC1` (both
 * language/en-GB/*.ini, not the site's configurable WordPress `date_format` option) and the
 * `#__usergroups` row a self-registered Joomla account lands in (id 2, title "Registered") —
 * measured directly against the running source's database and language files, 2026-09-22.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

/**
 * The closest source Joomla user-group title for a WordPress role, for the "Group" field below.
 * Joomla's own group names have no WordPress equivalent to translate programmatically — this maps
 * only the two roles this port's own handlers ever assign (`wp_ja_kinetic_register_submit()`'s
 * `get_option('default_role','subscriber')`, and WordPress's own default admin account) to the
 * source's own group titles (`#__usergroups`, measured on the running source's database); any other
 * role falls back to its own WordPress label, unmapped.
 *
 * @param string $role    WP role slug.
 * @param string $wp_label WordPress's own translated role label, as a fallback.
 * @return string
 */
if ( ! function_exists( 'wp_ja_kinetic_profile_group_label' ) ) {
	function wp_ja_kinetic_profile_group_label( string $role, string $wp_label ): string {
		$map = array(
			'subscriber'    => 'Registered',
			'administrator' => 'Super Users',
		);
		return $map[ $role ] ?? $wp_label;
	}
}

if ( ! is_user_logged_in() ) {
	return;
}

// ---- ?layout=edit — the source's own themed front-end edit form (`profile/edit.php`), not
// wp-admin: measured live 2026-09-22, `/pages/profile?layout=edit` stays on this theme's own
// chrome. Four fieldsets, in the source's own order: "Edit Your Profile" (Name, Username,
// Password, Confirm Password, Email — AU-018), "Basic Settings" (Editor, Time Zone, Frontend
// Language, Dark Mode), "User info" (Avatar, User Position, About Me, Social Info, Address 1/2,
// City, Region, Country, Postal/ZIP Code, Phone, Website, Favourite Book, Date of Birth) and
// "Fields" (Company). The option lists are the source's own live-rendered <option> text,
// captured 2026-09-22. None of these settings have a WordPress-side equivalent to persist to
// (this port has no per-user editor/timezone/locale system) — carried for D-11 element-tree
// parity only; wp_ja_kinetic_profile_edit_submit() (inc/extra.php) reads only the five core
// fields and silently ignores the rest, same as it already does for any POST key it does not
// know.
//
// Markup is the source's own rendered form, element for element (measured 2026-09-23, signed in):
// the Time Zone fancy-select is the markup choices.js leaves behind (hidden <select> + single
// item + the dropdown list of every zone), Avatar is the media field (hidden "Change Image"
// modal + preview + Select), Social Info the empty repeatable subform table, and Date of Birth
// the calendar field with calendar.js's hidden month grid. The source's own JS widgets are not
// ported, so those four render in their closed state only.
if ( isset( $_GET['layout'] ) && 'edit' === $_GET['layout'] ) {
	$wp_ja_kinetic_edit_user  = wp_get_current_user();
	$wp_ja_kinetic_edit_error = (string) ( wp_ja_kinetic_auth_state()['profile_edit_error'] ?? '' );

	// Option lists for Basic Settings / User info / Fields — see the file doc comment above.
	$wp_ja_kinetic_editors = array(
		''            => '- Use Default -',
		'codemirror'  => 'Editor - CodeMirror',
		'none'        => 'Editor - None',
		'tinymce'     => 'Editor - TinyMCE',
	);
	$wp_ja_kinetic_languages = array(
		''      => '- Use Default -',
		'en-GB' => 'English (United Kingdom)',
	);
	$wp_ja_kinetic_color_schemes = array(
		''      => '- Use Default -',
		'os'    => 'Follow OS settings',
		'light' => 'Use Light colour scheme',
		'dark'  => 'Use Dark colour scheme',
	);
	$wp_ja_kinetic_timezones = array(
	'Africa' => array(
		'Africa/Abidjan' => 'Abidjan',
		'Africa/Accra' => 'Accra',
		'Africa/Addis_Ababa' => 'Addis Ababa',
		'Africa/Algiers' => 'Algiers',
		'Africa/Asmara' => 'Asmara',
		'Africa/Bamako' => 'Bamako',
		'Africa/Bangui' => 'Bangui',
		'Africa/Banjul' => 'Banjul',
		'Africa/Bissau' => 'Bissau',
		'Africa/Blantyre' => 'Blantyre',
		'Africa/Brazzaville' => 'Brazzaville',
		'Africa/Bujumbura' => 'Bujumbura',
		'Africa/Cairo' => 'Cairo',
		'Africa/Casablanca' => 'Casablanca',
		'Africa/Ceuta' => 'Ceuta',
		'Africa/Conakry' => 'Conakry',
		'Africa/Dakar' => 'Dakar',
		'Africa/Dar_es_Salaam' => 'Dar es Salaam',
		'Africa/Djibouti' => 'Djibouti',
		'Africa/Douala' => 'Douala',
		'Africa/El_Aaiun' => 'El Aaiun',
		'Africa/Freetown' => 'Freetown',
		'Africa/Gaborone' => 'Gaborone',
		'Africa/Harare' => 'Harare',
		'Africa/Johannesburg' => 'Johannesburg',
		'Africa/Juba' => 'Juba',
		'Africa/Kampala' => 'Kampala',
		'Africa/Khartoum' => 'Khartoum',
		'Africa/Kigali' => 'Kigali',
		'Africa/Kinshasa' => 'Kinshasa',
		'Africa/Lagos' => 'Lagos',
		'Africa/Libreville' => 'Libreville',
		'Africa/Lome' => 'Lome',
		'Africa/Luanda' => 'Luanda',
		'Africa/Lubumbashi' => 'Lubumbashi',
		'Africa/Lusaka' => 'Lusaka',
		'Africa/Malabo' => 'Malabo',
		'Africa/Maputo' => 'Maputo',
		'Africa/Maseru' => 'Maseru',
		'Africa/Mbabane' => 'Mbabane',
		'Africa/Mogadishu' => 'Mogadishu',
		'Africa/Monrovia' => 'Monrovia',
		'Africa/Nairobi' => 'Nairobi',
		'Africa/Ndjamena' => 'Ndjamena',
		'Africa/Niamey' => 'Niamey',
		'Africa/Nouakchott' => 'Nouakchott',
		'Africa/Ouagadougou' => 'Ouagadougou',
		'Africa/Porto-Novo' => 'Porto-Novo',
		'Africa/Sao_Tome' => 'Sao Tome',
		'Africa/Tripoli' => 'Tripoli',
		'Africa/Tunis' => 'Tunis',
		'Africa/Windhoek' => 'Windhoek',
	),
	'America' => array(
		'America/Adak' => 'Adak',
		'America/Anchorage' => 'Anchorage',
		'America/Anguilla' => 'Anguilla',
		'America/Antigua' => 'Antigua',
		'America/Araguaina' => 'Araguaina',
		'America/Argentina/Buenos_Aires' => 'Argentina/Buenos Aires',
		'America/Argentina/Catamarca' => 'Argentina/Catamarca',
		'America/Argentina/Cordoba' => 'Argentina/Cordoba',
		'America/Argentina/Jujuy' => 'Argentina/Jujuy',
		'America/Argentina/La_Rioja' => 'Argentina/La Rioja',
		'America/Argentina/Mendoza' => 'Argentina/Mendoza',
		'America/Argentina/Rio_Gallegos' => 'Argentina/Rio Gallegos',
		'America/Argentina/Salta' => 'Argentina/Salta',
		'America/Argentina/San_Juan' => 'Argentina/San Juan',
		'America/Argentina/San_Luis' => 'Argentina/San Luis',
		'America/Argentina/Tucuman' => 'Argentina/Tucuman',
		'America/Argentina/Ushuaia' => 'Argentina/Ushuaia',
		'America/Aruba' => 'Aruba',
		'America/Asuncion' => 'Asuncion',
		'America/Atikokan' => 'Atikokan',
		'America/Bahia' => 'Bahia',
		'America/Bahia_Banderas' => 'Bahia Banderas',
		'America/Barbados' => 'Barbados',
		'America/Belem' => 'Belem',
		'America/Belize' => 'Belize',
		'America/Blanc-Sablon' => 'Blanc-Sablon',
		'America/Boa_Vista' => 'Boa Vista',
		'America/Bogota' => 'Bogota',
		'America/Boise' => 'Boise',
		'America/Cambridge_Bay' => 'Cambridge Bay',
		'America/Campo_Grande' => 'Campo Grande',
		'America/Cancun' => 'Cancun',
		'America/Caracas' => 'Caracas',
		'America/Cayenne' => 'Cayenne',
		'America/Cayman' => 'Cayman',
		'America/Chicago' => 'Chicago',
		'America/Chihuahua' => 'Chihuahua',
		'America/Ciudad_Juarez' => 'Ciudad Juarez',
		'America/Costa_Rica' => 'Costa Rica',
		'America/Coyhaique' => 'Coyhaique',
		'America/Creston' => 'Creston',
		'America/Cuiaba' => 'Cuiaba',
		'America/Curacao' => 'Curacao',
		'America/Danmarkshavn' => 'Danmarkshavn',
		'America/Dawson' => 'Dawson',
		'America/Dawson_Creek' => 'Dawson Creek',
		'America/Denver' => 'Denver',
		'America/Detroit' => 'Detroit',
		'America/Dominica' => 'Dominica',
		'America/Edmonton' => 'Edmonton',
		'America/Eirunepe' => 'Eirunepe',
		'America/El_Salvador' => 'El Salvador',
		'America/Fort_Nelson' => 'Fort Nelson',
		'America/Fortaleza' => 'Fortaleza',
		'America/Glace_Bay' => 'Glace Bay',
		'America/Goose_Bay' => 'Goose Bay',
		'America/Grand_Turk' => 'Grand Turk',
		'America/Grenada' => 'Grenada',
		'America/Guadeloupe' => 'Guadeloupe',
		'America/Guatemala' => 'Guatemala',
		'America/Guayaquil' => 'Guayaquil',
		'America/Guyana' => 'Guyana',
		'America/Halifax' => 'Halifax',
		'America/Havana' => 'Havana',
		'America/Hermosillo' => 'Hermosillo',
		'America/Indiana/Indianapolis' => 'Indiana/Indianapolis',
		'America/Indiana/Knox' => 'Indiana/Knox',
		'America/Indiana/Marengo' => 'Indiana/Marengo',
		'America/Indiana/Petersburg' => 'Indiana/Petersburg',
		'America/Indiana/Tell_City' => 'Indiana/Tell City',
		'America/Indiana/Vevay' => 'Indiana/Vevay',
		'America/Indiana/Vincennes' => 'Indiana/Vincennes',
		'America/Indiana/Winamac' => 'Indiana/Winamac',
		'America/Inuvik' => 'Inuvik',
		'America/Iqaluit' => 'Iqaluit',
		'America/Jamaica' => 'Jamaica',
		'America/Juneau' => 'Juneau',
		'America/Kentucky/Louisville' => 'Kentucky/Louisville',
		'America/Kentucky/Monticello' => 'Kentucky/Monticello',
		'America/Kralendijk' => 'Kralendijk',
		'America/La_Paz' => 'La Paz',
		'America/Lima' => 'Lima',
		'America/Los_Angeles' => 'Los Angeles',
		'America/Lower_Princes' => 'Lower Princes',
		'America/Maceio' => 'Maceio',
		'America/Managua' => 'Managua',
		'America/Manaus' => 'Manaus',
		'America/Marigot' => 'Marigot',
		'America/Martinique' => 'Martinique',
		'America/Matamoros' => 'Matamoros',
		'America/Mazatlan' => 'Mazatlan',
		'America/Menominee' => 'Menominee',
		'America/Merida' => 'Merida',
		'America/Metlakatla' => 'Metlakatla',
		'America/Mexico_City' => 'Mexico City',
		'America/Miquelon' => 'Miquelon',
		'America/Moncton' => 'Moncton',
		'America/Monterrey' => 'Monterrey',
		'America/Montevideo' => 'Montevideo',
		'America/Montserrat' => 'Montserrat',
		'America/Nassau' => 'Nassau',
		'America/New_York' => 'New York',
		'America/Nome' => 'Nome',
		'America/Noronha' => 'Noronha',
		'America/North_Dakota/Beulah' => 'North Dakota/Beulah',
		'America/North_Dakota/Center' => 'North Dakota/Center',
		'America/North_Dakota/New_Salem' => 'North Dakota/New Salem',
		'America/Nuuk' => 'Nuuk',
		'America/Ojinaga' => 'Ojinaga',
		'America/Panama' => 'Panama',
		'America/Paramaribo' => 'Paramaribo',
		'America/Phoenix' => 'Phoenix',
		'America/Port-au-Prince' => 'Port-au-Prince',
		'America/Port_of_Spain' => 'Port of Spain',
		'America/Porto_Velho' => 'Porto Velho',
		'America/Puerto_Rico' => 'Puerto Rico',
		'America/Punta_Arenas' => 'Punta Arenas',
		'America/Rankin_Inlet' => 'Rankin Inlet',
		'America/Recife' => 'Recife',
		'America/Regina' => 'Regina',
		'America/Resolute' => 'Resolute',
		'America/Rio_Branco' => 'Rio Branco',
		'America/Santarem' => 'Santarem',
		'America/Santiago' => 'Santiago',
		'America/Santo_Domingo' => 'Santo Domingo',
		'America/Sao_Paulo' => 'Sao Paulo',
		'America/Scoresbysund' => 'Scoresbysund',
		'America/Sitka' => 'Sitka',
		'America/St_Barthelemy' => 'St Barthelemy',
		'America/St_Johns' => 'St Johns',
		'America/St_Kitts' => 'St Kitts',
		'America/St_Lucia' => 'St Lucia',
		'America/St_Thomas' => 'St Thomas',
		'America/St_Vincent' => 'St Vincent',
		'America/Swift_Current' => 'Swift Current',
		'America/Tegucigalpa' => 'Tegucigalpa',
		'America/Thule' => 'Thule',
		'America/Tijuana' => 'Tijuana',
		'America/Toronto' => 'Toronto',
		'America/Tortola' => 'Tortola',
		'America/Vancouver' => 'Vancouver',
		'America/Whitehorse' => 'Whitehorse',
		'America/Winnipeg' => 'Winnipeg',
		'America/Yakutat' => 'Yakutat',
	),
	'Antarctica' => array(
		'Antarctica/Casey' => 'Casey',
		'Antarctica/Davis' => 'Davis',
		'Antarctica/DumontDUrville' => 'DumontDUrville',
		'Antarctica/Macquarie' => 'Macquarie',
		'Antarctica/Mawson' => 'Mawson',
		'Antarctica/McMurdo' => 'McMurdo',
		'Antarctica/Palmer' => 'Palmer',
		'Antarctica/Rothera' => 'Rothera',
		'Antarctica/Syowa' => 'Syowa',
		'Antarctica/Troll' => 'Troll',
		'Antarctica/Vostok' => 'Vostok',
	),
	'Arctic' => array(
		'Arctic/Longyearbyen' => 'Longyearbyen',
	),
	'Asia' => array(
		'Asia/Aden' => 'Aden',
		'Asia/Almaty' => 'Almaty',
		'Asia/Amman' => 'Amman',
		'Asia/Anadyr' => 'Anadyr',
		'Asia/Aqtau' => 'Aqtau',
		'Asia/Aqtobe' => 'Aqtobe',
		'Asia/Ashgabat' => 'Ashgabat',
		'Asia/Atyrau' => 'Atyrau',
		'Asia/Baghdad' => 'Baghdad',
		'Asia/Bahrain' => 'Bahrain',
		'Asia/Baku' => 'Baku',
		'Asia/Bangkok' => 'Bangkok',
		'Asia/Barnaul' => 'Barnaul',
		'Asia/Beirut' => 'Beirut',
		'Asia/Bishkek' => 'Bishkek',
		'Asia/Brunei' => 'Brunei',
		'Asia/Chita' => 'Chita',
		'Asia/Colombo' => 'Colombo',
		'Asia/Damascus' => 'Damascus',
		'Asia/Dhaka' => 'Dhaka',
		'Asia/Dili' => 'Dili',
		'Asia/Dubai' => 'Dubai',
		'Asia/Dushanbe' => 'Dushanbe',
		'Asia/Famagusta' => 'Famagusta',
		'Asia/Gaza' => 'Gaza',
		'Asia/Hebron' => 'Hebron',
		'Asia/Ho_Chi_Minh' => 'Ho Chi Minh',
		'Asia/Hong_Kong' => 'Hong Kong',
		'Asia/Hovd' => 'Hovd',
		'Asia/Irkutsk' => 'Irkutsk',
		'Asia/Jakarta' => 'Jakarta',
		'Asia/Jayapura' => 'Jayapura',
		'Asia/Jerusalem' => 'Jerusalem',
		'Asia/Kabul' => 'Kabul',
		'Asia/Kamchatka' => 'Kamchatka',
		'Asia/Karachi' => 'Karachi',
		'Asia/Kathmandu' => 'Kathmandu',
		'Asia/Khandyga' => 'Khandyga',
		'Asia/Kolkata' => 'Kolkata',
		'Asia/Krasnoyarsk' => 'Krasnoyarsk',
		'Asia/Kuala_Lumpur' => 'Kuala Lumpur',
		'Asia/Kuching' => 'Kuching',
		'Asia/Kuwait' => 'Kuwait',
		'Asia/Macau' => 'Macau',
		'Asia/Magadan' => 'Magadan',
		'Asia/Makassar' => 'Makassar',
		'Asia/Manila' => 'Manila',
		'Asia/Muscat' => 'Muscat',
		'Asia/Nicosia' => 'Nicosia',
		'Asia/Novokuznetsk' => 'Novokuznetsk',
		'Asia/Novosibirsk' => 'Novosibirsk',
		'Asia/Omsk' => 'Omsk',
		'Asia/Oral' => 'Oral',
		'Asia/Phnom_Penh' => 'Phnom Penh',
		'Asia/Pontianak' => 'Pontianak',
		'Asia/Pyongyang' => 'Pyongyang',
		'Asia/Qatar' => 'Qatar',
		'Asia/Qostanay' => 'Qostanay',
		'Asia/Qyzylorda' => 'Qyzylorda',
		'Asia/Riyadh' => 'Riyadh',
		'Asia/Sakhalin' => 'Sakhalin',
		'Asia/Samarkand' => 'Samarkand',
		'Asia/Seoul' => 'Seoul',
		'Asia/Shanghai' => 'Shanghai',
		'Asia/Singapore' => 'Singapore',
		'Asia/Srednekolymsk' => 'Srednekolymsk',
		'Asia/Taipei' => 'Taipei',
		'Asia/Tashkent' => 'Tashkent',
		'Asia/Tbilisi' => 'Tbilisi',
		'Asia/Tehran' => 'Tehran',
		'Asia/Thimphu' => 'Thimphu',
		'Asia/Tokyo' => 'Tokyo',
		'Asia/Tomsk' => 'Tomsk',
		'Asia/Ulaanbaatar' => 'Ulaanbaatar',
		'Asia/Urumqi' => 'Urumqi',
		'Asia/Ust-Nera' => 'Ust-Nera',
		'Asia/Vientiane' => 'Vientiane',
		'Asia/Vladivostok' => 'Vladivostok',
		'Asia/Yakutsk' => 'Yakutsk',
		'Asia/Yangon' => 'Yangon',
		'Asia/Yekaterinburg' => 'Yekaterinburg',
		'Asia/Yerevan' => 'Yerevan',
	),
	'Atlantic' => array(
		'Atlantic/Azores' => 'Azores',
		'Atlantic/Bermuda' => 'Bermuda',
		'Atlantic/Canary' => 'Canary',
		'Atlantic/Cape_Verde' => 'Cape Verde',
		'Atlantic/Faroe' => 'Faroe',
		'Atlantic/Madeira' => 'Madeira',
		'Atlantic/Reykjavik' => 'Reykjavik',
		'Atlantic/South_Georgia' => 'South Georgia',
		'Atlantic/St_Helena' => 'St Helena',
		'Atlantic/Stanley' => 'Stanley',
	),
	'Australia' => array(
		'Australia/Adelaide' => 'Adelaide',
		'Australia/Brisbane' => 'Brisbane',
		'Australia/Broken_Hill' => 'Broken Hill',
		'Australia/Darwin' => 'Darwin',
		'Australia/Eucla' => 'Eucla',
		'Australia/Hobart' => 'Hobart',
		'Australia/Lindeman' => 'Lindeman',
		'Australia/Lord_Howe' => 'Lord Howe',
		'Australia/Melbourne' => 'Melbourne',
		'Australia/Perth' => 'Perth',
		'Australia/Sydney' => 'Sydney',
	),
	'Europe' => array(
		'Europe/Amsterdam' => 'Amsterdam',
		'Europe/Andorra' => 'Andorra',
		'Europe/Astrakhan' => 'Astrakhan',
		'Europe/Athens' => 'Athens',
		'Europe/Belgrade' => 'Belgrade',
		'Europe/Berlin' => 'Berlin',
		'Europe/Bratislava' => 'Bratislava',
		'Europe/Brussels' => 'Brussels',
		'Europe/Bucharest' => 'Bucharest',
		'Europe/Budapest' => 'Budapest',
		'Europe/Busingen' => 'Busingen',
		'Europe/Chisinau' => 'Chisinau',
		'Europe/Copenhagen' => 'Copenhagen',
		'Europe/Dublin' => 'Dublin',
		'Europe/Gibraltar' => 'Gibraltar',
		'Europe/Guernsey' => 'Guernsey',
		'Europe/Helsinki' => 'Helsinki',
		'Europe/Isle_of_Man' => 'Isle of Man',
		'Europe/Istanbul' => 'Istanbul',
		'Europe/Jersey' => 'Jersey',
		'Europe/Kaliningrad' => 'Kaliningrad',
		'Europe/Kirov' => 'Kirov',
		'Europe/Kyiv' => 'Kyiv',
		'Europe/Lisbon' => 'Lisbon',
		'Europe/Ljubljana' => 'Ljubljana',
		'Europe/London' => 'London',
		'Europe/Luxembourg' => 'Luxembourg',
		'Europe/Madrid' => 'Madrid',
		'Europe/Malta' => 'Malta',
		'Europe/Mariehamn' => 'Mariehamn',
		'Europe/Minsk' => 'Minsk',
		'Europe/Monaco' => 'Monaco',
		'Europe/Moscow' => 'Moscow',
		'Europe/Oslo' => 'Oslo',
		'Europe/Paris' => 'Paris',
		'Europe/Podgorica' => 'Podgorica',
		'Europe/Prague' => 'Prague',
		'Europe/Riga' => 'Riga',
		'Europe/Rome' => 'Rome',
		'Europe/Samara' => 'Samara',
		'Europe/San_Marino' => 'San Marino',
		'Europe/Sarajevo' => 'Sarajevo',
		'Europe/Saratov' => 'Saratov',
		'Europe/Simferopol' => 'Simferopol',
		'Europe/Skopje' => 'Skopje',
		'Europe/Sofia' => 'Sofia',
		'Europe/Stockholm' => 'Stockholm',
		'Europe/Tallinn' => 'Tallinn',
		'Europe/Tirane' => 'Tirane',
		'Europe/Ulyanovsk' => 'Ulyanovsk',
		'Europe/Vaduz' => 'Vaduz',
		'Europe/Vatican' => 'Vatican',
		'Europe/Vienna' => 'Vienna',
		'Europe/Vilnius' => 'Vilnius',
		'Europe/Volgograd' => 'Volgograd',
		'Europe/Warsaw' => 'Warsaw',
		'Europe/Zagreb' => 'Zagreb',
		'Europe/Zurich' => 'Zurich',
	),
	'Indian' => array(
		'Indian/Antananarivo' => 'Antananarivo',
		'Indian/Chagos' => 'Chagos',
		'Indian/Christmas' => 'Christmas',
		'Indian/Cocos' => 'Cocos',
		'Indian/Comoro' => 'Comoro',
		'Indian/Kerguelen' => 'Kerguelen',
		'Indian/Mahe' => 'Mahe',
		'Indian/Maldives' => 'Maldives',
		'Indian/Mauritius' => 'Mauritius',
		'Indian/Mayotte' => 'Mayotte',
		'Indian/Reunion' => 'Reunion',
	),
	'Pacific' => array(
		'Pacific/Apia' => 'Apia',
		'Pacific/Auckland' => 'Auckland',
		'Pacific/Bougainville' => 'Bougainville',
		'Pacific/Chatham' => 'Chatham',
		'Pacific/Chuuk' => 'Chuuk',
		'Pacific/Easter' => 'Easter',
		'Pacific/Efate' => 'Efate',
		'Pacific/Fakaofo' => 'Fakaofo',
		'Pacific/Fiji' => 'Fiji',
		'Pacific/Funafuti' => 'Funafuti',
		'Pacific/Galapagos' => 'Galapagos',
		'Pacific/Gambier' => 'Gambier',
		'Pacific/Guadalcanal' => 'Guadalcanal',
		'Pacific/Guam' => 'Guam',
		'Pacific/Honolulu' => 'Honolulu',
		'Pacific/Kanton' => 'Kanton',
		'Pacific/Kiritimati' => 'Kiritimati',
		'Pacific/Kosrae' => 'Kosrae',
		'Pacific/Kwajalein' => 'Kwajalein',
		'Pacific/Majuro' => 'Majuro',
		'Pacific/Marquesas' => 'Marquesas',
		'Pacific/Midway' => 'Midway',
		'Pacific/Nauru' => 'Nauru',
		'Pacific/Niue' => 'Niue',
		'Pacific/Norfolk' => 'Norfolk',
		'Pacific/Noumea' => 'Noumea',
		'Pacific/Pago_Pago' => 'Pago Pago',
		'Pacific/Palau' => 'Palau',
		'Pacific/Pitcairn' => 'Pitcairn',
		'Pacific/Pohnpei' => 'Pohnpei',
		'Pacific/Port_Moresby' => 'Port Moresby',
		'Pacific/Rarotonga' => 'Rarotonga',
		'Pacific/Saipan' => 'Saipan',
		'Pacific/Tahiti' => 'Tahiti',
		'Pacific/Tarawa' => 'Tarawa',
		'Pacific/Tongatapu' => 'Tongatapu',
		'Pacific/Wake' => 'Wake',
		'Pacific/Wallis' => 'Wallis',
	),
		);
	$wp_ja_kinetic_today    = current_datetime();
	$wp_ja_kinetic_cal_from = $wp_ja_kinetic_today->modify( 'first day of this month' )->setTime( 0, 0 );
	$wp_ja_kinetic_cal_from = $wp_ja_kinetic_cal_from->modify( '-' . (int) $wp_ja_kinetic_cal_from->format( 'w' ) . ' days' );
	$wp_ja_kinetic_choice   = 1;
	$wp_ja_kinetic_group    = 0;
	?>
	<div class="kinetic-auth__card">
		<form id="member-profile" action="<?php echo esc_url( add_query_arg( 'layout', 'edit', get_permalink() ) ); ?>" method="post" class="com-users-profile__edit-form form-validate" enctype="multipart/form-data">
			<fieldset>
				<legend>Edit Your Profile</legend>
				<input type="hidden" name="jform[id]" id="jform_id" value="<?php echo esc_attr( (string) $wp_ja_kinetic_edit_user->ID ); ?>">
				<div class="control-group">
					<div class="control-label">
						<label id="jform_name-lbl" for="jform_name" class="required">Name<span class="star" aria-hidden="true">&#160;*</span></label>
					</div>
					<div class="controls">
						<input type="text" name="wp_ja_kinetic_display_name" id="jform_name" value="<?php echo esc_attr( $wp_ja_kinetic_edit_user->display_name ); ?>" class="form-control required" size="30" required autocomplete="off">
					</div>
				</div>
				<div class="control-group">
					<div class="control-label">
						<label id="jform_username-lbl" for="jform_username">Username</label>
					</div>
					<div class="controls">
						<input type="text" id="jform_username" value="<?php echo esc_attr( $wp_ja_kinetic_edit_user->user_login ); ?>" class="form-control" size="30" title="If you want to change your username, please contact a site administrator." readonly autocomplete="off">
					</div>
				</div>
				<div class="control-group">
					<div class="control-label">
						<label id="jform_password1-lbl" for="jform_password1">Password</label>
					</div>
					<div class="controls">
						<div id="jform[password1]-rules" class="small text-muted"><strong>Minimum Requirements</strong> — Characters: 4</div>
						<div class="password-group">
							<div class="input-group">
								<input type="password" name="wp_ja_kinetic_password1" id="jform_password1" value="" autocomplete="new-password" class="form-control js-password-strength validate-password" aria-describedby="jform[password1]-rules" size="30" maxlength="99" minlength="6">
								<button type="button" class="btn btn-secondary input-password-toggle" data-wp-ja-kinetic-password-toggle aria-controls="jform_password1">
									<span class="icon-eye icon-fw" aria-hidden="true"></span>
									<span class="visually-hidden">Show Password</span>
								</button>
							</div>
						</div>
					</div>
				</div>
				<div class="control-group">
					<div class="control-label">
						<label id="jform_password2-lbl" for="jform_password2">Confirm Password</label>
					</div>
					<div class="controls">
						<div class="password-group">
							<div class="input-group">
								<input type="password" name="wp_ja_kinetic_password2" id="jform_password2" value="" autocomplete="new-password" class="form-control validate-password" size="30" maxlength="99" minlength="6">
								<button type="button" class="btn btn-secondary input-password-toggle" data-wp-ja-kinetic-password-toggle aria-controls="jform_password2">
									<span class="icon-eye icon-fw" aria-hidden="true"></span>
									<span class="visually-hidden">Show Password</span>
								</button>
							</div>
						</div>
					</div>
				</div>
				<div class="control-group">
					<div class="control-label">
						<label id="jform_email1-lbl" for="jform_email1" class="required">Email Address<span class="star" aria-hidden="true">&#160;*</span></label>
					</div>
					<div class="controls">
						<input type="email" name="wp_ja_kinetic_email" class="form-control validate-email required" id="jform_email1" value="<?php echo esc_attr( $wp_ja_kinetic_edit_user->user_email ); ?>" size="30" autocomplete="email" required>
					</div>
				</div>
			</fieldset>
			<fieldset>
				<legend>Basic Settings</legend>
				<div class="control-group">
					<div class="control-label">
						<label id="jform_params_editor-lbl" for="jform_params_editor">Editor</label>
					</div>
					<div class="controls">
						<select id="jform_params_editor" name="jform[params][editor]" class="custom-select">
							<?php foreach ( $wp_ja_kinetic_editors as $wp_ja_kinetic_val => $wp_ja_kinetic_label ) : ?>
								<option value="<?php echo esc_attr( $wp_ja_kinetic_val ); ?>"<?php selected( '', $wp_ja_kinetic_val ); ?>><?php echo esc_html( $wp_ja_kinetic_label ); ?></option>
							<?php endforeach; ?>
						</select>
					</div>
				</div>
				<div class="control-group">
					<div class="control-label">
						<label id="jform_params_timezone-lbl" for="jform_params_timezone">Time Zone</label>
					</div>
					<div class="controls">
						<joomla-field-fancy-select placeholder="Type or select some options"><div class="choices" data-type="select-one" tabindex="0" role="combobox" aria-autocomplete="list" aria-haspopup="true" aria-expanded="false"><div class="choices__inner"><select id="jform_params_timezone" name="jform[params][timezone]" class="choices__input" hidden tabindex="-1" data-choice="active">
							<option value="" selected>- Use Default -</option>
							<?php foreach ( $wp_ja_kinetic_timezones as $wp_ja_kinetic_continent => $wp_ja_kinetic_zones ) : ?>
								<optgroup label="<?php echo esc_attr( $wp_ja_kinetic_continent ); ?>">
									<?php foreach ( $wp_ja_kinetic_zones as $wp_ja_kinetic_val => $wp_ja_kinetic_label ) : ?>
										<option value="<?php echo esc_attr( $wp_ja_kinetic_val ); ?>"><?php echo esc_html( $wp_ja_kinetic_label ); ?></option>
									<?php endforeach; ?>
								</optgroup>
							<?php endforeach; ?>
						</select><div class="choices__list choices__list--single" role="listbox"><div class="choices__item choices__item--selectable" data-item data-id="1" data-value="" aria-selected="true" role="option" data-deletable>- Use Default -<button type="button" class="choices__button_joomla" aria-label="Remove item: - Use Default -" data-button>Remove item</button></div></div></div><div class="choices__list choices__list--dropdown" aria-expanded="false"><input type="search" class="choices__input choices__input--cloned" autocomplete="off" autocapitalize="off" spellcheck="false" aria-autocomplete="list" aria-label="Type or select some options" placeholder=""><div class="choices__list" role="listbox"><div class="choices__item choices__item--choice is-selected choices__item--selectable is-highlighted" role="option" data-choice data-id="1" data-value="" data-choice-selectable aria-selected="true">- Use Default -</div><?php
						foreach ( $wp_ja_kinetic_timezones as $wp_ja_kinetic_continent => $wp_ja_kinetic_zones ) :
							++$wp_ja_kinetic_group;
							?><div class="choices__group" role="group" data-group data-id="<?php echo (int) $wp_ja_kinetic_group; ?>" data-value="<?php echo esc_attr( $wp_ja_kinetic_continent ); ?>"><div class="choices__heading"><?php echo esc_html( $wp_ja_kinetic_continent ); ?></div></div><?php
							foreach ( $wp_ja_kinetic_zones as $wp_ja_kinetic_val => $wp_ja_kinetic_label ) :
								++$wp_ja_kinetic_choice;
								?><div class="choices__item choices__item--choice choices__item--selectable" role="treeitem" data-choice data-id="<?php echo (int) $wp_ja_kinetic_choice; ?>" data-value="<?php echo esc_attr( $wp_ja_kinetic_val ); ?>" data-group-id="<?php echo (int) $wp_ja_kinetic_group; ?>" data-choice-selectable aria-selected="false"><?php echo esc_html( $wp_ja_kinetic_label ); ?></div><?php
							endforeach;
						endforeach;
						?></div></div></div></joomla-field-fancy-select>
					</div>
				</div>
				<div class="control-group">
					<div class="control-label">
						<label id="jform_params_language-lbl" for="jform_params_language">Frontend Language</label>
					</div>
					<div class="controls">
						<select id="jform_params_language" name="jform[params][language]" class="custom-select">
							<?php foreach ( $wp_ja_kinetic_languages as $wp_ja_kinetic_val => $wp_ja_kinetic_label ) : ?>
								<option value="<?php echo esc_attr( $wp_ja_kinetic_val ); ?>"<?php selected( '', $wp_ja_kinetic_val ); ?>><?php echo esc_html( $wp_ja_kinetic_label ); ?></option>
							<?php endforeach; ?>
						</select>
					</div>
				</div>
				<div class="control-group">
					<div class="control-label">
						<label id="jform_params_colorScheme-lbl" for="jform_params_colorScheme">Dark Mode</label>
					</div>
					<div class="controls">
						<select id="jform_params_colorScheme" name="jform[params][colorScheme]" class="custom-select">
							<?php foreach ( $wp_ja_kinetic_color_schemes as $wp_ja_kinetic_val => $wp_ja_kinetic_label ) : ?>
								<option value="<?php echo esc_attr( $wp_ja_kinetic_val ); ?>"<?php selected( '', $wp_ja_kinetic_val ); ?>><?php echo esc_html( $wp_ja_kinetic_label ); ?></option>
							<?php endforeach; ?>
						</select>
					</div>
				</div>
			</fieldset>
			<fieldset>
				<legend>User info</legend>
				<div class="control-group">
					<div class="control-label">
						<label id="jform_profile_user_avatar-lbl" for="jform_profile_user_avatar">Avatar</label>
					</div>
					<div class="controls">
						<joomla-field-media class="field-media-wrapper" type="image" preview="static" preview-container=".field-media-preview" preview-width="200" preview-height="200">
							<div id="imageModal_jform_profile_user_avatar" role="dialog" tabindex="-1" class="joomla-modal modal fade">
								<div class="modal-dialog modal-lg jviewport-width80">
									<div class="modal-content">
										<div class="modal-header">
											<h3 class="modal-title">Change Image</h3>
											<button type="button" class="btn-close novalidate" data-bs-dismiss="modal" aria-label="Close"></button>
										</div>
										<div class="modal-body jviewport-height60"></div>
										<div class="modal-footer">
											<button type="button" class="btn btn-success button-save-selected">Select</button><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
										</div>
									</div>
								</div>
							</div>
							<div class="field-media-preview"><span class="field-media-preview-icon"></span></div>
							<div class="input-group">
								<input type="text" name="jform[profile][user_avatar]" id="jform_profile_user_avatar" value="" class="form-control field-media-input">
								<button type="button" class="btn btn-success button-select">Select</button>
							</div>
						</joomla-field-media>
					</div>
				</div>
				<div class="control-group">
					<div class="control-label">
						<label id="jform_profile_user_jobtitle-lbl" for="jform_profile_user_jobtitle">User Position</label>
					</div>
					<div class="controls">
						<input type="text" name="jform[profile][user_jobtitle]" id="jform_profile_user_jobtitle" value="" class="form-control" title="Add position of the user, example: CEO, JoomlArt" autocomplete="off">
					</div>
				</div>
				<div class="control-group">
					<div class="control-label">
						<label id="jform_profile_aboutme-lbl" for="jform_profile_aboutme">About Me</label>
					</div>
					<div class="controls">
						<textarea name="jform[profile][aboutme]" id="jform_profile_aboutme" cols="30" rows="5" class="form-control" autocomplete="off"></textarea>
					</div>
				</div>
				<div class="control-group">
					<div class="control-label">
						<label id="jform_profile_user_social-lbl" for="jform_profile_user_social">Social Info</label>
					</div>
					<div class="controls">
						<input name="jform[profile][user_social]" type="hidden" value="">
						<div class="subform-repeatable-wrapper subform-table-layout subform-table-sublayout-section">
							<joomla-field-subform class="subform-repeatable" name="jform[profile][user_social]" minimum="0" maximum="1000">
								<div class="table-responsive">
									<table class="table" id="subfieldList_jform_profile_user_social">
										<caption class="visually-hidden">Repeatable Fields</caption>
										<thead>
											<tr>
												<th scope="col" style="width:45%">Social Name <span class="icon-info-circle" aria-hidden="true" tabindex="0"></span><div role="tooltip" id="tip-jform_profile__user_social__user_socialX__social_name">Add social channel</div></th><th scope="col" style="width:45%">Social Link <span class="icon-info-circle" aria-hidden="true" tabindex="0"></span><div role="tooltip" id="tip-jform_profile__user_social__user_socialX__social_link">Add social channel link</div></th><th scope="col" style="width:45%">Social Icon <span class="icon-info-circle" aria-hidden="true" tabindex="0"></span><div role="tooltip" id="tip-jform_profile__user_social__user_socialX__social_icon">Find <a href="https://fontawesome.com/icons?d=gallery&amp;p=2" target="_Blank">icon</a></div></th>
												<td style="width:8%;">
													<div class="btn-group">
														<button type="button" class="group-add btn btn-success" aria-label="Add">
															<span class="icon-plus" aria-hidden="true"></span>
														</button>
													</div>
												</td>
											</tr>
										</thead>
										<tbody class="subform-repeatable-container"></tbody>
									</table>
								</div>
							</joomla-field-subform>
						</div>
					</div>
				</div>
				<?php
				foreach (
					array(
						'address1'    => array( 'Address 1', 'text' ),
						'address2'    => array( 'Address 2', 'text' ),
						'city'        => array( 'City', 'text' ),
						'region'      => array( 'Region', 'text' ),
						'country'     => array( 'Country', 'text' ),
						'postal_code' => array( 'Postal/ZIP Code', 'text' ),
						'phone'       => array( 'Phone', 'tel' ),
						'website'     => array( 'Website', 'url' ),
						'favoritebook' => array( 'Favourite Book', 'text' ),
					) as $wp_ja_kinetic_key => $wp_ja_kinetic_field
				) :
					?>
				<div class="control-group">
					<div class="control-label">
						<label id="jform_profile_<?php echo esc_attr( $wp_ja_kinetic_key ); ?>-lbl" for="jform_profile_<?php echo esc_attr( $wp_ja_kinetic_key ); ?>"><?php echo esc_html( $wp_ja_kinetic_field[0] ); ?></label>
					</div>
					<div class="controls">
						<input type="<?php echo esc_attr( $wp_ja_kinetic_field[1] ); ?>" name="jform[profile][<?php echo esc_attr( $wp_ja_kinetic_key ); ?>]" id="jform_profile_<?php echo esc_attr( $wp_ja_kinetic_key ); ?>" value="" class="form-control" size="30" autocomplete="off">
					</div>
				</div>
				<?php endforeach; ?>
				<div class="control-group">
					<div class="control-label">
						<label id="jform_profile_dob-lbl" for="jform_profile_dob">Date of Birth</label>
					</div>
					<div class="controls">
						<div class="field-calendar">
							<div class="input-group">
								<input type="text" id="jform_profile_dob" name="jform[profile][dob]" value="" class="form-control" placeholder="YYYY-MM-DD" data-alt-value="" autocomplete="off">
								<button type="button" class="btn btn-primary" id="jform_profile_dob_btn" title="Open the calendar"><span class="icon-calendar" aria-hidden="true"></span>
									<span class="visually-hidden">Open the calendar</span>
								</button>
							</div>
							<?php // The source's calendar.js popup (hidden until the button opens it), same month grid: six Sunday-first weeks with ISO week numbers. ?>
							<div class="js-calendar" hidden><div class="calendar-container"><table class="table"><thead class="calendar-header"><tr class="calendar-head-row"><td colspan="1" class=" nav"><a class="js-btn btn-prev-year">‹</a></td><td colspan="6" class="title title-year"><div><div><span><?php echo esc_html( $wp_ja_kinetic_today->format( 'Y' ) ); ?></span></div></div></td><td colspan="1" class=" nav"><a class="js-btn btn-next-year"> ›</a></td></tr><tr class="calendar-head-row"><td colspan="1" class=" nav"><a class="js-btn btn-prev-month">‹</a></td><td colspan="6" class="title title-month"><div><div><span><?php echo esc_html( $wp_ja_kinetic_today->format( 'F' ) ); ?></span></div></div></td><td colspan="1" class=" nav"><a class="js-btn btn-next-month"> ›</a></td></tr><tr class="daynames wk"><td class="day-name wn">wk</td><?php foreach ( array( 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ) as $wp_ja_kinetic_dn ) : ?><td class="day-name day-name-week"><?php echo esc_html( $wp_ja_kinetic_dn ); ?></td><?php endforeach; ?></tr></thead><tbody><?php
							for ( $wp_ja_kinetic_w = 0; $wp_ja_kinetic_w < 6; $wp_ja_kinetic_w++ ) :
								$wp_ja_kinetic_sun = $wp_ja_kinetic_cal_from->modify( '+' . ( 7 * $wp_ja_kinetic_w ) . ' days' );
								?><tr class="daysrow wk"><td class="day wn"><?php echo (int) $wp_ja_kinetic_sun->format( 'W' ); ?></td><?php
								for ( $wp_ja_kinetic_d = 0; $wp_ja_kinetic_d < 7; $wp_ja_kinetic_d++ ) :
									$wp_ja_kinetic_day     = $wp_ja_kinetic_sun->modify( '+' . $wp_ja_kinetic_d . ' days' );
									$wp_ja_kinetic_weekend = 0 === $wp_ja_kinetic_d || 6 === $wp_ja_kinetic_d;
									if ( $wp_ja_kinetic_day->format( 'm' ) !== $wp_ja_kinetic_today->format( 'm' ) ) {
										$wp_ja_kinetic_day_class = 'day disabled othermonth ' . ( $wp_ja_kinetic_weekend ? 'weekend' : '' );
									} elseif ( $wp_ja_kinetic_day->format( 'Y-m-d' ) === $wp_ja_kinetic_today->format( 'Y-m-d' ) ) {
										$wp_ja_kinetic_day_class = 'day selected today';
									} else {
										$wp_ja_kinetic_day_class = $wp_ja_kinetic_weekend ? 'day weekend' : 'day';
									}
									?><td class="<?php echo esc_attr( $wp_ja_kinetic_day_class ); ?>"><?php echo (int) $wp_ja_kinetic_day->format( 'j' ); ?></td><?php
								endfor;
								?></tr><?php
							endfor;
							?></tbody></table><div class="buttons-wrapper btn-group"><button type="button" data-action="clear" class="js-btn btn btn-clear">Clear</button><button type="button" data-action="today" class="js-btn btn btn-today">Today</button><button type="button" data-action="exit" class="js-btn btn btn-exit">Close</button></div></div></div>
						</div>
					</div>
				</div>
			</fieldset>
			<fieldset>
				<legend>Fields</legend>
				<div class="control-group">
					<div class="control-label">
						<label id="jform_com_fields_company-lbl" for="jform_com_fields_company">Company</label>
					</div>
					<div class="controls">
						<input type="text" name="jform[com_fields][company]" id="jform_com_fields_company" value="" class="form-control" disabled autocomplete="off">
					</div>
				</div>
			</fieldset>
			<?php if ( '' !== $wp_ja_kinetic_edit_error ) : ?>
				<p class="hx-muted"><?php echo esc_html( $wp_ja_kinetic_edit_error ); ?></p>
			<?php endif; ?>
			<div class="com-users-profile__edit-submit control-group">
				<div class="controls">
					<button type="submit" class="btn btn-primary validate">
						<span>Save changes</span>
					</button>
					<a class="btn btn-danger" href="<?php echo esc_url( get_permalink() ); ?>" title="Cancel">Cancel</a>
					<input type="hidden" name="wp_ja_kinetic_profile_edit" value="1">
					<?php wp_referer_field(); ?>
				</div>
			</div>
			<input type="hidden" name="wp_ja_kinetic_nonce" value="<?php echo esc_attr( wp_create_nonce( 'wp_ja_kinetic_profile_edit' ) ); ?>">
		</form>
	</div>
	<?php
	return;
}

$wp_ja_kinetic_user  = wp_get_current_user();
$wp_ja_kinetic_name  = trim( (string) $wp_ja_kinetic_user->display_name );
$wp_ja_kinetic_parts = preg_split( '/\s+/', $wp_ja_kinetic_name, -1, PREG_SPLIT_NO_EMPTY );

$wp_ja_kinetic_initials = '';
if ( $wp_ja_kinetic_parts ) {
	$wp_ja_kinetic_initials = strtoupper( mb_substr( $wp_ja_kinetic_parts[0], 0, 1 ) );
	if ( count( $wp_ja_kinetic_parts ) > 1 ) {
		$wp_ja_kinetic_initials .= strtoupper( mb_substr( $wp_ja_kinetic_parts[ count( $wp_ja_kinetic_parts ) - 1 ], 0, 1 ) );
	}
}

$wp_ja_kinetic_role_names = wp_roles()->role_names;
$wp_ja_kinetic_roles      = array_map(
	static function ( $role ) use ( $wp_ja_kinetic_role_names ) {
		return wp_ja_kinetic_profile_group_label( $role, translate_user_role( $wp_ja_kinetic_role_names[ $role ] ?? $role ) );
	},
	$wp_ja_kinetic_user->roles
);
$wp_ja_kinetic_role_line = implode( ', ', $wp_ja_kinetic_roles );
$wp_ja_kinetic_since     = mysql2date( 'l, d F Y', $wp_ja_kinetic_user->user_registered );
?>
<div class="kinetic-profile__split">
	<aside class="kinetic-profile__identity">
		<div class="kinetic-profile__avatar"><span><?php echo esc_html( $wp_ja_kinetic_initials ); ?></span></div>
		<div class="kinetic-profile__id-meta">
			<div class="kinetic-profile__name"><?php echo esc_html( $wp_ja_kinetic_name ); ?></div>
			<div class="kinetic-profile__email"><?php echo esc_html( $wp_ja_kinetic_user->user_email ); ?></div>
		</div>
		<a class="kinetic-profile__edit-btn" href="<?php echo esc_url( add_query_arg( 'layout', 'edit', get_permalink() ) ); ?>">Edit Profile</a>
		<a class="kinetic-profile__logout" href="<?php echo esc_url( wp_logout_url( home_url( '/' ) ) ); ?>">Sign out</a>
	</aside>

	<div class="kinetic-profile__main">
		<section class="kinetic-profile__card">
			<h2 class="kinetic-profile__card-head">ACCOUNT DETAILS</h2>
			<dl class="kinetic-profile__grid">
				<div class="kinetic-profile__field">
					<dt>Name</dt>
					<dd><?php echo esc_html( $wp_ja_kinetic_name ); ?></dd>
				</div>
				<div class="kinetic-profile__field">
					<dt>Username</dt>
					<dd><?php echo esc_html( $wp_ja_kinetic_user->user_login ); ?></dd>
				</div>
				<div class="kinetic-profile__field">
					<dt>Email</dt>
					<dd><?php echo esc_html( $wp_ja_kinetic_user->user_email ); ?></dd>
				</div>
				<div class="kinetic-profile__field">
					<dt>Member since</dt>
					<dd><?php echo esc_html( $wp_ja_kinetic_since ); ?></dd>
				</div>
				<?php if ( '' !== $wp_ja_kinetic_role_line ) : ?>
				<div class="kinetic-profile__field">
					<dt>Group</dt>
					<dd><?php echo esc_html( $wp_ja_kinetic_role_line ); ?></dd>
				</div>
				<?php endif; ?>
			</dl>
		</section>
	</div>
</div>
