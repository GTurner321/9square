// Question Grid — diagram renderer (dispatcher)
// This file itself never needs to change when a new diagram type is
// added. Each type-specific file (e.g. trigPythagDiag.js) registers
// its own builder function against one or more "Diagram Type" values
// via DiagramRenderer.register(...); this file just looks the right
// one up and calls it.
//
// A builder function has the signature (params, opts) -> SVG string,
// where `params` is the already-parsed key=value;key=value object
// from the CSV's "Diagram Params" column, and `opts` carries render
// options like flipH/flipV/width/height (see individual builders for
// what they support).
//
// Load this file BEFORE any *Diag.js builder file, and load all of
// them BEFORE grid.js, which is the only other file that calls
// DiagramRenderer.renderDiagram(...).

const DiagramRenderer = (() => {

  const builders = {}; // "Diagram Type" string -> builder function

  /**
   * Registers a builder against one or more Diagram Type values.
   * Call this once, at the bottom of the file that defines the
   * builder - see trigPythagDiag.js for the pattern.
   */
  function register(diagramTypes, builderFn) {
    const types = Array.isArray(diagramTypes) ? diagramTypes : [diagramTypes];
    types.forEach(type => { builders[type] = builderFn; });
  }

  /**
   * Parses "key=value;key=value" (semicolon-delimited, so the CSV's
   * own commas can't collide with it - see practice_set.csv's
   * "Diagram Params" column).
   */
  function parseDiagramParams(paramsString) {
    const params = {};
    if (!paramsString) return params;
    paramsString.split(';').forEach(pair => {
      const eq = pair.indexOf('=');
      if (eq === -1) return;
      const key = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (key) params[key] = value;
    });
    return params;
  }

  /**
   * Looks up the builder registered for diagramType, parses
   * paramsString, and returns the SVG string it produces - or ''
   * (with a console warning) if nothing is registered for that type,
   * so a bad/unrecognised CSV value degrades to "no diagram shown"
   * rather than breaking the square.
   */
  function renderDiagram(diagramType, paramsString, opts = {}) {
    const builder = builders[diagramType];
    if (!builder) {
      console.warn(`DiagramRenderer: no builder registered for Diagram Type "${diagramType}"`);
      return '';
    }
    const params = parseDiagramParams(paramsString);
    try {
      return builder(params, opts);
    } catch (err) {
      console.error(`DiagramRenderer: builder for "${diagramType}" threw`, err);
      return '';
    }
  }

  return { register, renderDiagram, parseDiagramParams };
})();
