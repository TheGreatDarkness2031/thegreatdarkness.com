/* Monitor page times (2026-11-12): every time on a monitor page is shown
   in facility time (the Apps Script time zone, sent with each answer as
   timeZone) as YYYY-MM-DD HH:MM, the same as the Monitoring Grid pages'
   LAST CHECK line. oerMonitorTime(value) takes a Date, millis or ISO text
   for a real instant; oerMonitorTime.zone is set from the first answer. */
(function (root) {
  function pad(n) { return String(n).padStart(2, "0"); }

  function oerMonitorTime(value, withDate) {
    if (value === null || value === undefined || value === "") return "--";
    var date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return String(value);
    var parts = {};
    try {
      new Intl.DateTimeFormat("en-US", {
        timeZone: oerMonitorTime.zone || undefined,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23"
      }).formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
    } catch (e) {
      parts = { year: date.getFullYear(), month: pad(date.getMonth() + 1), day: pad(date.getDate()), hour: pad(date.getHours()), minute: pad(date.getMinutes()) };
    }
    var time = parts.hour + ":" + parts.minute;
    if (withDate === false) return time;
    return parts.year + "-" + parts.month + "-" + parts.day + " " + time;
  }

  oerMonitorTime.zone = "";

  // Remembers the facility time zone from a server answer.
  oerMonitorTime.useZone = function (zone) {
    if (zone && typeof zone === "string") oerMonitorTime.zone = zone;
  };

  // The LAST CHECK // LAST GOOD DATA // SOURCE TIME line.
  oerMonitorTime.line = function (data) {
    return "LAST CHECK: " + (data.lastCheck || "--") +
      " // LAST GOOD DATA: " + (data.lastGood || "--") +
      (data.sourceAt ? " // SOURCE TIME: " + data.sourceAt : "");
  };

  root.oerMonitorTime = oerMonitorTime;
})(window);
