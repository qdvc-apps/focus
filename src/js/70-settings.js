/* ==========================================================================
   70-settings.js — the settings window: a preferences window with three
   panes. Appearance (theme), Data (the YAML view, import, export, clearing
   history, resetting the app) and About (what this is, and the shortcuts).
   ========================================================================== */

QDF.settings = (function () {
  var U = QDF.util;

  var KEYS = [
    ['.', 'Jump to now'],
    ['N', 'Add a task to the queue'],
    ['Shift + Enter', 'In the add box: add as up next'],
    ['Ctrl + Enter', 'In the add box: start it now'],
    ['T', 'Show or hide timers'],
    ['[', 'Open or close the overview'],
    [']', 'Open or close the inspector'],
    ['Ctrl + Z', 'Undo the last change (⌘ Z on a Mac)'],
    ['Y', 'Show the current state as YAML'],
    [',', 'Settings'],
    ['?', 'Keyboard shortcuts'],
    ['Esc', 'Close a window, a menu, or the selection']
  ];

  var TABS = [
    ['appearance', 'palette', 'Appearance'],
    ['data', 'database', 'Data'],
    ['about', 'info', 'About']
  ];

  function row(title, sub, button) {
    return '<div class="pref-row"><div class="pref-row-text"><div class="pref-row-title">' + title + '</div>' +
      '<div class="pref-row-sub">' + sub + '</div></div>' + button + '</div>';
  }

  function button(id, icon, label, cls, disabled) {
    return '<button type="button" class="btn' + (cls ? ' ' + cls : '') + '" id="' + id + '"' + (disabled ? ' disabled' : '') + '>' +
      QDF.icon(icon) + '<span>' + label + '</span></button>';
  }

  function storageLine() {
    var info = QDF.store.info(), use = QDF.store.usage();
    if (info.error) return '<span style="color:var(--red)">' + U.esc(info.error) + '</span>';
    if (!use.keys) return 'Nothing is stored in this browser yet; it will be saved with your next change.';
    return 'Kept in this browser: ' + (use.bytes < 1024 ? use.bytes + ' bytes' : (use.bytes / 1024).toFixed(1) + ' KB') +
      (info.savedAt ? ', last saved at ' + U.esc(U.timeOfDay(U.iso(info.savedAt))) : '') + '.';
  }

  function themeNote() {
    return QDF.prefs.get('theme') === 'auto'
      ? 'Auto follows your system setting, which is currently ' + QDF.prefs.effectiveTheme() + '.'
      : 'Auto would follow your system setting.';
  }

  function panes() {
    var theme = QDF.prefs.get('theme');
    var doneCount = QDF.store.get().done.length;
    var choices = [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']].map(function (c) {
      return '<button type="button" class="theme-choice" role="radio" aria-checked="' + (theme === c[0]) + '" data-theme-choice="' + c[0] + '">' +
        '<span class="theme-swatch sw-' + c[0] + '" aria-hidden="true"></span>' + c[1] + '</button>';
    }).join('');

    var appearance =
      '<div class="pref-group"><div class="label">Colour theme</div>' +
        '<div class="theme-picker" role="radiogroup" aria-label="Colour theme">' + choices + '</div>' +
        '<p class="pref-note" id="theme-note">' + themeNote() + '</p>' +
      '</div>';

    var data =
      '<div class="pref-group"><div class="label">Your data</div>' +
        row('Current state as YAML', 'Everything the app is holding, exactly as it would be exported.', button('pref-yaml', 'code', 'View…')) +
        row('Export', 'Download it as a .yaml file, to keep or to carry on in another browser.', button('pref-export', 'exportFile', 'Export…')) +
        row('Import', 'Replace everything here with a .yaml file you exported. You can undo it.', button('pref-import', 'importFile', 'Import…')) +
        '<p class="pref-note" id="pref-storage">' + storageLine() + '</p>' +
      '</div>' +
      '<div class="pref-group"><div class="label">History</div>' +
        row('Clear finished tasks', doneCount
            ? 'Removes ' + U.plural(doneCount, 'finished task') + ' and their history from the timeline. You can undo it.'
            : 'There are no finished tasks to clear.',
          button('pref-clear', 'trash', 'Clear…', '', !doneCount)) +
      '</div>' +
      '<div class="pref-group"><div class="label">Reset</div>' +
        row('Reset app', 'Deletes everything ' + U.esc(QDF.APP.name) + ' keeps in this browser: tasks, history and settings. This cannot be undone.',
          button('pref-reset', 'restore', 'Reset app…', 'btn-danger')) +
      '</div>';

    var about =
      '<div class="about-head"><div class="about-mark" aria-hidden="true">' + QDF.view.brandMark('bm-about') + '</div>' +
        '<div><div class="about-name">' + U.esc(QDF.APP.name) + '</div>' +
        '<div class="dim">Version ' + U.esc(QDF.APP.version) + ' · format ' + U.esc(QDF.APP.format) + '</div></div></div>' +
      '<p>A timeline of your work: what you did, what is running now, and what could come next. ' +
        'Tasks can run in parallel; they branch off side by side and join back up when they end. ' +
        'Pick one to keep in the foreground — the history only records that they ran.</p>' +
      '<p>Everything stays in this browser. Export the YAML to keep a copy, and import it to resume.</p>' +
      '<table class="keys"><tbody>' + KEYS.map(function (k) {
        return '<tr><td>' + k[0].split(' + ').map(function (p) { return '<kbd>' + U.esc(p) + '</kbd>'; }).join(' + ') +
          '</td><td>' + U.esc(k[1]) + '</td></tr>';
      }).join('') + '</tbody></table>';

    return { appearance: appearance, data: data, about: about };
  }

  function show(tab) {
    tab = tab || 'appearance';
    var p = panes();
    var tabs = TABS.map(function (t) {
      return '<button type="button" class="pref-tab" role="tab" id="pref-tab-' + t[0] + '" aria-controls="pref-pane-' + t[0] + '" ' +
        'aria-selected="' + (t[0] === tab) + '" data-pref-tab="' + t[0] + '">' + QDF.icon(t[1]) + '<span>' + t[2] + '</span></button>';
    }).join('');
    var body = '<div class="pref-tabs" role="tablist">' + tabs + '</div>' +
      TABS.map(function (t) {
        return '<div class="pref-pane' + (t[0] === tab ? ' is-shown' : '') + '" role="tabpanel" id="pref-pane-' + t[0] + '" aria-labelledby="pref-tab-' + t[0] + '">' + p[t[0]] + '</div>';
      }).join('');

    QDF.ui.dialog({
      title: 'Settings',
      className: 'dialog-prefs',
      body: body,
      buttons: [{ label: 'Done', primary: true }],
      onOpen: function (root) {
        root.addEventListener('click', function (e) {
          var t = e.target.closest('[data-pref-tab]');
          if (t) {
            var name = t.getAttribute('data-pref-tab');
            Array.prototype.forEach.call(root.querySelectorAll('[data-pref-tab]'), function (b) {
              b.setAttribute('aria-selected', String(b === t));
            });
            Array.prototype.forEach.call(root.querySelectorAll('.pref-pane'), function (pane) {
              pane.classList.toggle('is-shown', pane.id === 'pref-pane-' + name);
            });
            return;
          }
          var choice = e.target.closest('[data-theme-choice]');
          if (choice) {
            QDF.prefs.set('theme', choice.getAttribute('data-theme-choice'));
            Array.prototype.forEach.call(root.querySelectorAll('[data-theme-choice]'), function (b) {
              b.setAttribute('aria-checked', String(b === choice));
            });
            root.querySelector('#theme-note').textContent = themeNote();
            return;
          }
          var btn = e.target.closest('button[id^="pref-"]');
          if (!btn || btn.disabled) return;
          switch (btn.id) {
            case 'pref-yaml': QDF.transfer.showYaml(); break;
            case 'pref-export': QDF.transfer.exportYaml(); root.querySelector('#pref-storage').innerHTML = storageLine(); break;
            case 'pref-import': QDF.transfer.importDialog(); break;
            case 'pref-clear': QDF.ui.closeDialog(); QDF.app.clearDone(); break;
            case 'pref-reset': confirmReset(); break;
          }
        });
        var selected = root.querySelector('.pref-tab[aria-selected="true"]');
        if (selected) selected.focus();
      }
    });
  }

  function confirmReset() {
    var use = QDF.store.usage();
    QDF.ui.dialog({
      title: 'Reset ' + QDF.APP.name + '?',
      body: '<div class="dialog-message"><p>This deletes everything the app keeps in this browser' +
        (use.keys ? ' (' + U.plural(use.keys, 'storage key') + ')' : '') +
        ': every task, the whole history, and your settings. It cannot be undone.</p>' +
        '<p>If you might want any of it back, export a copy first.</p></div>',
      buttons: [
        { label: 'Export a copy first', icon: 'exportFile', align: 'left', onClick: function () { QDF.transfer.exportYaml(); return false; } },
        { label: 'Cancel' },
        { label: 'Reset everything', danger: true, onClick: function () { QDF.app.resetAll(); } }
      ]
    });
  }

  return { show: show };
})();
