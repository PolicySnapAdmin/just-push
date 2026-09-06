/**
 * Rank covers — one unique button skin per Push Thru level (1–99).
 * Never sold in the store. Insignia are original geometric marks
 * drawn as beveled metal (solid-color stacks — no paint-server IDs,
 * so they stay sharp as CSS background-image data URIs).
 */
(function (root) {
  function mixHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (shift, n) => (n >> shift) & 255;
    const m = (shift) => Math.round(ch(shift, pa) * (1 - t) + ch(shift, pb) * t);
    return "#" + [m(16), m(8), m(0)].map((n) => n.toString(16).padStart(2, "0")).join("");
  }

  function pal(metal) {
    const c = metal || "#f3e6c0";
    return {
      c,
      hi: mixHex(c, "#fff6d8", 0.62),
      mid: c,
      lo: mixHex(c, "#1a1208", 0.48),
      edge: mixHex(c, "#070504", 0.78),
      ink: "#140e08",
    };
  }

  function svgUri(inner) {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">' + inner + "</svg>";
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  function cap(w) {
    return 'stroke-linecap="round" stroke-linejoin="round" stroke-width="' + Number(w).toFixed(2) + '"';
  }

  function bevelFill(d, p) {
    return (
      '<path d="' + d + '" fill="' + p.edge + '" transform="translate(0,1.5)" opacity="0.72"/>' +
      '<path d="' + d + '" fill="' + p.lo + '"/>' +
      '<path d="' + d + '" fill="' + p.hi + '" opacity="0.42" transform="translate(-0.35,-0.85)"/>' +
      '<path d="' + d + '" fill="' + p.mid + '"/>' +
      '<path d="' + d + '" fill="none" stroke="' + p.ink + '" ' + cap(0.85) + "/>"
    );
  }

  function bevelStroke(d, p, w) {
    w = w || 3.2;
    return (
      '<path d="' + d + '" fill="none" stroke="' + p.edge + '" ' + cap(w + 2.4) + "/>" +
      '<path d="' + d + '" fill="none" stroke="' + p.lo + '" ' + cap(w + 1) + "/>" +
      '<path d="' + d + '" fill="none" stroke="' + p.mid + '" ' + cap(w) + "/>" +
      '<path d="' + d + '" fill="none" stroke="' + p.hi + '" ' + cap(Math.max(0.9, w * 0.38)) +
      ' opacity="0.8" transform="translate(0,-0.65)"/>'
    );
  }

  function chevronRow(y, p, band) {
    band = band || 5.4;
    const peak = y - 12;
    const d =
      "M11 " + y + " L32 " + peak + " L53 " + y +
      " L47.6 " + (y + band) + " L32 " + (peak + band) + " L16.4 " + (y + band) + " Z";
    return (
      bevelFill(d, p) +
      '<path d="M17 ' + (y + 0.7) + " L32 " + (peak + 1.4) + " L47 " + (y + 0.7) +
      '" fill="none" stroke="' + p.hi + '" ' + cap(1.15) + ' opacity="0.75"/>'
    );
  }

  function rocker(y, p) {
    const d =
      "M14 " + y + " Q32 " + (y + 11) + " 50 " + y +
      " L46.5 " + (y + 5.2) + " Q32 " + (y + 14.5) + " 17.5 " + (y + 5.2) + " Z";
    return bevelFill(d, p);
  }

  function starPts(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const b = a + Math.PI / 5;
      pts.push((cx + Math.cos(a) * r).toFixed(1) + "," + (cy + Math.sin(a) * r).toFixed(1));
      pts.push((cx + Math.cos(b) * r * 0.4).toFixed(1) + "," + (cy + Math.sin(b) * r * 0.4).toFixed(1));
    }
    return pts.join(" ");
  }

  function star(cx, cy, r, p) {
    const pts = starPts(cx, cy, r);
    const hi = starPts(cx - 0.35, cy - 0.7, r * 0.9);
    return (
      '<polygon points="' + starPts(cx, cy + 1.5, r) + '" fill="' + p.edge + '" opacity="0.7"/>' +
      '<polygon points="' + pts + '" fill="' + p.lo + '"/>' +
      '<polygon points="' + pts + '" fill="' + p.mid + '"/>' +
      '<polygon points="' + hi + '" fill="' + p.hi + '" opacity="0.48"/>' +
      '<polygon points="' + pts + '" fill="none" stroke="' + p.ink + '" ' + cap(0.8) + "/>" +
      '<circle cx="' + (cx - r * 0.16) + '" cy="' + (cy - r * 0.22) + '" r="' + Math.max(0.9, r * 0.11) +
      '" fill="' + p.hi + '" opacity="0.9"/>'
    );
  }

  function bar(x, y, w, h, p) {
    const rx = 1.35;
    return (
      '<rect x="' + x + '" y="' + (y + 1.4) + '" width="' + w + '" height="' + h + '" rx="' + rx + '" fill="' + p.edge + '" opacity="0.7"/>' +
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx + '" fill="' + p.lo + '"/>' +
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx + '" fill="' + p.mid + '"/>' +
      '<rect x="' + (x + 1.3) + '" y="' + (y + 0.7) + '" width="' + (w - 2.6) + '" height="' + Math.max(2, h * 0.34) +
      '" rx="0.7" fill="' + p.hi + '" opacity="0.5"/>' +
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx +
      '" fill="none" stroke="' + p.ink + '" stroke-width="0.85"/>'
    );
  }

  function leaf(p, ox) {
    const x = ox || 32;
    const d =
      "M" + x + " 16 C" + (x + 11) + " 23 " + (x + 11) + " 41 " + x + " 50 C" +
      (x - 11) + " 41 " + (x - 11) + " 23 " + x + " 16Z";
    return (
      bevelFill(d, p) +
      '<path d="M' + x + ' 19 L' + x + ' 47" fill="none" stroke="' + p.ink + '" ' + cap(1.15) + ' opacity="0.65"/>' +
      '<path d="M' + x + " 22 C" + (x + 6) + " 26 " + (x + 6) + " 36 " + x +
      ' 42" fill="none" stroke="' + p.hi + '" ' + cap(0.9) + ' opacity="0.45"/>'
    );
  }

  function eagle(p) {
    const wings = "M10 35 Q20 20 32 25 Q44 20 54 35 Q44 29 32 36 Q20 29 10 35Z";
    const body = "M28 26 L32 46 L36 26 Q32 30 28 26Z";
    return (
      bevelFill(wings, p) +
      bevelFill(body, p) +
      '<circle cx="32" cy="21" r="3.4" fill="' + p.lo + '"/>' +
      '<circle cx="32" cy="21" r="3.4" fill="' + p.mid + '"/>' +
      '<circle cx="31" cy="20.2" r="1.2" fill="' + p.hi + '"/>' +
      '<circle cx="32" cy="21" r="3.4" fill="none" stroke="' + p.ink + '" stroke-width="0.8"/>'
    );
  }

  function wreath(p) {
    const L = "M20 50 Q10 34 18 16 Q22 28 24 42";
    const R = "M44 50 Q54 34 46 16 Q42 28 40 42";
    return bevelStroke(L, p, 2.6) + bevelStroke(R, p, 2.6);
  }

  function crown(p) {
    const d = "M11 41 L16 20 L26 33 L32 14 L38 33 L48 20 L53 41 Z";
    const band = "M11 41 H53 V50 H11 Z";
    return (
      bevelFill(d, p) +
      bevelFill(band, p) +
      '<circle cx="32" cy="22" r="2.1" fill="' + p.hi + '"/>' +
      '<circle cx="17.5" cy="28" r="1.5" fill="' + p.hi + '" opacity="0.85"/>' +
      '<circle cx="46.5" cy="28" r="1.5" fill="' + p.hi + '" opacity="0.85"/>'
    );
  }

  function laurel(p) {
    return bevelStroke("M18 52 Q7 32 22 12", p, 2.8) + bevelStroke("M46 52 Q57 32 42 12", p, 2.8) + star(32, 31, 8.5, p);
  }

  function sunburst(p) {
    let rays = "";
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const x1 = (32 + Math.cos(a) * 9).toFixed(1);
      const y1 = (32 + Math.sin(a) * 9).toFixed(1);
      const x2 = (32 + Math.cos(a) * 26).toFixed(1);
      const y2 = (32 + Math.sin(a) * 26).toFixed(1);
      rays += bevelStroke("M" + x1 + " " + y1 + " L" + x2 + " " + y2, p, 2.1);
    }
    return (
      rays +
      '<circle cx="32" cy="33.2" r="8.2" fill="' + p.edge + '" opacity="0.65"/>' +
      '<circle cx="32" cy="32" r="8.2" fill="' + p.lo + '"/>' +
      '<circle cx="32" cy="32" r="8.2" fill="' + p.mid + '"/>' +
      '<circle cx="30" cy="29.5" r="3.2" fill="' + p.hi + '" opacity="0.55"/>' +
      '<circle cx="32" cy="32" r="8.2" fill="none" stroke="' + p.ink + '" stroke-width="0.85"/>'
    );
  }

  function diamond(p, scale) {
    const s = scale || 1;
    const x = 32;
    const y = 32;
    const r = 11 * s;
    const d = "M" + x + " " + (y - r) + " L" + (x + r) + " " + y + " L" + x + " " + (y + r) + " L" + (x - r) + " " + y + " Z";
    return bevelFill(d, p);
  }

  function plate(x, y, w, h, p, filled) {
    const d = "M" + x + " " + y + " H" + (x + w) + " V" + (y + h) + " H" + x + " Z";
    const rim =
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
      '" rx="1.6" fill="' + (filled ? p.ink : "none") + '" stroke="' + p.mid + '" stroke-width="2.4"/>' +
      '<rect x="' + (x + 1.1) + '" y="' + (y + 1.1) + '" width="' + (w - 2.2) + '" height="' + (h - 2.2) +
      '" rx="1" fill="none" stroke="' + p.hi + '" stroke-width="0.7" opacity="0.45"/>';
    return rim;
  }

  function insignia(kind, metal) {
    const p = pal(metal);
    const silver = pal("#e8eef4");
    switch (kind) {
      case "blank":
        return svgUri(
          '<circle cx="32" cy="33.4" r="11" fill="' + p.edge + '" opacity="0.55"/>' +
            '<circle cx="32" cy="32" r="11" fill="none" stroke="' + p.lo + '" stroke-width="4"/>' +
            '<circle cx="32" cy="32" r="11" fill="none" stroke="' + p.mid + '" stroke-width="2.6"/>' +
            '<circle cx="32" cy="31.2" r="11" fill="none" stroke="' + p.hi + '" stroke-width="1" opacity="0.65"/>'
        );
      case "ch1":
        return svgUri(chevronRow(40, p, 6));
      case "ch1r":
        return svgUri(chevronRow(32, p, 5.6) + rocker(44, p));
      case "spc":
        return svgUri(diamond(p, 1.35) + diamond(p, 0.62));
      case "ch2":
        return svgUri(chevronRow(28, p, 5.2) + chevronRow(41, p, 5.2));
      case "ch3":
        return svgUri(chevronRow(22, p, 4.8) + chevronRow(34, p, 4.8) + chevronRow(46, p, 4.8));
      case "ch3r1":
        return svgUri(chevronRow(18, p, 4.4) + chevronRow(29, p, 4.4) + chevronRow(40, p, 4.4) + rocker(50, p));
      case "ch3r2":
        return svgUri(
          chevronRow(15, p, 4.2) + chevronRow(26, p, 4.2) + chevronRow(37, p, 4.2) + rocker(46, p) + rocker(54, p)
        );
      case "ch3r3":
        return svgUri(
          chevronRow(13, p, 4) +
            chevronRow(23.5, p, 4) +
            chevronRow(34, p, 4) +
            rocker(43, p) +
            rocker(50, p) +
            rocker(57, p)
        );
      case "ch1sg":
        return svgUri(
          chevronRow(13, p, 4) +
            chevronRow(23.5, p, 4) +
            chevronRow(34, p, 4) +
            rocker(43, p) +
            rocker(50, p) +
            rocker(57, p) +
            diamond(p, 0.55)
        );
      case "chsgm":
        return svgUri(
          chevronRow(13, p, 4) +
            chevronRow(23.5, p, 4) +
            chevronRow(34, p, 4) +
            rocker(45, p) +
            rocker(52, p) +
            rocker(59, p) +
            star(32, 40, 5.2, p)
        );
      case "chcsm":
        return svgUri(wreath(p) + chevronRow(16, p, 4) + chevronRow(27, p, 4) + chevronRow(38, p, 4) + star(32, 40, 5.4, p));
      case "sma":
        return svgUri(wreath(p) + eagle(p));
      case "wo1":
        return svgUri(plate(17, 17, 30, 30, p, false) + bar(22, 29, 20, 6, p));
      case "cw2":
        return svgUri(plate(17, 17, 30, 30, p, false) + bar(22, 24, 20, 5, p) + bar(22, 34, 20, 5, p));
      case "cw3":
        return svgUri(plate(17, 15, 30, 34, p, false) + bar(22, 21, 20, 5, p) + bar(22, 30, 20, 5, p) + bar(22, 39, 20, 5, p));
      case "cw4":
        return svgUri(plate(15, 15, 34, 34, p, true) + bar(20, 22, 24, 5, p) + bar(20, 30, 24, 5, p) + bar(20, 38, 24, 5, p));
      case "cw5":
        return svgUri(plate(15, 15, 34, 34, p, true) + eagle(p));
      case "bar1":
        return svgUri(bar(18, 24, 28, 14, p));
      case "bar1s":
        return svgUri(bar(18, 24, 28, 14, silver));
      case "bar2":
        return svgUri(bar(10, 24, 18, 14, silver) + bar(36, 24, 18, 14, silver));
      case "oakg":
        return svgUri(leaf(p));
      case "oaks":
        return svgUri(leaf(silver));
      case "eagle":
        return svgUri(eagle(p));
      case "star1":
        return svgUri(star(32, 32, 15, p));
      case "star2":
        return svgUri(star(21, 32, 11.5, p) + star(43, 32, 11.5, p));
      case "star3":
        return svgUri(star(32, 20, 10.5, p) + star(20, 41, 10.5, p) + star(44, 41, 10.5, p));
      case "star4":
        return svgUri(star(20, 20, 9.5, p) + star(44, 20, 9.5, p) + star(20, 44, 9.5, p) + star(44, 44, 9.5, p));
      case "star5":
        return svgUri(
          star(32, 16, 8.5, p) + star(16, 28, 8.5, p) + star(48, 28, 8.5, p) + star(22, 46, 8.5, p) + star(42, 46, 8.5, p)
        );
      case "anchor":
        return svgUri(
          '<circle cx="32" cy="17.4" r="5.2" fill="' + p.edge + '" opacity="0.6"/>' +
            '<circle cx="32" cy="16" r="5.2" fill="none" stroke="' + p.lo + '" stroke-width="3.4"/>' +
            '<circle cx="32" cy="16" r="5.2" fill="none" stroke="' + p.mid + '" stroke-width="2.3"/>' +
            bevelStroke("M32 21 L32 49 M17 40 Q32 58 47 40", p, 3.1)
        );
      case "fouled":
        return svgUri(
          '<circle cx="32" cy="16" r="4.8" fill="' + p.lo + '"/>' +
            '<circle cx="32" cy="16" r="4.8" fill="' + p.mid + '"/>' +
            '<circle cx="31" cy="15" r="1.6" fill="' + p.hi + '"/>' +
            bevelStroke("M32 20 L32 51 M15 38 Q32 60 49 38 M21 27 Q32 20 43 27", p, 2.9)
        );
      case "lcpl":
        return svgUri(
          chevronRow(30, p, 6) +
            '<circle cx="32" cy="46.2" r="4.3" fill="' + p.edge + '" opacity="0.65"/>' +
            '<circle cx="32" cy="45" r="4.3" fill="' + p.mid + '"/>' +
            '<circle cx="31" cy="44" r="1.4" fill="' + p.hi + '"/>'
        );
      case "gunny":
        return svgUri(chevronRow(16, p, 4.4) + chevronRow(27, p, 4.4) + chevronRow(38, p, 4.4) + rocker(48, p) + rocker(56, p));
      case "wings":
        return svgUri(
          bevelFill("M6 37 Q24 18 32 27 Q40 18 58 37 Q40 28 32 34 Q24 28 6 37Z", p) +
            '<circle cx="32" cy="30" r="4.2" fill="' + p.ink + '"/>' +
            '<circle cx="31.2" cy="29" r="1.4" fill="' + p.hi + '" opacity="0.7"/>'
        );
      case "cross":
        return svgUri(
          bevelFill("M28 10 H36 V22 H50 V30 H36 V54 H28 V30 H14 V22 H28 Z", p) +
            '<circle cx="32" cy="26" r="4.2" fill="' + p.hi + '" opacity="0.55"/>'
        );
      case "crown":
        return svgUri(crown(p));
      case "laurel":
        return svgUri(laurel(p));
      case "sun":
        return svgUri(sunburst(p));
      case "bolt":
        return svgUri(bevelFill("M38 7 L19 33 H30 L24 57 L48 28 H35 Z", p));
      case "inf":
        return svgUri(
          bevelStroke("M18 32 C18 21 30 21 32 32 C34 43 46 43 46 32 C46 21 34 21 32 32 C30 43 18 43 18 32Z", p, 3.1)
        );
      case "omega":
        return svgUri(bevelStroke("M18 45 Q18 15 32 15 Q46 15 46 45 M18 45 L13 52 M46 45 L51 52", p, 3.3));
      case "eye":
        return svgUri(
          bevelStroke("M7 32 Q32 10 57 32 Q32 54 7 32Z", p, 2.6) +
            '<circle cx="32" cy="33.2" r="7.2" fill="' + p.edge + '" opacity="0.6"/>' +
            '<circle cx="32" cy="32" r="7.2" fill="' + p.lo + '"/>' +
            '<circle cx="32" cy="32" r="7.2" fill="' + p.mid + '"/>' +
            '<circle cx="30.2" cy="30" r="2.4" fill="' + p.hi + '" opacity="0.7"/>' +
            '<circle cx="32" cy="32" r="3.1" fill="' + p.ink + '"/>'
        );
      default:
        return svgUri(star(32, 32, 13, p));
    }
  }

  const RANKS = [
    { name: "Recruit", abbr: "RCT", mark: "blank" },
    { name: "Private", abbr: "PVT", mark: "ch1" },
    { name: "Private First Class", abbr: "PFC", mark: "ch1r" },
    { name: "Specialist", abbr: "SPC", mark: "spc" },
    { name: "Corporal", abbr: "CPL", mark: "ch2" },
    { name: "Sergeant", abbr: "SGT", mark: "ch3" },
    { name: "Staff Sergeant", abbr: "SSG", mark: "ch3r1" },
    { name: "Sergeant First Class", abbr: "SFC", mark: "ch3r2" },
    { name: "Master Sergeant", abbr: "MSG", mark: "ch3r3" },
    { name: "First Sergeant", abbr: "1SG", mark: "ch1sg" },
    { name: "Sergeant Major", abbr: "SGM", mark: "chsgm" },
    { name: "Command Sergeant Major", abbr: "CSM", mark: "chcsm" },
    { name: "Sergeant Major of the Army", abbr: "SMA", mark: "sma" },
    { name: "Warrant Officer", abbr: "WO1", mark: "wo1" },
    { name: "Chief Warrant Officer 2", abbr: "CW2", mark: "cw2" },
    { name: "Chief Warrant Officer 3", abbr: "CW3", mark: "cw3" },
    { name: "Chief Warrant Officer 4", abbr: "CW4", mark: "cw4" },
    { name: "Chief Warrant Officer 5", abbr: "CW5", mark: "cw5" },
    { name: "Second Lieutenant", abbr: "2LT", mark: "bar1" },
    { name: "First Lieutenant", abbr: "1LT", mark: "bar1s" },
    { name: "Captain", abbr: "CPT", mark: "bar2" },
    { name: "Major", abbr: "MAJ", mark: "oakg" },
    { name: "Lieutenant Colonel", abbr: "LTC", mark: "oaks" },
    { name: "Colonel", abbr: "COL", mark: "eagle" },
    { name: "Brigadier General", abbr: "BG", mark: "star1" },
    { name: "Major General", abbr: "MG", mark: "star2" },
    { name: "Lieutenant General", abbr: "LTG", mark: "star3" },
    { name: "General", abbr: "GEN", mark: "star4" },
    { name: "General of the Army", abbr: "GA", mark: "star5" },
    { name: "Seaman", abbr: "SN", mark: "anchor" },
    { name: "Petty Officer", abbr: "PO", mark: "ch2" },
    { name: "Chief Petty Officer", abbr: "CPO", mark: "fouled" },
    { name: "Senior Chief", abbr: "SCPO", mark: "fouled" },
    { name: "Master Chief", abbr: "MCPO", mark: "fouled" },
    { name: "Ensign", abbr: "ENS", mark: "bar1" },
    { name: "Lieutenant Commander", abbr: "LCDR", mark: "oakg" },
    { name: "Commander", abbr: "CDR", mark: "oaks" },
    { name: "Rear Admiral", abbr: "RADM", mark: "star2" },
    { name: "Vice Admiral", abbr: "VADM", mark: "star3" },
    { name: "Admiral", abbr: "ADM", mark: "star4" },
    { name: "Lance Corporal", abbr: "LCpl", mark: "lcpl" },
    { name: "Gunnery Sergeant", abbr: "GySgt", mark: "gunny" },
    { name: "Master Gunnery Sergeant", abbr: "MGySgt", mark: "chsgm" },
    { name: "Airman", abbr: "Amn", mark: "wings" },
    { name: "Chief Master Sergeant", abbr: "CMSgt", mark: "wings" },
    { name: "Knight", abbr: "KNT", mark: "cross" },
    { name: "Knight-Captain", abbr: "KCPT", mark: "cross" },
    { name: "Knight-Commander", abbr: "KCMD", mark: "cross" },
    { name: "Paladin", abbr: "PLD", mark: "cross" },
    { name: "Baronet", abbr: "BT", mark: "leafg" },
    { name: "Baron", abbr: "BRN", mark: "oakg" },
    { name: "Viscount", abbr: "VIS", mark: "oaks" },
    { name: "Earl", abbr: "ERL", mark: "laurel" },
    { name: "Marquis", abbr: "MRQ", mark: "laurel" },
    { name: "Duke", abbr: "DUK", mark: "crown" },
    { name: "Grand Duke", abbr: "GDUK", mark: "crown" },
    { name: "Archduke", abbr: "ADUK", mark: "crown" },
    { name: "Prince", abbr: "PRN", mark: "crown" },
    { name: "Crown Prince", abbr: "CPR", mark: "crown" },
    { name: "King", abbr: "KNG", mark: "crown" },
    { name: "High King", abbr: "HKNG", mark: "laurel" },
    { name: "Emperor", abbr: "EMP", mark: "sun" },
    { name: "Imperator", abbr: "IMP", mark: "sun" },
    { name: "Overlord", abbr: "OVL", mark: "eagle" },
    { name: "Warlord", abbr: "WLD", mark: "bolt" },
    { name: "Supreme Commander", abbr: "SCMD", mark: "star5" },
    { name: "Champion", abbr: "CHP", mark: "laurel" },
    { name: "Hero", abbr: "HERO", mark: "star1" },
    { name: "Legend", abbr: "LGD", mark: "star2" },
    { name: "Mythic", abbr: "MYTH", mark: "eye" },
    { name: "Titan", abbr: "TTN", mark: "bolt" },
    { name: "Colossus", abbr: "CLS", mark: "sun" },
    { name: "Behemoth", abbr: "BHM", mark: "diamond" },
    { name: "Leviathan", abbr: "LVTH", mark: "fouled" },
    { name: "Demigod", abbr: "DGD", mark: "sun" },
    { name: "God", abbr: "GOD", mark: "sun" },
    { name: "High God", abbr: "HGOD", mark: "laurel" },
    { name: "Elder God", abbr: "EGOD", mark: "omega" },
    { name: "Primordial", abbr: "PRIM", mark: "inf" },
    { name: "Eternal", abbr: "ETRN", mark: "inf" },
    { name: "Immortal", abbr: "IMTL", mark: "inf" },
    { name: "Transcendent", abbr: "TRN", mark: "omega" },
    { name: "Celestial", abbr: "CEL", mark: "star5" },
    { name: "Astral", abbr: "AST", mark: "star4" },
    { name: "Cosmic", abbr: "CSM2", mark: "sun" },
    { name: "Divine", abbr: "DIV", mark: "eye" },
    { name: "Omnipotent", abbr: "OMN", mark: "omega" },
    { name: "Infinite", abbr: "INF", mark: "inf" },
    { name: "Omega", abbr: "OMG", mark: "omega" },
    { name: "Apex", abbr: "APX", mark: "star5" },
    { name: "Sovereign", abbr: "SOV", mark: "crown" },
    { name: "Origin", abbr: "ORG", mark: "sun" },
    { name: "Prime", abbr: "PRM", mark: "star5" },
    { name: "Nexus", abbr: "NEX", mark: "eye" },
    { name: "Singularity", abbr: "SNG", mark: "inf" },
    { name: "Ascendant", abbr: "ASC", mark: "sun" },
    { name: "The One", abbr: "ONE", mark: "eye" },
    { name: "God-Emperor", abbr: "GEMP", mark: "crown" },
    { name: "Supreme", abbr: "SUP", mark: "star5" },
  ];

  const BANDS = [
    { min: 1, max: 13, motifs: ["stamp", "hatch", "rivet"], tier: 1, a: "#6b7a4a", b: "#2f3a22", c: "#d7c089", metal: "#d7c089" },
    { min: 14, max: 18, motifs: ["facet", "rivet"], tier: 2, a: "#8a9098", b: "#2a2e34", c: "#e8eef4", metal: "#e8eef4" },
    { min: 19, max: 29, motifs: ["facet", "orbit"], tier: 3, a: "#c9a227", b: "#4a3208", c: "#ffe08a", metal: "#ffd24a" },
    { min: 30, max: 40, motifs: ["void", "orbit", "rivet"], tier: 3, a: "#1e4a7a", b: "#0a1c33", c: "#f0d48a", metal: "#f0d48a" },
    { min: 41, max: 45, motifs: ["weave", "hatch"], tier: 3, a: "#4a5c38", b: "#1c2414", c: "#c5d4a0", metal: "#c5d4a0" },
    { min: 46, max: 60, motifs: ["lattice", "rune", "crown"], tier: 4, a: "#7a5a16", b: "#2a1a06", c: "#ffe08a", metal: "#ffd24a" },
    { min: 61, max: 74, motifs: ["crack", "scale", "orbit"], tier: 4, a: "#8a1c18", b: "#2a0808", c: "#ffb080", metal: "#ffd24a" },
    { min: 75, max: 89, motifs: ["prism", "void", "pulse"], tier: 5, a: "#4a1c8a", b: "#120428", c: "#f0d0ff", metal: "#f4e8ff" },
    { min: 90, max: 99, motifs: ["crown", "prism", "orbit"], tier: 5, a: "#ffd24a", b: "#4a2a00", c: "#fff4c8", metal: "#fff4c8" },
  ];

  function bandFor(level) {
    let b = BANDS[0];
    for (const x of BANDS) if (level >= x.min) b = x;
    return b;
  }

  if (RANKS.length !== 99) {
    console.warn("RANK_COVERS expected 99 titles, got", RANKS.length);
  }

  const covers = [];
  for (let level = 1; level <= 99; level++) {
    const band = bandFor(level);
    const spec = RANKS[level - 1] || { name: "Rank " + level, abbr: "R" + level, mark: "star1" };
    const i = level - band.min;
    const motif = band.motifs[i % band.motifs.length];
    const t = (i + 1) / Math.max(1, band.max - band.min + 1);
    const value = mixHex(band.a, band.b, 0.2 + t * 0.35);
    const accent = mixHex(band.c, band.a, t * 0.35);
    const ink = mixHex(band.b, "#0a0a10", 0.15);
    const metal = band.metal || accent;
    const markKind = spec.mark === "leafg" ? "oakg" : spec.mark === "diamond" ? "spc" : spec.mark;
    covers.push({
      id: "rank-" + String(level).padStart(2, "0"),
      level,
      label: spec.name,
      abbr: spec.abbr,
      motif,
      markKind,
      mark: insignia(markKind, metal),
      coverTier: band.tier,
      value,
      accent,
      ink,
      darkText: level < 19 || level >= 90,
      free: false,
      cost: 0,
      store: false,
      rank: true,
      cat: "rank",
      rarity: level >= 90 ? "legendary" : level >= 61 ? "epic" : level >= 29 ? "rare" : "rank",
    });
  }

  root.RANK_COVERS = covers;
  root.rankCoverForLevel = function (level) {
    const l = Math.max(1, Math.min(99, Math.floor(Number(level) || 1)));
    return covers[l - 1];
  };
  root.rankCoverId = function (level) {
    return root.rankCoverForLevel(level).id;
  };
})(typeof window !== "undefined" ? window : globalThis);
