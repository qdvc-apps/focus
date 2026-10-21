/* ==========================================================================
   00-ns.js — namespace and product constants.
   Must not touch the DOM or localStorage at load time: the test harnesses
   load every module under plain Node.
   ========================================================================== */

var QDF = (typeof QDF !== 'undefined') ? QDF : {};

/* Change APP.name to re-brand the whole application. */
QDF.APP = {
  name: 'QDVC Focus',
  version: '1.0.0',
  /* Written as `format:` at the top of every export and of the saved state.
     Independent of the name, so a rename does not invalidate old exports. */
  format: 'qdvc-focus/1',
  /* localStorage keys. Independent of the name for the same reason. */
  storageKey: 'qdvc-focus.v1',
  prefsKey: 'qdvc-focus.prefs.v1',
  /* How many steps of undo are kept in memory (not persisted). */
  undoDepth: 40
};

/* Thresholds for the "since last update" indicator, in minutes. */
QDF.IDLE = {
  warnAfter: 20,
  alertAfter: 60
};

QDF.view = QDF.view || {};
