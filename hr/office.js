/* Personnel Office: PHONE TREE, BULLETIN BOARD, FORMS and HANDBOOK tabs
   (2026-11-09). The page (hr/index.html) calls HR_VIEWS[view](pane, h)
   with its helpers h. Everything is built from hr/data.js (people) and
   hr/forms/forms.js (the forms rack), so it always agrees with the
   directory and the logs. Extensions are internal only; home numbers are
   never shown. */
(function () {
  var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  var LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  function nthWeekday(y, m, weekday, n) {          // n-th weekday (0 = Sunday) of month m (1-12); n = -1 last
    if (n > 0) {
      var first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
      return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
    }
    var lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var lastW = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay();
    return lastDay - ((lastW - weekday + 7) % 7);
  }
  function longDate(s) { var p = s.split("-"); return +p[2] + " " + LONG[+p[1] - 1] + " " + p[0]; }

  // ---------------- extensions ----------------
  var EXT = null;
  function extensions(people) {
    if (EXT) return EXT;
    EXT = {};
    people.slice().sort(function (a, b) {
      return a.hire === b.hire ? (a.id < b.id ? -1 : 1) : (a.hire < b.hire ? -1 : 1);
    }).forEach(function (p, i) { EXT[p.id] = String(4101 + i); });
    return EXT;
  }

  // ---------------- PHONE TREE ----------------
  var RANK = ["Watch Lead", "Watch COMM", "Watch Correlation", "Watch Monitoring", "Watch Relief"];
  function rankOf(p) {
    if (/Technical Lead/.test(p.title)) return -1;
    var i = RANK.indexOf(p.title);
    return i < 0 ? 50 : i;
  }

  function phoneTree(pane, h) {
    var year = Math.max(1998, h.year);
    var day = year + "-10-01";
    pane.appendChild(h.el("h2", null, "EMERGENCY CALL-OUT TREE"));
    pane.appendChild(h.el("p", "note", "AS OF 1 OCTOBER " + year + ". WHEN A CALL-OUT IS STARTED, CALL THE PEOPLE LISTED UNDER YOUR NAME. IF SOMEONE CANNOT BE REACHED IN 10 MINUTES, CALL THE PEOPLE THEY WOULD HAVE CALLED. REPORT BACK UP THE TREE WHEN YOUR BRANCH IS COMPLETE. HOME NUMBERS ARE HELD IN THE SEALED CONTACT FILE."));
    var c = h.el("div", "controls");
    c.appendChild(h.el("label", null, "YEAR"));
    c.appendChild(h.yearSelect(year, function (y) { h.go("?view=phone&year=" + y); }, 1998));
    var staff = h.people.filter(function (p) { return p.dept !== "NX" && h.onStaff(p, day); });
    c.appendChild(h.el("span", "count", staff.length + " ON THE TREE"));
    pane.appendChild(c);

    var ext = extensions(h.people);
    var groups = {}, order = [];
    staff.forEach(function (p) {
      var g;
      if (p.dept === "WATCH") {
        var parts = p.unit.split(" / ");
        g = parts[0].toUpperCase() + " // " + (parts[1] ? parts[1].toUpperCase() : "CREW RELIEF");
      } else g = "ENGINEERING";
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(p);
    });
    var groupRank = function (g) { return /^RED/.test(g) ? 0 : /^WHITE/.test(g) ? 1 : /^ENG/.test(g) ? 2 : 3; };
    order.sort(function (a, b) { return groupRank(a) - groupRank(b) || (a < b ? -1 : 1); });

    var box = h.el("div", "tree");
    var top = h.el("div", "tree-root");
    top.appendChild(h.el("b", null, "WATCH FLOOR DESK"));
    top.appendChild(h.el("span", "ext", "EXT 4010"));
    top.appendChild(h.el("span", "tree-note", "STARTS THE CALL-OUT. PERSONNEL OFFICE EXT 4000 // FACILITY SECURITY EXT 4020"));
    box.appendChild(top);

    function person(p) {
      var li = h.el("li");
      var line = h.el("div", "tree-line");
      var a = h.el("a", null, h.shown(p));
      a.href = "?view=file&id=" + encodeURIComponent(p.id);
      a.setAttribute("data-go", "");
      line.appendChild(a);
      line.appendChild(h.el("span", "tree-title", p.title.toUpperCase()));
      line.appendChild(h.el("span", "ext", "EXT " + ext[p.id]));
      li.appendChild(line);
      return li;
    }
    function branch(list, i) {                    // binary call-out tree: i calls 2i+1 and 2i+2
      var li = person(list[i]);
      var kids = [2 * i + 1, 2 * i + 2].filter(function (k) { return k < list.length; });
      if (kids.length) {
        var ul = h.el("ul");
        kids.forEach(function (k) { ul.appendChild(branch(list, k)); });
        li.appendChild(ul);
      }
      return li;
    }
    var outer = h.el("ul", "tree-groups");
    order.forEach(function (g) {
      var list = groups[g].sort(function (a, b) { return rankOf(a) - rankOf(b) || (a.hire < b.hire ? -1 : a.hire > b.hire ? 1 : 0); });
      var gli = h.el("li", "tree-group");
      gli.appendChild(h.el("div", "tree-head", g + " (" + list.length + ")"));
      var ul = h.el("ul");
      ul.appendChild(branch(list, 0));
      gli.appendChild(ul);
      outer.appendChild(gli);
    });
    if (!order.length) outer.appendChild(h.el("li", "note", "NO STAFF ON RECORD FOR THIS DATE."));
    box.appendChild(outer);
    pane.appendChild(box);
  }

  // ---------------- BULLETIN BOARD ----------------
  // Hand-posted notices. Dated; each shows in its own year only.
  var POSTED = [
    ["1998-04-06", "OPERATIONS BEGIN 15 APRIL", "Both crews report per the posted rotation starting Wednesday 15 April. Day Watch: arrive by 06:45 for the first briefing. Badges must be worn and visible at all times on the floor."],
    ["1998-07-20", "BREAK ROOM", "The break room refrigerator is cleaned out every other Friday at 18:30. Label your food with your name and the date. See Form HR-92."],
    ["1998-09-14", "PARKING", "North lot spaces are assigned by seat and change with the crew rotation. Check the posted list, not your memory. Disputes: Form HR-98."],
    ["1999-03-01", "FIRE DRILL", "A fire drill will be held this month on each watch. The watch floor is never left unattended: the Watch Lead and COMM remain at their consoles; everyone else goes to the north lot assembly point."],
    ["1999-11-15", "YEAR-END STAFFING", "No scheduled leave will be approved from 27 December 1999 through 4 January 2000. Engineering will be on call over the date rollover. Plan holiday time before or after these dates."],
    ["2000-05-08", "COFFEE", "A reminder that whoever takes the last cup makes the next pot. The burner has been replaced twice this year. See Form HR-97."],
    ["2001-10-15", "BADGE PHOTOGRAPHS 26 OCTOBER", "All staff badges are being re-issued on the new magnetic-stripe card. Photographs will be taken in the Personnel Office on Friday 26 October. Night Watch appointments are held at turnover so no seat is left unattended. Bring your current badge. Form HR-13."],
    ["2002-03-11", "REPORT COVER SHEETS", "Shift Summary Reports require the revised cover sheet (LOG-7, Rev. 3). See the memorandum posted in the forms rack."],
    ["2004-07-12", "NORTH LOT RESEALING", "The north lot will be resealed over the weekend of 24-25 July. Park in the south overflow lot. Spaces will be re-striped; numbers do not change."],
    ["2007-02-19", "DAYLIGHT SAVING TIME CHANGE", "Beginning this year, daylight saving time starts on the second Sunday in March and ends on the first Sunday in November, three weeks earlier and one week later than before. Check any clock that sets itself."],
    ["2011-06-06", "THERMOSTAT", "The watch floor temperature is set for the equipment. Requests to adjust it are reviewed by Facilities and Engineering together. Sweaters are available in the supply room."],
    ["2016-08-01", "REPLY-ALL", "Please check the recipient list before sending. The all-staff list reaches both crews, Engineering, Facilities and the Personnel Office. Form HR-94 is in the rack."],
    ["2023-04-03", "BREAK ROOM", "The new break room refrigerator has been installed. The mustard did not make the move."]
  ];

  function holidayNotice(y) {
    var dates = [
      "New Year's Day, " + longDate(ymd(y, 1, 1)),
      "Memorial Day, " + longDate(ymd(y, 5, nthWeekday(y, 5, 1, -1))),
      "Independence Day, " + longDate(ymd(y, 7, 4)),
      "Labor Day, " + longDate(ymd(y, 9, nthWeekday(y, 9, 1, 1))),
      "Thanksgiving Day, " + longDate(ymd(y, 11, nthWeekday(y, 11, 4, 4))),
      "Christmas Day, " + longDate(ymd(y, 12, 25))
    ];
    return [ymd(y, 1, 4), "HOLIDAY SCHEDULE " + y, "The watch floor is staffed on every holiday. Holiday pay applies to: " + dates.join("; ") + ". Holiday leave requests follow the normal 14-day rule."];
  }
  function clockNotices(y) {
    var spring, fall;
    if (y >= 2007) { spring = ymd(y, 3, nthWeekday(y, 3, 0, 2)); fall = ymd(y, 11, nthWeekday(y, 11, 0, 1)); }
    else { spring = ymd(y, 4, nthWeekday(y, 4, 0, 1)); fall = ymd(y, 10, nthWeekday(y, 10, 0, -1)); }
    var minus = function (s, days) { var d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };
    return [
      [minus(spring, 7), "CLOCKS FORWARD " + longDate(spring).toUpperCase(), "Clocks go forward one hour at 02:00 on " + longDate(spring) + ". Night Watch: the change happens on your shift. Log entries keep local time; note the change in the log."],
      [minus(fall, 7), "CLOCKS BACK " + longDate(fall).toUpperCase(), "Clocks go back one hour at 02:00 on " + longDate(fall) + ". Night Watch works one extra hour; record it on Form HR-05."]
    ];
  }

  function board(pane, h) {
    var year = Math.max(1998, h.year);
    pane.appendChild(h.el("h2", null, "BULLETIN BOARD"));
    pane.appendChild(h.el("p", "note", "NOTICES POSTED BY THE PERSONNEL OFFICE DURING " + year + ". REMOVE NOTHING FROM THIS BOARD."));
    var c = h.el("div", "controls");
    c.appendChild(h.el("label", null, "YEAR"));
    c.appendChild(h.yearSelect(year, function (y) { h.go("?view=board&year=" + y); }, 1998));
    pane.appendChild(c);

    var notes = [];
    POSTED.forEach(function (n) { if (+n[0].slice(0, 4) === year) notes.push({ date: n[0], title: n[1], body: n[2], kind: "memo" }); });
    var hol = holidayNotice(year);
    notes.push({ date: hol[0], title: hol[1], body: hol[2], kind: "memo" });
    clockNotices(year).forEach(function (n) { notes.push({ date: n[0], title: n[1], body: n[2], kind: "slip" }); });
    notes.push({ date: ymd(year, 10, 25), title: "OPEN ENROLLMENT", body: "Benefit elections for " + (year + 1) + " are due in the Personnel Office by 15 November. No changes can be made after that date until next year unless your family situation changes.", kind: "memo" });
    if (year >= 2000) notes.push({ date: ymd(year, 10, 8), title: "FLU SHOTS", body: "Flu shots will be given in the break room on the second Tuesday of October, 06:30-08:00 and 18:30-20:00, so both watches can attend at turnover.", kind: "slip" });

    // From the personnel records.
    var hires = h.people.filter(function (p) { return p.dept !== "NX" && p.hire && +p.hire.slice(0, 4) === year; });
    var byMonth = {};
    hires.forEach(function (p) { var m = p.hire.slice(0, 7); (byMonth[m] = byMonth[m] || []).push(p); });
    Object.keys(byMonth).forEach(function (m) {
      notes.push({ date: m + "-01", title: "WELCOME", kind: "card",
        body: byMonth[m].map(function (p) { return h.shown(p) + ", " + p.title + " (" + p.unit + "), starting " + longDate(p.hire); }).join("\n") });
    });
    var leaving = h.people.filter(function (p) { return p.dept !== "NX" && p.sep && +p.sep.slice(0, 4) === year; });
    var leaveMonth = {};
    leaving.forEach(function (p) { var m = p.sep.slice(0, 7); (leaveMonth[m] = leaveMonth[m] || []).push(p); });
    Object.keys(leaveMonth).forEach(function (m) {
      notes.push({ date: m + "-01", title: "FAREWELL", kind: "card",
        body: leaveMonth[m].map(function (p) { return h.shown(p) + ", " + p.title + ". Last day " + longDate(p.sep) + "."; }).join("\n") + "\nCard and envelope at the watch floor desk." });
    });
    var anniv = h.people.filter(function (p) {
      if (!p.hire || p.dept === "NX") return false;
      var yrs = year - +p.hire.slice(0, 4);
      var day = year + p.hire.slice(4);
      return yrs > 0 && yrs % 5 === 0 && h.onStaff(p, day);
    });
    if (anniv.length) {
      notes.push({ date: ymd(year, 12, 1), title: "SERVICE AWARDS", kind: "card",
        body: anniv.sort(function (a, b) { return a.hire < b.hire ? -1 : 1; }).map(function (p) { return h.shown(p) + ", " + (year - +p.hire.slice(0, 4)) + " years"; }).join("\n") + "\nAwards presented at the December turnover." });
    }

    notes.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var cork = h.el("div", "cork");
    notes.forEach(function (n, i) {
      var d = h.el("div", "notice " + n.kind);
      d.style.transform = "rotate(" + (((i * 37) % 7) - 3) * 0.6 + "deg)";
      d.appendChild(h.el("span", "pin"));
      var p = n.date.split("-");
      d.appendChild(h.el("div", "notice-date", +p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0]));
      d.appendChild(h.el("div", "notice-title", n.title));
      n.body.split("\n").forEach(function (line) { d.appendChild(h.el("p", null, line)); });
      cork.appendChild(d);
    });
    pane.appendChild(cork);
  }

  // ---------------- FORMS ----------------
  function forms(pane, h) {
    pane.appendChild(h.el("h2", null, "FORMS RACK"));
    pane.appendChild(h.el("p", "note", "PRINT, COMPLETE IN INK AND RETURN TO THE PERSONNEL OFFICE. A FORM NOT IN THE RACK MAY BE REQUESTED ON FORM HR-96."));
    var list = window.HR_FORMS || [];
    var sections = [
      ["PERSONNEL FORMS", list.filter(function (f) { return f.cat === "HR" && !f.filed; })],
      ["FILED COPIES", list.filter(function (f) { return f.filed; })],
      ["NOTICES AND OTHER FORMS", list.filter(function (f) { return f.cat !== "HR"; })]
    ];
    sections.forEach(function (s) {
      if (!s[1].length) return;
      pane.appendChild(h.el("h3", "rack-head", s[0]));
      var t = h.el("table", "dir rack");
      s[1].forEach(function (f) {
        var tr = h.el("tr");
        tr.appendChild(h.el("td", "rack-code", f.code));
        tr.appendChild(h.el("td", null, f.title.toUpperCase()));
        tr.appendChild(h.el("td", "wide rack-rev", "REV. " + f.rev));
        var td = h.el("td", "rack-open");
        var a = h.el("a", null, "[ OPEN ]");
        a.href = "/hr/forms/" + encodeURIComponent(f.code) + ".pdf";
        a.target = "_blank";
        a.rel = "noopener";
        td.appendChild(a);
        tr.appendChild(td);
        t.appendChild(tr);
      });
      pane.appendChild(t);
    });
    if (!list.length) pane.appendChild(h.el("p", "note", "THE FORMS RACK IS EMPTY."));
  }

  // ---------------- HANDBOOK ----------------
  var HANDBOOK = [
    ["1. WATCH SCHEDULE", [
      "The watch floor is staffed 24 hours a day, every day of the year, by two crews (Red and White). Each crew works Day Watch (07:00-19:00) and Night Watch (19:00-07:00) on the posted rotation.",
      "Arrive 15 minutes before your shift. No seat is left until it is relieved. If your relief has not arrived, you hold over and notify the Watch Lead; holdover is recorded on Form HR-05 and authorized on Form HR-11.",
      "Crew relief staff cover leave and absences across both watches of their crew."
    ]],
    ["2. SHIFT TURNOVER", [
      "Turnover is held at the seat, not in the break room. The outgoing watch briefs open items, log entries in progress and anything unusual. The incoming Watch Lead confirms turnover in the log before the outgoing Watch Lead leaves the floor."
    ]],
    ["3. THE LOG", [
      "Every entry is made at the time of the event, in local time, with the seat that made it. Entries are never erased or overwritten; corrections are made by a new entry that refers to the one it corrects.",
      "Write what was seen and what was done. Keep opinions out of the log."
    ]],
    ["4. IDENTIFICATION BADGES", [
      "Wear your badge at all times inside the facility, above the waist and facing out. Badges are not lent, shared or left in vehicles.",
      "Report a lost badge to the on-duty Watch Lead at once (Form HR-03). A badge is deactivated the moment it is reported lost."
    ]],
    ["5. VISITORS", [
      "Visitors sign in and out at the watch floor desk and are logged by the Watch Lead. Each visitor is issued a numbered guest badge: green-bordered (GC) badges for cleared visitors, red-bordered (GN) badges for visitors who are not cleared.",
      "A visitor with a GN badge is escorted at all times by a named member of staff, including in the break room and restrooms. Consoles are turned away or cleared before a GN visitor enters the floor."
    ]],
    ["6. LEAVE", [
      "Scheduled leave is requested on Form HR-01 at least 14 days in advance and approved against seat coverage. Sick leave is reported to the on-duty Watch Lead before the start of your shift.",
      "Shift exchanges between qualified staff of the same position are made on Form HR-02. No one works more than two consecutive shifts."
    ]],
    ["7. EMERGENCY CALL-OUT", [
      "Every employee holds a place on the call-out tree. When called, call the people under your name, then report back. Keep your emergency contact form (HR-04) current; home numbers are held only in the sealed contact file."
    ]],
    ["8. CONDUCT ON THE FLOOR", [
      "No food at the consoles. Drinks with lids only. Personal radios, televisions and games stay off the floor.",
      "The thermostat is set for the equipment."
    ]],
    ["9. CONFIDENTIALITY", [
      "What is seen on the floor stays on the floor. Log contents, console displays and call-out lists are not discussed outside the facility or copied for personal use."
    ]],
    ["10. LEAVING OER", [
      "Give at least two weeks' notice to your Watch Lead or Technical Lead. Return your badge, keys and manuals on your last day. An exit interview (Form HR-06) is offered and is optional."
    ]]
  ];

  function handbook(pane, h) {
    pane.appendChild(h.el("h2", null, "EMPLOYEE HANDBOOK"));
    pane.appendChild(h.el("p", "note", "OPERATIONAL EVENT REGISTER // EFFECTIVE 15 APRIL 1998. KEEP THIS HANDBOOK AT YOUR SEAT."));
    var doc = h.el("div", "handbook");
    HANDBOOK.forEach(function (s) {
      doc.appendChild(h.el("h3", null, s[0]));
      s[1].forEach(function (t) { doc.appendChild(h.el("p", null, t)); });
    });
    doc.appendChild(h.el("p", "handbook-ack", "I HAVE RECEIVED AND READ THIS HANDBOOK. SIGNED ACKNOWLEDGMENT IS FILED WITH FORM HR-07."));
    pane.appendChild(doc);
  }

  window.HR_VIEWS = { phone: phoneTree, board: board, forms: forms, handbook: handbook };
})();
