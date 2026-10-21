/* ==========================================================================
   80-keys.js — keyboard shortcuts. Single-key shortcuts are ignored while
   typing in a field, while a dialog or menu is open, and with modifiers.
   The table in 70-settings.js (About) lists them; keep the two in step.
   ========================================================================== */

QDF.keys = (function () {

  function isTyping(t) {
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  function onKeyDown(e) {
    if (QDF.ui.handleKey(e)) return;
    var t = e.target;
    var typing = isTyping(t);
    var mod = e.ctrlKey || e.metaKey;

    if (e.key === 'Escape' && typing) {
      if (t.id === 'add-input' || t.id === 'quick-start-input') t.value = '';
      t.blur();
      return;
    }
    if (mod && !e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z') && !typing && !QDF.ui.isOpen()) {
      e.preventDefault();
      QDF.app.undo();
      return;
    }
    if (typing || mod || e.altKey || QDF.ui.isOpen()) return;

    var A = QDF.app.actions;
    switch (e.key) {
      case 'n': case 'N': case '/': e.preventDefault(); QDF.app.focusAdd(); break;
      case '.': e.preventDefault(); A['jump-now'](); break;
      case '[': e.preventDefault(); A['toggle-overview'](); break;
      case ']': e.preventDefault(); A['toggle-inspector'](); break;
      case 'y': case 'Y': e.preventDefault(); QDF.transfer.showYaml(); break;
      case 't': case 'T': e.preventDefault(); A['toggle-timers'](); break;
      case ',': e.preventDefault(); QDF.settings.show(); break;
      case '?': e.preventDefault(); QDF.settings.show('about'); break;
      case 'Escape': QDF.app.select(null); break;
    }
  }

  return { onKeyDown: onKeyDown, isTyping: isTyping };
})();
