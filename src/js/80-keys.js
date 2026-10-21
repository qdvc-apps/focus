/* ==========================================================================
   80-keys.js — keyboard shortcuts. Single-key shortcuts are ignored while
   typing in a field, while a dialog or menu is open, and with modifiers.
   The About dialog lists them; keep the two in step.
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

    if (e.key === 'Escape' && typing && (t.id === 'add-input' || t.id === 'quick-start-input')) {
      t.value = '';
      t.blur();
      return;
    }
    if (mod && !e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z') && !typing && !QDF.ui.isOpen()) {
      e.preventDefault();
      QDF.app.undo();
      return;
    }
    if (typing || mod || e.altKey || QDF.ui.isOpen()) return;

    if (e.key === 'n' || e.key === 'N' || e.key === '/') {
      e.preventDefault();
      QDF.app.focusAdd();
    } else if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      QDF.transfer.showYaml();
    } else if (e.key === '?') {
      e.preventDefault();
      QDF.about.show();
    }
  }

  return { onKeyDown: onKeyDown, isTyping: isTyping };
})();
