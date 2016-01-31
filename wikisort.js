/**
 * Created by Nir Leibovitch on 01/02/2016.
 */

"use strict";

(function() {
  /* Establish the root object, `window` (`self`) in the browser, `global`
   * on the server, or `this` in some virtual machines. We use `self`
   * instead of `window` for `WebWorker` support.
   */
  var root = typeof self == 'object' && self.self === self && self ||
    typeof global == 'object' && global.global === global && global ||
    this;

  // Save the previous value of the `wikisort` variable.
  var previousWikisort = root.wikisort;

  // Create a safe reference to the WikiSort object for use below.
  var wikisort = function() {};

  wikisort.noConflict = function() {
    root.wikisort = previousWikisort;
    return wikisort;
  };

  /* Export the WikiSort object for **Node.js**, with
   * backwards-compatibility for their old module API. If we're in
   * the browser, add `wikisort` as a global object.
   * (`nodeType` is checked to ensure that `module`
   * and `exports` are not HTML elements.)
   */
  if (typeof exports != 'undefined' && !exports.nodeType) {
    if (typeof module != 'undefined' && !module.nodeType && module.exports) {
      //noinspection JSUnresolvedVariable
      exports = module.exports = wikisort;
    }
    exports.wikisort = wikisort;
  } else {
    root.wikisort = wikisort;
  }
}).call(this);
