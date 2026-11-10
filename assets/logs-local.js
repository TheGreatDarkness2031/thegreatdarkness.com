/* Static copies of the Watch and Maintenance logs (2026-11-09).
   The "Publish site" workflow saves the whole logs every half hour as
   /data/watch/index.json, /data/watch/<sheet>.json and /data/maintenance.json
   (Apps Script ?logexport=, LogExport.js). The Watch and Maintenance pages
   ask here first: the same answers as getWatchLogPage (WatchLog.js) and
   getMaintenanceLogData (MaintenanceLog.js), worked out in the browser, so
   paging, filters and search need no request at all. Any problem gives
   null and the page asks the web app as before.
   tests\test_logs_local.js checks these answers against the server code. */
(function (root) {
  var memo = {};

  function getJson(url) {
    if (!memo[url]) {
      memo[url] = fetch(url, { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }).then(function (d) {
        if (!d || d.ok !== true) throw new Error("bad file");
        return d;
      });
      memo[url].catch(function () { delete memo[url]; });
    }
    return memo[url];
  }

  function text(v) {
    return String(v === null || v === undefined ? "" : v).trim();
  }

  // ---------------- WATCH LOG (WatchLog.js getWatchLogPage) ----------------
  var WATCH_DEFAULT_PAGE_SIZE = 50, WATCH_MAX_PAGE_SIZE = 200;

  function watchPage(years, entry, allRecords, options) {
    options = options || {};
    var size = Number(options.pageSize);
    if (!isFinite(size) || size < 1) size = WATCH_DEFAULT_PAGE_SIZE;
    var pageSize = Math.max(1, Math.min(WATCH_MAX_PAGE_SIZE, Math.floor(size)));
    var requested = Number(options.page);
    var requestedPage = (!isFinite(requested) || requested < 1) ? 1 : Math.floor(requested);
    var sortText = text(options.sort).toUpperCase();
    var sort = (sortText === "NAME_ASC" || sortText === "NAME_DESC") ? sortText : "DEFAULT";
    var filters = {
      date: text(options.date),
      role: text(options.role),
      entryType: text(options.entryType),
      search: text(options.search).toLowerCase()
    };

    var roles = {}, types = {}, dates = {};
    allRecords.forEach(function (r) {
      if (r.responsibleRole) roles[r.responsibleRole] = true;
      if (r.entryType) types[r.entryType] = true;
      if (r.dateKey) dates[r.dateKey] = true;
    });
    var facets = {
      roles: Object.keys(roles).sort(),
      entryTypes: Object.keys(types).sort(),
      dates: Object.keys(dates).sort().reverse()
    };

    var matching = allRecords.filter(function (r) {
      if (filters.date && r.dateKey !== filters.date) return false;
      if (filters.role && r.responsibleRole !== filters.role) return false;
      if (filters.entryType && r.entryType !== filters.entryType) return false;
      if (filters.search) {
        var s = [r.recordId, r.name, r.responsibleRole, r.entryType, r.condition, r.priority,
          r.systemArea, r.relatedReference, r.logEntry, r.followUpOrDisposition].join(" ").toLowerCase();
        if (s.indexOf(filters.search) === -1) return false;
      }
      return true;
    });

    matching.sort(function (a, b) {
      if (sort === "NAME_ASC" || sort === "NAME_DESC") {
        var ah = !!text(a.name), bh = !!text(b.name);
        if (ah !== bh) return ah ? -1 : 1;
        var c = text(a.name).toUpperCase().localeCompare(text(b.name).toUpperCase());
        if (c !== 0) return sort === "NAME_ASC" ? c : -c;
        return b.timestampMillis - a.timestampMillis;
      }
      if (filters.date) return a.timestampMillis - b.timestampMillis;
      return b.timestampMillis - a.timestampMillis;
    });

    var total = matching.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var page = Math.max(1, Math.min(requestedPage, totalPages));
    var offset = (page - 1) * pageSize;
    var message = "";
    if (entry.archiveStatus === "PARTIAL") message = "ARCHIVE STATUS: PARTIAL. HISTORICAL RECORD RANGE INCOMPLETE.";
    if (total === 0) message = message ? message + " NO RECORDS MATCH CURRENT FILTER." : "NO RECORDS MATCH CURRENT FILTER.";

    return {
      success: true,
      message: message,
      archiveAvailable: true,
      years: years,
      selectedYear: entry.year,
      selectedYearInfo: entry,
      filters: facets,
      activeFilters: filters,
      sort: sort,
      records: matching.slice(offset, offset + pageSize),
      totalMatching: total,
      page: page,
      pageSize: pageSize,
      totalPages: totalPages,
      hasPrevious: page > 1,
      hasNext: page < totalPages
    };
  }

  function watchLog(options) {
    return getJson("/data/watch/index.json").then(function (ix) {
      var years = ix.years || [];
      if (!years.length) return null;
      var wanted = text(options && options.year);
      var entry = years.filter(function (y) { return y.year === wanted; })[0] || years[0];
      return getJson("/data/watch/" + encodeURIComponent(entry.sheetName) + ".json").then(function (y) {
        return watchPage(years, entry, y.records || [], options);
      });
    }).catch(function () { return null; });
  }

  // ---------------- MAINTENANCE LOG (MaintenanceLog.js getMaintenanceLogData) ----------------
  var MAINT_DEFAULT_PAGE_SIZE = 50, MAINT_MAX_PAGE_SIZE = 100;

  function number(value, fallback, min, max) {
    var n = Number(value);
    if (!isFinite(n)) n = fallback;
    n = Math.floor(n);
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  function maintenancePage(allRecords, request) {
    request = request || {};
    var distinct = function (prop) {
      var v = {};
      allRecords.forEach(function (r) { var t = text(r[prop]); if (t) v[t] = true; });
      return Object.keys(v).sort(function (a, b) { return a.localeCompare(b); });
    };
    var filterOptions = { eras: distinct("era"), actions: distinct("action"), systems: distinct("system"), authors: distinct("author") };
    var exact = function (value, wanted) {
      var f = text(wanted).toUpperCase();
      return !f || text(value).toUpperCase() === f;
    };
    var search = text(request.search).toLowerCase();
    var filtered = allRecords.filter(function (r) {
      if (!exact(r.era, request.era) || !exact(r.action, request.action) ||
          !exact(r.system, request.system) || !exact(r.author, request.author)) return false;
      if (!search) return true;
      return [r.id, r.date, r.era, r.author, r.role, r.system, r.action, r.entry].join(" ").toLowerCase().indexOf(search) !== -1;
    });

    var sortBy = text(request.sortBy || "date").toLowerCase();
    var direction = text(request.sortDirection || "desc").toLowerCase() === "asc" ? 1 : -1;
    var key = function (r) {
      switch (sortBy) {
        case "id": return r.idNumber;
        case "era": return r.era.toUpperCase();
        case "action": return r.action.toUpperCase();
        case "system": return r.system.toUpperCase();
        case "author": return r.author.toUpperCase();
        default: return r.dateValue;
      }
    };
    filtered.sort(function (a, b) {
      var x = key(a), y = key(b);
      if (x < y) return -1 * direction;
      if (x > y) return 1 * direction;
      return (a.idNumber - b.idNumber) * direction;
    });

    var pageSize = number(request.pageSize, MAINT_DEFAULT_PAGE_SIZE, 1, MAINT_MAX_PAGE_SIZE);
    var total = filtered.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var page = number(request.page, 1, 1, totalPages);
    var start = (page - 1) * pageSize;
    return {
      success: true,
      records: filtered.slice(start, start + pageSize).map(function (r) {
        return { id: r.id, date: r.date, era: r.era, author: r.author, role: r.role, system: r.system, action: r.action, entry: r.entry };
      }),
      filters: filterOptions,
      pagination: {
        page: page, pageSize: pageSize, totalRecords: total, totalPages: totalPages,
        startRecord: total === 0 ? 0 : start + 1,
        endRecord: Math.min(start + pageSize, total)
      },
      sort: { sortBy: sortBy, sortDirection: direction === 1 ? "asc" : "desc" }
    };
  }

  function maintenance(request) {
    return getJson("/data/maintenance.json").then(function (d) {
      return maintenancePage(d.records || [], request);
    }).catch(function () { return null; });
  }

  root.oerLocalLogs = { watchPage: watchPage, watchLog: watchLog, maintenancePage: maintenancePage, maintenance: maintenance };
})(typeof window !== "undefined" ? window : globalThis);
