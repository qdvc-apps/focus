/* ==========================================================================
   45-icons.js — inline SVG icons, drawn on a 20×20 grid with a 1.6 stroke.
   QDF.icon(name) returns markup; colour comes from `currentColor`.
   ========================================================================== */

QDF.ICONS = {
  check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
  play: '<path d="M7 4.8v10.4l8.2-5.2z" fill="currentColor" stroke-linejoin="round"/>',
  background: '<rect x="3" y="7" width="10" height="9" rx="1.5"/><path d="M7 7V5.5A1.5 1.5 0 0 1 8.5 4h7A1.5 1.5 0 0 1 17 5.5v6a1.5 1.5 0 0 1-1.5 1.5H13"/>',
  forward: '<path d="M10 16V5M5.5 9.5L10 5l4.5 4.5"/>',
  up: '<path d="M10 15V6M6 10l4-4 4 4M5 3.5h10"/>',
  edit: '<path d="M12.8 4.2l3 3L7.5 15.5 4 16l.5-3.5z"/><path d="M11 6l3 3"/>',
  trash: '<path d="M4.5 6h11M8 6V4.5h4V6M6 6l.8 10h6.4L14 6"/>',
  plus: '<path d="M10 4.5v11M4.5 10h11"/>',
  undo: '<path d="M7.5 5L4 8.5 7.5 12"/><path d="M4.5 8.5h7a4 4 0 0 1 0 8H9"/>',
  code: '<path d="M7 6l-4 4 4 4M13 6l4 4-4 4M11 4.5l-2 11"/>',
  importFile: '<path d="M10 3.5v9M6.5 9l3.5 3.5L13.5 9"/><path d="M4 13.5v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2"/>',
  exportFile: '<path d="M10 12.5v-9M6.5 7L10 3.5 13.5 7"/><path d="M4 13.5v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2"/>',
  info: '<circle cx="10" cy="10" r="7"/><path d="M10 9v5M10 6.3v.2"/>',
  more: '<circle cx="5" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.3" fill="currentColor" stroke="none"/>',
  restore: '<path d="M4 10a6 6 0 1 0 1.8-4.3"/><path d="M4 4v3.5h3.5"/>',
  close: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
  chevron: '<path d="M7 8l3 3 3-3"/>',
  swap: '<path d="M5 7h10M12 4l3 3-3 3M15 13H5M8 10l-3 3 3 3"/>',
  pause: '<path d="M7.5 5v10M12.5 5v10"/>',
  queueEnd: '<path d="M4 5h12M4 9h12M4 13h6M14 12v5M11.5 14.5L14 17l2.5-2.5"/>',
  copy: '<rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7"/>',
  clock: '<circle cx="10" cy="10" r="6.5"/><path d="M10 6.5V10l2.5 1.5"/>',
  down: '<path d="M10 4v11M5.5 10.5L10 15l4.5-4.5"/>',
  gear: '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.8v2M10 15.2v2M2.8 10h2M15.2 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4"/><circle cx="10" cy="10" r="5.2"/>',
  palette: '<path d="M10 3a7 7 0 1 0 0 14c1.2 0 1.6-.9 1.2-1.8-.5-1-.1-2.2 1.2-2.2H14a3 3 0 0 0 3-3c0-3.9-3.1-7-7-7z"/><circle cx="6.5" cy="9" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>',
  database: '<ellipse cx="10" cy="5" rx="6" ry="2.3"/><path d="M4 5v10c0 1.3 2.7 2.3 6 2.3s6-1 6-2.3V5M4 10c0 1.3 2.7 2.3 6 2.3s6-1 6-2.3"/>',
  hand: '<path d="M7 10V5.5a1.2 1.2 0 0 1 2.4 0V9M9.4 9V4.5a1.2 1.2 0 0 1 2.4 0V9M11.8 9V5.5a1.2 1.2 0 0 1 2.4 0V11c0 3-2 5-4.7 5-2 0-3.2-1-4.3-2.6L3.6 11a1.2 1.2 0 0 1 2-1.3L7 11.5"/>'
};

QDF.icon = function (name, cls) {
  var body = QDF.ICONS[name] || '';
  return '<svg class="icon' + (cls ? ' ' + cls : '') + '" viewBox="0 0 20 20" width="16" height="16" ' +
    'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
};
