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
  var wikisort = function(array, comp) {
    return new WikiSorter().sort(array, comp);
  };

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

  // structure to represent ranges within the array
  var Range = function(start, end) {
    this.start = start || 0;
    this.end = end || 0;
  };

  Range.prototype = {
    get length() {
      return this.end - this.start;
    },
    set: function(start, end) {
      this.start = start;
      this.end = end;
    }
  };

  var Pull = function() {
    this.range = new Range(0, 0);
    this.from = 0;
    this.to = 0;
    this.count = 0;
  };

  Pull.prototype = {
    reset: function() {
      this.range.set(0, 0);
      this.from = 0;
      this.to = 0;
      this.count = 0;
    }
  };

  /* calculate how to scale the index value to the range within the array
   * the bottom-up merge sort only operates on values that are powers of two,
   * so scale down to that power of two, then use a fraction to scale back again
   */
  var Iterator = function(size, minLevel) {
    this.size = size;
    this.powerOfTwo = this.floorPowerOfTwo(this.size);
    this.denominator = this.powerOfTwo / minLevel;
    this.numeratorStep = this.size % this.denominator;
    this.decimalStep = this.size / this.denominator;
    this.begin();
  };

  Iterator.prototype = {
    /* 63 -> 32, 64 -> 64, etc.
     * this comes from Hacker's Delight
     */
    floorPowerOfTwo: function(value) {
      var x = value;
      x = x | (x >> 1);
      x = x | (x >> 2);
      x = x | (x >> 4);
      x = x | (x >> 8);
      x = x | (x >> 16);
      return x - (x >> 1);
    },
    begin: function() {
      this.numerator = this.decimal = 0;
    },
    nextRange: function() {
      var start = this.decimal;

      this.decimal += this.decimalStep;
      if(this.numerator >= this.denominator) {
        this.numerator -= this.denominator;
        this.decimal++;
      }

      return new Range(start, this.decimal);
    },
    get finished() {
      return this.decimal >= this.size;
    },
    nextLevel: function() {
      this.decimalStep += this.decimalStep;
      this.numeratorStep += this.numeratorStep;
      if(this.numeratorStep >= this.denominator) {
        this.numeratorStep -= this.denominator;
        this.decimalStep++;
      }

      return this.decimalStep < this.size;
    },
    get length() {
      return this.decimalStep;
    }
  };

  var WikiSorter = function() {
    this.cacheSize = 512;
  };

  WikiSorter.prototype = {

  };

  wikisort.sorter = WikiSorter;
}).call(this);
