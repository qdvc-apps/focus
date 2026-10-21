/* ==========================================================================
   67-edit.js — the task editor dialog (title and notes).
   ========================================================================== */

QDF.editor = (function () {
  var U = QDF.util;

  var WHERE = {
    current: 'In focus',
    queue: 'Queued',
    background: 'Running in background',
    done: 'Done'
  };

  function open(id) {
    var s = QDF.store.get();
    var loc = QDF.model.find(s, id);
    if (!loc) return;
    var item = loc.item, now = QDF.store.now();
    var facts = [WHERE[loc.list] + (loc.list === 'queue' && loc.index === 0 ? ' (up next)' : '')];
    facts.push('added ' + U.ago(U.secondsSince(item.created, now)));
    if (item.started) facts.push('first started ' + U.ago(U.secondsSince(item.started, now)));

    function save(root) {
      var title = root.querySelector('#edit-title').value;
      if (!title.trim()) {
        root.querySelector('#edit-title').focus();
        root.querySelector('.field-error').textContent = 'A task needs a title.';
        return false;
      }
      QDF.app.commit('Edit task', function (st) {
        return QDF.model.edit(st, id, { title: title, notes: root.querySelector('#edit-notes').value });
      });
      return true;
    }

    QDF.ui.dialog({
      title: 'Edit task',
      body:
        '<label class="form-label" for="edit-title">Title</label>' +
        '<input class="field field-lg" id="edit-title" maxlength="300" value="' + U.esc(item.title) + '" autocomplete="off">' +
        '<div class="field-error" role="alert"></div>' +
        '<label class="form-label" for="edit-notes">Notes</label>' +
        '<textarea class="field field-area" id="edit-notes" rows="7" placeholder="Links, commands, where you left off…">' + U.esc(item.notes || '') + '</textarea>' +
        '<div class="form-foot-note">' + U.esc(facts.join(' · ')) + '. <kbd>Ctrl</kbd>+<kbd>Enter</kbd> saves.</div>',
      buttons: [
        { label: 'Cancel' },
        { label: 'Save', primary: true, onClick: save }
      ],
      onOpen: function (root) {
        var title = root.querySelector('#edit-title');
        title.select();
        root.addEventListener('keydown', function (e) {
          var inTitle = e.target === title && e.key === 'Enter';
          var withMod = e.key === 'Enter' && (e.ctrlKey || e.metaKey);
          if (inTitle || withMod) {
            e.preventDefault();
            if (save(root)) QDF.ui.closeDialog();
          }
        });
      }
    });
  }

  return { open: open };
})();
