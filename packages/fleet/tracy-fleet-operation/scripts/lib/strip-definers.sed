# The definer clauses mariadb-dump writes as STATEMENT SYNTAX, dropped; nothing else is touched.
# Used with `sed -E -f` by provision/fold.sh and unfold.sh (farm-common.sh `farm_strip_definers`),
# provision/restore.sh and webroot/webroot-backup.sh, whenever a dump is imported as a user that may
# not be the account it names (a farm demo's own user, or another server's root). Each object then
# runs as its importer.
#
# Only on the lines that BEGIN one of the dump's object statements, and only the first clause there:
#   /*!50003 CREATE*/ /*!50017 DEFINER=`u`@`h`*/ /*!50003 TRIGGER …     (triggers)
#   /*!50106 CREATE*/ /*!50117 DEFINER=`u`@`h`*/ /*!50106 EVENT …       (events)
#   /*!50013 DEFINER=`u`@`h` SQL SECURITY DEFINER|INVOKER */             (views, a line of its own)
#   CREATE DEFINER=`u`@`h` PROCEDURE|FUNCTION …                          (routines)
# A row whose TEXT holds any of these (an INSERT line, one per row) is never changed: a regex over
# every line deleted such text from the content itself.
/^\/\*!50003 CREATE\*\/ \/\*!50017 DEFINER=/ s/\/\*!50017 DEFINER=`([^`]|``)*`@`([^`]|``)*`\*\/ //
/^\/\*!50106 CREATE\*\/ \/\*!50117 DEFINER=/ s/\/\*!50117 DEFINER=`([^`]|``)*`@`([^`]|``)*`\*\/ //
/^\/\*!50013 DEFINER=`([^`]|``)*`@`([^`]|``)*` SQL SECURITY [A-Z]+ \*\/$/ s/^\/\*!50013 DEFINER=`([^`]|``)*`@`([^`]|``)*` /\/*!50013 /
/^CREATE DEFINER=/ s/^CREATE DEFINER=`([^`]|``)*`@`([^`]|``)*` /CREATE /
