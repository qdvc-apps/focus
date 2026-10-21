/* ==========================================================================
   70-about.js — the About dialog: what the app does and its shortcuts.
   ========================================================================== */

QDF.about = (function () {
  var U = QDF.util;

  var KEYS = [
    ['N', 'Add a task to the queue'],
    ['Enter', 'In the add box: add to the end of the queue'],
    ['Shift + Enter', 'In the add box: add as up next'],
    ['Ctrl + Z', 'Undo the last change (⌘ Z on a Mac)'],
    ['Y', 'Show the current state as YAML'],
    ['?', 'This window'],
    ['Esc', 'Close a window or menu'],
    ['Double-click', 'Edit a task']
  ];

  function show() {
    QDF.ui.dialog({
      title: 'About ' + QDF.APP.name,
      className: 'dialog-about',
      body:
        '<div class="about-head">' +
          '<div class="about-mark" aria-hidden="true">' + QDF.view.brandMark('bm-about') + '</div>' +
          '<div><div class="about-name">' + U.esc(QDF.APP.name) + '</div>' +
          '<div class="dim">Version ' + U.esc(QDF.APP.version) + ' · format ' + U.esc(QDF.APP.format) + '</div></div>' +
        '</div>' +
        '<p>One thing in focus, a queue of what could come next, and a lane for work that carries on without you. ' +
          'Drag a task into <b>Up next</b> to line it up; <b>Done, start next</b> moves on. ' +
          '<b>Send to background</b> parks the current task with its own timer while you pick up the next one.</p>' +
        '<p>The big clock counts from when the task in focus was first started. <b>Since last update</b> in the toolbar ' +
          'counts from the last time you changed anything here; click it to check in without changing anything.</p>' +
        '<p>Everything is kept in this browser only. Export the YAML to keep a copy or to carry on elsewhere, and import it to resume.</p>' +
        '<table class="keys"><tbody>' + KEYS.map(function (k) {
          return '<tr><td>' + k[0].split(' + ').map(function (p) { return '<kbd>' + U.esc(p) + '</kbd>'; }).join(' + ') +
            '</td><td>' + U.esc(k[1]) + '</td></tr>';
        }).join('') + '</tbody></table>',
      buttons: [{ label: 'Close', primary: true }]
    });
  }

  return { show: show };
})();

/* The application mark: a lens over a horizon line. Used in the toolbar and
   in this dialog. */
QDF.view.brandMark = function (prefix) {
  var p = prefix || 'bm';
  return '<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">' +
    '<defs>' +
      '<linearGradient id="' + p + '-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b5563"/><stop offset="1" stop-color="#1f242b"/></linearGradient>' +
      '<radialGradient id="' + p + '-lens" cx=".42" cy=".36" r=".7"><stop offset="0" stop-color="#9fd0ff"/><stop offset=".55" stop-color="#3a7fd0"/><stop offset="1" stop-color="#16407a"/></radialGradient>' +
      '<linearGradient id="' + p + '-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
    '</defs>' +
    '<rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="url(#' + p + '-body)" stroke="#14181d"/>' +
    '<rect x="2.5" y="2.5" width="27" height="27" rx="6" fill="none" stroke="#fff" stroke-opacity=".18"/>' +
    '<circle cx="16" cy="16" r="9" fill="url(#' + p + '-lens)" stroke="#0e2c55"/>' +
    '<path d="M7.6 17.5h16.8" stroke="#e8f3ff" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>' +
    '<circle cx="16" cy="17.5" r="2" fill="#fff"/>' +
    '<ellipse cx="16" cy="11.6" rx="6.2" ry="3.6" fill="url(#' + p + '-gloss)"/>' +
  '</svg>';
};
