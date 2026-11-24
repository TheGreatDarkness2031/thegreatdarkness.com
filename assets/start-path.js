// VISITOR PASS (homepage) settings. Edit freely.
//
// SUGGESTED READING: the reading path, in order. Each entry is one record:
//   log: "maintenance" with id = the maintenance log entry number (#1, #42 ...)
//   log: "watch"       with id = the watch log record id (199800001 ...)
// The text is read from the published logs (/data/maintenance/<year>.json,
// /data/watch/WatchLog_<year>.json) when a visitor opens the path, so a
// record changed in the sheet shows its current wording.
window.OER_START_PATH = [
  { log: "maintenance", id: "1" },          // 1996-01-02 Voss: study phase begins
  { log: "maintenance", id: "42" },         // 1996-04-12 Voss: NEXUS architecture authorized
  { log: "maintenance", id: "142" },        // 1996-10-16 Rusk: first live collectors
  { log: "maintenance", id: "162" },        // 1996-11-18 Keene: first rack in the machine room
  { log: "maintenance", id: "203" },        // 1997-02-10 Keene: ice storm, first real outage
  { log: "maintenance", id: "384" },        // 1997-11-07 Voss: approval for a staffed watch floor
  { log: "maintenance", id: "453" },        // 1998-01-27 Keene: watch floor first power-up
  { log: "watch", id: "199800001" },        // 1998-04-15 Kowalski: watch log opens
  { log: "maintenance", id: "597" },        // 1998-07-01 Voss: OER Central commissioned
  { log: "watch", id: "199800810" }         // 1998-07-01 Kowalski: commissioning day
];
