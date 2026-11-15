// The door client of the draft write moved into the Website Opportunities domain (ticket #585), where the app's
// write step imports it: `website-opportunities/domain/site-doors.mjs`, or `siteDoors` from `website-opportunities/domain`.
// This file keeps the old path working for the scripts that still name it.
export * from '../../packages/wo/website-opportunities/domain/site-doors.mjs'
