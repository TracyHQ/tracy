<?php
if (PHP_SAPI !== 'cli') exit(1);
require '/var/www/html/configuration.php';
$c=new JConfig;
$db=new mysqli($c->host,$c->user,$c->password,$c->db);
$prefix=$c->dbprefix;
$id=(int)$db->query("SELECT u.id FROM {$prefix}users u JOIN {$prefix}user_usergroup_map g ON u.id=g.user_id WHERE g.group_id=8 AND u.block=0 ORDER BY u.id LIMIT 1")->fetch_row()[0];
if (!$id) throw new RuntimeException('No fixture administrator');
$seed=random_bytes(32);$encoded=base64_encode($seed);
$db->query("DELETE FROM {$prefix}user_profiles WHERE user_id=$id AND profile_key IN ('joomlatoken.token','joomlatoken.enabled')");
$db->query("INSERT INTO {$prefix}user_profiles VALUES ($id,'joomlatoken.token','$encoded',1),($id,'joomlatoken.enabled','1',2)");
$db->query("UPDATE {$prefix}extensions SET enabled=1 WHERE type='plugin' AND ((folder='api-authentication' AND element='token') OR (folder='webservices' AND element IN ('content','media')))");
$token=base64_encode('sha256:'.$id.':'.hash_hmac('sha256',$seed,$c->secret));
file_put_contents('/tmp/content-api-cms-token.json',json_encode(['token'=>$token]));chmod('/tmp/content-api-cms-token.json',0600);
echo "Fixture API credential configured\n";
