/* ==========================================================================
   50-ui.js — the UI kit: dialogs, pop-up menus and toasts.
   Knows nothing about tasks; views and the controller call into it.
   ========================================================================== */

QDF.ui = (function () {
  var U = QDF.util;
  var dialog = null;     /* { root, opts, restoreFocus } */
  var menu = null;       /* { root, anchor } */
  var seq = 0;

  function layer() {
    return document.getElementById('layer');
  }

  /* ------------------------------------------------------------ dialogs */

  /* opts: { title, body (html), wide, className,
             buttons: [{ label, primary, danger, id, align: 'left', onClick(root) }],
             onOpen(root), onClose() }
     A button's onClick returning false keeps the dialog open. A button
     with no onClick just closes. */
  function openDialog(opts) {
    closeMenu();
    closeDialog(true);
    clearToasts();
    var id = 'dlg-' + (++seq);
    var root = document.createElement('div');
    root.className = 'backdrop';
    var buttons = (opts.buttons || []).map(function (b, n) {
      return '<button type="button" class="btn' + (b.primary ? ' btn-primary' : '') +
        (b.danger ? ' btn-danger' : '') + (b.align === 'left' ? ' push-left' : '') + '"' +
        (b.id ? ' id="' + U.esc(b.id) + '"' : '') + ' data-dialog-button="' + n + '"' +
        (b.disabled ? ' disabled' : '') + '>' +
        (b.icon ? QDF.icon(b.icon) : '') + '<span>' + U.esc(b.label) + '</span></button>';
    }).join('');
    root.innerHTML =
      '<div class="dialog' + (opts.wide ? ' dialog-wide' : '') + (opts.className ? ' ' + opts.className : '') +
        '" role="dialog" aria-modal="true" aria-labelledby="' + id + '">' +
        '<div class="dialog-titlebar">' +
          '<div class="dialog-title" id="' + id + '">' + U.esc(opts.title) + '</div>' +
          '<button type="button" class="titlebar-close" data-dialog-close aria-label="Close">' + QDF.icon('close') + '</button>' +
        '</div>' +
        '<div class="dialog-body">' + (opts.body || '') + '</div>' +
        (buttons ? '<div class="dialog-foot">' + buttons + '</div>' : '') +
      '</div>';
    layer().appendChild(root);

    dialog = { root: root, opts: opts, restoreFocus: document.activeElement };

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-dialog-close]')) { closeDialog(); return; }
      var btn = e.target.closest('[data-dialog-button]');
      if (!btn || btn.disabled) return;
      var spec = opts.buttons[Number(btn.getAttribute('data-dialog-button'))];
      if (spec.onClick && spec.onClick(root) === false) return;
      closeDialog();
    });

    if (opts.onOpen) opts.onOpen(root);
    var focusable = root.querySelector('[autofocus]') ||
      root.querySelector('input, textarea, select') ||
      root.querySelector('.dialog-foot .btn-primary') ||
      root.querySelector('.dialog-foot .btn');
    if (focusable) focusable.focus();
    return root;
  }

  function closeDialog(silently) {
    if (!dialog) return;
    var d = dialog;
    dialog = null;
    if (d.root.parentNode) d.root.parentNode.removeChild(d.root);
    if (d.opts.onClose && !silently) d.opts.onClose();
    if (d.restoreFocus && d.restoreFocus.focus && document.body.contains(d.restoreFocus)) {
      d.restoreFocus.focus();
    }
  }

  /* opts: { title, message (html), confirm, danger } */
  function confirm(opts, onYes) {
    return openDialog({
      title: opts.title,
      body: '<div class="dialog-message">' + opts.message + '</div>',
      buttons: [
        { label: 'Cancel' },
        { label: opts.confirm || 'OK', primary: !opts.danger, danger: !!opts.danger, onClick: function () { onYes(); } }
      ]
    });
  }

  /* -------------------------------------------------------------- menus */

  /* items: [{ label, icon, onSelect, danger, disabled, hint } | 'separator'] */
  function openMenu(anchor, items) {
    var reopen = !menu || menu.anchor !== anchor;
    closeMenu();
    if (!reopen) return;
    var root = document.createElement('div');
    root.className = 'menu';
    root.setAttribute('role', 'menu');
    root.innerHTML = items.map(function (it, n) {
      if (it === 'separator') return '<div class="menu-sep" role="separator"></div>';
      return '<button type="button" class="menu-item' + (it.danger ? ' is-danger' : '') + '" role="menuitem" data-menu-item="' + n + '"' +
        (it.disabled ? ' disabled' : '') + '>' +
        '<span class="menu-icon">' + (it.icon ? QDF.icon(it.icon) : '') + '</span>' +
        '<span class="menu-label">' + U.esc(it.label) + '</span>' +
        (it.hint ? '<span class="menu-hint">' + U.esc(it.hint) + '</span>' : '') +
      '</button>';
    }).join('');
    layer().appendChild(root);
    anchor.classList.add('is-open');
    anchor.setAttribute('aria-expanded', 'true');

    var a = anchor.getBoundingClientRect();
    var w = root.offsetWidth, h = root.offsetHeight;
    var left = Math.min(Math.max(8, a.right - w), window.innerWidth - w - 8);
    var top = a.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, a.top - h - 6);
    root.style.left = left + 'px';
    root.style.top = top + 'px';

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-menu-item]');
      if (!btn || btn.disabled) return;
      var it = items[Number(btn.getAttribute('data-menu-item'))];
      closeMenu();
      if (it.onSelect) it.onSelect();
    });
    menu = { root: root, anchor: anchor };
    var first = root.querySelector('.menu-item:not([disabled])');
    if (first) first.focus();
  }

  function closeMenu() {
    if (!menu) return;
    var m = menu;
    menu = null;
    if (m.root.parentNode) m.root.parentNode.removeChild(m.root);
    m.anchor.classList.remove('is-open');
    m.anchor.setAttribute('aria-expanded', 'false');
  }

  function menuKey(e) {
    var items = Array.prototype.slice.call(menu.root.querySelectorAll('.menu-item:not([disabled])'));
    var at = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { items[(at + 1) % items.length].focus(); return true; }
    if (e.key === 'ArrowUp') { items[(at - 1 + items.length) % items.length].focus(); return true; }
    if (e.key === 'Tab') { closeMenu(); return false; }
    return false;
  }

  /* ------------------------------------------------------------- toasts */

  /* opts: { undo: true, timeout: ms, tone: 'error' } */
  function toast(message, opts) {
    opts = opts || {};
    var host = document.getElementById('toasts');
    var el = document.createElement('div');
    el.className = 'toast' + (opts.tone ? ' toast-' + opts.tone : '');
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="toast-text">' + U.esc(message) + '</span>' +
      (opts.undo ? '<button type="button" class="toast-btn" data-toast-undo>' + QDF.icon('undo') + '<span>Undo</span></button>' : '') +
      '<button type="button" class="toast-x" data-toast-close aria-label="Dismiss">' + QDF.icon('close') + '</button>';
    /* One at a time: an older toast's Undo would undo the newer change. */
    host.innerHTML = '';
    host.appendChild(el);
    var timer = setTimeout(dismiss, opts.timeout || (opts.undo ? 7000 : 3500));
    function dismiss() {
      clearTimeout(timer);
      if (!el.parentNode) return;
      el.classList.add('is-leaving');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 180);
    }
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-toast-undo]')) { dismiss(); QDF.app.undo(); }
      else if (e.target.closest('[data-toast-close]')) dismiss();
    });
    return dismiss;
  }

  function clearToasts() {
    var host = document.getElementById('toasts');
    if (host) host.innerHTML = '';
  }

  /* ----------------------------------------------------- global plumbing */

  function isOpen() {
    return !!(dialog || menu);
  }

  /* Called first by the keyboard handler; returns true when it used the key. */
  function handleKey(e) {
    if (menu) {
      if (e.key === 'Escape') { var a = menu.anchor; closeMenu(); a.focus(); e.preventDefault(); return true; }
      if (menuKey(e)) { e.preventDefault(); return true; }
      return false;
    }
    if (dialog) {
      if (e.key === 'Escape') { closeDialog(); e.preventDefault(); return true; }
      if (e.key === 'Tab') return trapTab(e);
    }
    return false;
  }

  function trapTab(e) {
    var nodes = Array.prototype.slice.call(dialog.root.querySelectorAll(
      'button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'));
    if (!nodes.length) return false;
    var first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); return true; }
    if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); return true; }
    return false;
  }

  function onDocumentPointer(e) {
    if (menu && !menu.root.contains(e.target) && !menu.anchor.contains(e.target)) closeMenu();
  }

  return {
    dialog: openDialog, closeDialog: closeDialog, confirm: confirm,
    menu: openMenu, closeMenu: closeMenu,
    toast: toast, clearToasts: clearToasts,
    isOpen: isOpen, isDialogOpen: function () { return !!dialog; },
    handleKey: handleKey, onDocumentPointer: onDocumentPointer
  };
})();
