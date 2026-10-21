/* ==========================================================================
   00-ns.js — namespace and product constants.
   Must not touch the DOM or localStorage at load time: the test harnesses
   load every module under plain Node.
   ========================================================================== */

var QDF = (typeof QDF !== 'undefined') ? QDF : {};

/* Change APP.name to re-brand the whole application. */
QDF.APP = {
  name: 'QDVC Focus',
  version: '3.0.0',
  /* Written as `format:` at the top of every export and of the saved state.
     Independent of the name, so a rename does not invalidate old exports.
     Only this version is read: the app is pre-release, so earlier formats
     are refused rather than migrated. */
  format: 'qdvc-focus/3',
  /* Every localStorage key the app uses starts with this, which is how
     "Reset app" finds them all. */
  storagePrefix: 'qdvc-focus.',
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

/* Timeline geometry, in pixels. Shared by the layout engine (row and card
   heights) and the view (graph drawing and column widths); the CSS uses the
   same node offset as --node-y. */
QDF.GEOM = {
  nodeY: 24,          /* node centre, from the top of a row */
  laneW: 22,          /* distance between lanes in the graph column */
  laneX0: 14,         /* centre of lane 0 inside the graph column */
  rowMin: 50,         /* a card for a stretch of a few minutes */
  rowMax: 168,        /* a card for a stretch of several hours */
  gapMin: 60,         /* seconds with nothing running worth showing */
  /* Card column width by the most tasks ever running at once: narrower as
     more sit side by side. */
  cardW: [440, 350, 290, 250, 220]
};

QDF.view = QDF.view || {};
