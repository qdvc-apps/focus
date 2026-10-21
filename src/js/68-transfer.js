/* ==========================================================================
   68-transfer.js — the YAML view, export and import.
   ========================================================================== */

QDF.transfer = (function () {
  var U = QDF.util;

  /* Light syntax colouring for the emitted subset. Works line by line on
     escaped text, so it can never inject markup. */
  function highlight(text) {
    return text.replace(/\n$/, '').split('\n').map(function (line) {
      var m;
      if (/^\s*#/.test(line)) return '<span class="y-comment">' + U.esc(line) + '</span>';
      if ((m = /^(\s*)(- )?([^\s:"'][^:]*|"[^"]*"):( (.*))?$/.exec(line))) {
        return U.esc(m[1]) + (m[2] ? '<span class="y-dash">- </span>' : '') +
          '<span class="y-key">' + U.esc(m[3]) + '</span><span class="y-punct">:</span>' +
          (m[4] ? ' ' + value(m[5]) : '');
      }
      if ((m = /^(\s*)- (.*)$/.exec(line))) {
        return U.esc(m[1]) + '<span class="y-dash">- </span>' + value(m[2]);
      }
      return '<span class="y-text">' + U.esc(line) + '</span>';
    }).join('\n');
  }

  function value(v) {
    var cls = 'y-str';
    if (/^(null|~|true|false|\[\]|\{\})$/.test(v)) cls = 'y-lit';
    else if (/^-?\d+(\.\d+)?$/.test(v)) cls = 'y-num';
    else if (/^\d{4}-\d\d-\d\dT/.test(v)) cls = 'y-time';
    else if (/^[|>][-+]?$/.test(v)) cls = 'y-punct';
    return '<span class="' + cls + '">' + U.esc(v) + '</span>';
  }

  function currentYaml() {
    return QDF.serialize.toYaml(QDF.store.get(), QDF.store.now());
  }

  function fileName() {
    return 'qdvc-focus-' + U.fileStamp(QDF.store.now()) + '.yaml';
  }

  function copyText(text, done) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else {
      fallback();
    }
  }

  function showYaml() {
    var text = currentYaml();
    var lines = text.replace(/\n$/, '').split('\n').length;
    QDF.ui.dialog({
      title: 'Current state as YAML',
      wide: true,
      className: 'dialog-code',
      body:
        '<div class="code-meta">' +
          '<span>' + U.plural(lines, 'line') + ' · ' + U.plural(text.length, 'character') + '</span>' +
          '<span class="dim">Read-only. Export it to keep it; import it to pick up where you left off.</span>' +
        '</div>' +
        '<pre class="code" tabindex="0" aria-label="State as YAML">' + highlight(text) + '</pre>',
      buttons: [
        { label: 'Copy', icon: 'copy', align: 'left', onClick: function () {
            copyText(text, function (ok) {
              QDF.ui.toast(ok ? 'Copied the YAML to the clipboard.' : 'Could not copy; select the text and copy it yourself.',
                ok ? null : { tone: 'error' });
            });
            return false;
          } },
        { label: 'Download .yaml', icon: 'exportFile', onClick: function () { exportYaml(text); return false; } },
        { label: 'Close', primary: true }
      ]
    });
  }

  function exportYaml(text) {
    var name = fileName();
    U.download(name, text || currentYaml(), 'application/yaml');
    QDF.ui.toast('Exported ' + name + '.');
  }

  function summary(st) {
    var bits = [];
    bits.push(st.current ? '“' + st.current.title + '” in focus' : 'nothing in focus');
    bits.push(U.plural(st.queue.length, 'queued', 'queued'));
    bits.push(st.background.length + ' in background');
    bits.push(st.done.length + ' done');
    return bits.join(', ');
  }

  /* prefill: optional { text, name } from a file dropped on the window. */
  function importDialog(prefill) {
    var parsed = null;

    function check(root) {
      var text = root.querySelector('#import-text').value;
      var verdict = root.querySelector('#import-verdict');
      var go = root.querySelector('#import-go');
      parsed = null;
      if (!text.trim()) {
        verdict.className = 'import-verdict';
        verdict.innerHTML = 'Choose a file, drop one here, or paste YAML above.';
        go.disabled = true;
        return;
      }
      try {
        var r = QDF.serialize.fromYaml(text, QDF.store.now());
        parsed = r.state;
        verdict.className = 'import-verdict is-ok';
        verdict.innerHTML = '<b>Ready to import:</b> ' + U.esc(summary(parsed)) + '. ' +
          'This replaces everything here now; you can undo it afterwards.' +
          (r.warnings.length ? '<ul class="import-warnings">' + r.warnings.slice(0, 6).map(function (w) {
            return '<li>' + U.esc(w) + '</li>';
          }).join('') + (r.warnings.length > 6 ? '<li>…and ' + (r.warnings.length - 6) + ' more.</li>' : '') + '</ul>' : '');
        go.disabled = false;
      } catch (e) {
        verdict.className = 'import-verdict is-error';
        verdict.innerHTML = '<b>Cannot import this.</b> ' + U.esc(e.message);
        go.disabled = true;
      }
    }

    function load(root, file) {
      U.readFile(file, function (err, text) {
        if (err) { QDF.ui.toast('Could not read ' + file.name + '.', { tone: 'error' }); return; }
        root.querySelector('#import-text').value = text;
        root.querySelector('#import-source').textContent = file.name;
        check(root);
      });
    }

    QDF.ui.dialog({
      title: 'Import state',
      wide: true,
      body:
        '<div class="import-drop" id="import-drop">' +
          '<button type="button" class="btn" id="import-choose">' + QDF.icon('importFile') + '<span>Choose file…</span></button>' +
          '<span class="import-drop-text">or drop a <code>.yaml</code> file here, or paste below</span>' +
          '<span class="import-source" id="import-source"></span>' +
        '</div>' +
        '<textarea class="field field-code" id="import-text" spellcheck="false" autocomplete="off" rows="14" ' +
          'placeholder="format: qdvc-focus/1&#10;current:&#10;  title: …" aria-label="YAML to import"></textarea>' +
        '<div class="import-verdict" id="import-verdict" aria-live="polite"></div>',
      buttons: [
        { label: 'Cancel' },
        { label: 'Import and replace', id: 'import-go', primary: true, disabled: true, onClick: function () {
            if (!parsed) return false;
            QDF.store.replace(parsed, 'Import');
            QDF.ui.toast('Imported: ' + summary(QDF.store.get()) + '.', { undo: true });
            return true;
          } }
      ],
      onOpen: function (root) {
        var input = document.getElementById('file-input');
        var ta = root.querySelector('#import-text');
        var drop = root.querySelector('#import-drop');
        var timer = null;
        ta.addEventListener('input', function () {
          clearTimeout(timer);
          root.querySelector('#import-source').textContent = '';
          timer = setTimeout(function () { check(root); }, 200);
        });
        root.querySelector('#import-choose').addEventListener('click', function () {
          input.value = '';
          input.onchange = function () { if (input.files && input.files[0]) load(root, input.files[0]); };
          input.click();
        });
        drop.addEventListener('dragover', function (e) {
          if (hasFiles(e)) { e.preventDefault(); e.stopPropagation(); drop.classList.add('is-over'); }
        });
        drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
        drop.addEventListener('drop', function (e) {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.stopPropagation();
          drop.classList.remove('is-over');
          load(root, e.dataTransfer.files[0]);
        });
        if (prefill) {
          ta.value = prefill.text;
          root.querySelector('#import-source').textContent = prefill.name || '';
        }
        check(root);
        if (!prefill) root.querySelector('#import-choose').focus();
      }
    });
  }

  function hasFiles(e) {
    var types = e.dataTransfer && e.dataTransfer.types;
    return !!types && Array.prototype.indexOf.call(types, 'Files') !== -1;
  }

  return {
    showYaml: showYaml, exportYaml: exportYaml, importDialog: importDialog,
    highlight: highlight, hasFiles: hasFiles
  };
})();
