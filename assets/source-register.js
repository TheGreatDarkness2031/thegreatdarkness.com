// SOURCES panel, fixed copy (owner, 2026-11-24: "it's basically static").
// /floor/ and /radar/ draw the Source Register from this at once; the first
// Radar answer then puts in the live lights (a stale feed goes dark). Same
// order, labels and colors as the Source Register (main spreadsheet Config
// G:Q, RadarSources.js). Adding or retiring a monitor = update this file;
// tests\smoke_live.js compares it with the live answer.
window.OER_SOURCE_REGISTER = {
  lights: [
    { id: "USGS", label: "EARTHQUAKE", color: "#00C853", light: "ON" },
    { id: "NIFC", label: "WILDFIRE", color: "#FFBF00", light: "ON" },
    { id: "EIA", label: "POWER GRID", color: "#FF3030", light: "ON" },
    { id: "NWS", label: "SEVERE WX", color: "#168BFF", light: "ON" },
    { id: "SWPC", label: "SPACE WX", color: "#F2F2F2", light: "ON" },
    { id: "VOLCANO", label: "VOLCANIC", color: "#00D5E8", light: "ON" },
    { id: "TRANSPORT", label: "TRANSPORT", color: "#D4A373", light: "ON" },
    { id: "IODA", label: "NETWORK", color: "#8A5CFF", light: "ON" },
    { id: "TEMP", label: "TEMP DEV", color: "#FF35B8", light: "ON" },
    { id: "GPS", label: "GPS / NAV", color: "#00A896", light: "ON" },
    { id: "AIINC", label: "AI INCIDENT", color: "#A3E635", light: "ON" },
    { id: "NEO", label: "NEAR-EARTH", color: "#FF8A50", light: "ON" },
    { id: "DIALUP", label: "DIAL-UP", color: "#FF3030", light: "DOWN" },
    { id: "", label: "FUTURE", color: "", light: "FUTURE" },
    { id: "", label: "FUTURE", color: "", light: "FUTURE" }
  ],
  registered: 13,
  on: 12
};
