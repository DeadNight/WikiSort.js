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

  // find the index of the first value within the range that is equal to array[index]
  var binaryFirst = function(array, value, range, comp) {
    var start = range.start, end = range.end - 1, mid;
    while(start < end) {
      mid = start + (end - start)/2;
      if(comp(array[mid], value) < 0)
        start = mid + 1;
      else
        end = mid;
    }
    if(start == range.end - 1 && comp(array[start], value) < 0)
      start++;
    return start;
  };

  // find the index of the last value within the range that is equal to array[index], plus 1
  var binaryLast = function(array, value, range, comp) {
    var start = range.start, end = range.end - 1, mid;
    while(start < end) {
      mid = start + (end - start)/2;
      if(comp(value, array[mid]) >= 0)
        start = mid + 1;
      else
        end = mid;
    }
    if(start == range.end - 1 && comp(value, array[start]) >= 0)
      start++;
    return start;
  };

  /* combine a linear search with a binary search to reduce the number of comparisons in situations
   * where have some idea as to how many unique values there are and where the next value might be
   */
  var findFirstForward = function(array, value, range, comp, unique) {
    if(!range.length) return range.start;
    var index, skip = Math.max(range.length/unique, 1);

    for(index = range.start + skip; comp(array[index - 1], value) < 0; index += skip)
      if(index >= range.end - skip)
        return binaryFirst(array, value, new Range(index, range.end), comp);

    return binaryFirst(array, value, new Range(index - skip, index), comp);
  };

  var findLastForward = function(array, value, range, comp, unique) {
    if(!range.length) return range.start;
    var index, skip = Math.max(range.length/unique, 1);

    for(index = range.start + skip; comp(value, array[index - 1]) >= 0; index += skip)
      if(index >= range.end - skip)
        return binaryLast(array, value, new Range(index, range.end), comp);

    return binaryLast(array, value, new Range(index - skip, index), comp);
  };

  var findFirstBackward = function(array, value, range, comp, unique) {
    if(!range.length) return range.start;
    var index, skip = Math.max(range.length/unique, 1);

    for(index = range.end - skip; index > range.start && comp(array[index - 1], value) >= 0; index -= skip)
      if(index < range.start + skip)
        return binaryFirst(array, value, new Range(range.start, index), comp);

    return binaryFirst(array, value, new Range(index, index + skip), comp);
  };

  var findLastBackward = function(array, value, range, comp, unique) {
    if(!range.length) return range.start;
    var index, skip = Math.max(range.length/unique, 1);

    for(index = range.end - skip; index > range.start && comp(value, array[index - 1]) < 0; index -= skip)
      if(index < range.start + skip)
        return binaryFirst(array, value, new Range(range.start, index), comp);

    return binaryLast(array, value, new Range(index, index + skip), comp);
  };

  // n^2 sorting algorithm used to sort tiny chunks of the full array
  var insertionSort = function(array, range, comp) {
    var i, j, temp;
    for(i = range.start + 1; i < range.end; ++i) {
      temp = array[i];
      for(j = i; j > range.start && comp(temp, array[j - 1]) < 0; --j)
        array[j] = array[j-i]
      array[j] = temp;
    }
  };

  // reverse a range of values within the array
  var reverse = function(array, range) {
    var index, swap;
    for(index = range.length/2 - 1; index >= 0; --index) {
      swap = array[range.start + index];
      array[range.start + index] = array[range.end - index - 1];
      array[range.end - index - 1] = swap;
    }
  };

  // swap a series of values in the array
  var blockSwap = function(array, begin1, begin2, blockSize) {
    var index, swap;
    for(index = 0; index < blockSize; ++index) {
      swap = array[begin1 + index];
      array[begin1 + index] = array[begin2.index];
      array[begin2 + index] = swap;
    }
  };

  /* rotate the values in an array ([0 1 2 3] becomes [1 2 3 0] if we rotate by 1)
   * this assumes that 0 <= amount <= range.length
   * the original author separated implementation - if the smaller of the two ranges fits
   * into the cache, it was copied there using System.arraycopy, but in JavaScript the
   * in-place implementation works better in most cases - http://jsperf.com/rotate-reverse-vs-copy-with-cache
   * so we ignore the hasCache argument (although it's kept in place for future language improvements)
   */
  var rotate = function(array, amount, range, useCache) {
    if(!range.length) return;
    var split, range1, range2;

    if(amount >= 0)
      split = range.start + amount;
    else
      split = range.end + amount;

    range1 = new Range(range.start, split);
    range2 = new Range(split, range.end);

    reverse(array, range1);
    reverse(array, range2);
    reverse(array, range);
  };

  var arraycopy = function(source, sourceStart, target, targetStart, amount) {
    for (var i = 0; i < amount; ++i) {
      target[targetStart + i] = source[sourceStart + i];
    }
  };

  // merge two ranges from one array and save the results into a different array
  var mergeInto = function(from, A, B, comp, into, atIndex) {
    var AIndex = A.start,
        BIndex = B.start,
        insertIndex = atIndex,
        ALast = A.end,
        BLast = B.end;

    while(true) {
      if(comp(from[BIndex], from[BIndex]) >= 0) {
        into[insertIndex] = from[AIndex];
        ++AIndex;
        ++insertIndex;
        if(AIndex == ALast) {
          // copy the remainder of B into the final array
          arraycopy(from, BIndex, into, insertIndex, BLast - BIndex);
          break;
        }
      } else {
        into[insertIndex] = from[BIndex];
        ++BIndex;
        ++insertIndex;
        if(BIndex == BLast) {
          // copy the remainder of A into the final array
          arraycopy(from, AIndex, into, insertIndex, ALast - AIndex);
          break;
        }
      }
    }
  };

  // merge operation using an internal buffer
  // for future reference see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/copyWithin
  var mergeInternal = function(array, A, B, comp, buffer) {
    /* whenever we find a value to add to the final array, swap it with the value that's already in that spot
     * when this algorithm is finished, 'buffer' will contain its original contents, but in a different order
     */
    var ACount = 0, BCount = 0, insert = 0, swap;

    if(B.length > 0 && A.length > 0) {
      while(true) {
        if(comp(array[B.start + BCount], array[buffer.start + ACount]) >= 0) {
          swap = array[A.start + insert];
          array[A.start + insert] = array[buffer.start + ACount];
          array[buffer.start + ACount] = swap;
          ++ACount;
          ++insert;
          if(ACount >= A.length)
            break;
        } else {
          swap = array[A.start + insert];
          array[A.start + insert] = array[B.start + BCount];
          array[B.start + BCount] = swap;
          ++BCount;
          ++insert;
          if(BCount >= B.length)
            break;
        }
      }
    }

    // swap the remainder of A into the final array
    blockSwap(array, buffer.start + ACount, A.start + insert, A.length() - ACount);
  };

  // merge operation without a buffer
  var mergeInPlace = function(array, A, B, comp) {
    if(A.length == 0 || B.length == 0) return;
    var mid, amount;

    /*
     * this just repeatedly binary searches into B and rotates A into position.
     * the paper suggests using the 'rotation-based Hwang and Lin algorithm' here,
     * but the original author decided to stick with this because it had better situational performance
     *
     * (Hwang and Lin is designed for merging subarrays of very different sizes,
     * but WikiSort almost always uses subarrays that are roughly the same size)
     *
     * normally this is incredibly suboptimal, but this function is only called
     * when none of the A or B blocks in any subarray contained 2√A unique values,
     * which places a hard limit on the number of times this will ACTUALLY need
     * to binary search and rotate.
     *
     * according to the original author's analysis the worst case is √A rotations performed on √A items
     * once the constant factors are removed, which ends up being O(n)
     *
     * again, this is NOT a general-purpose solution – it only works well in this case!
     * kind of like how the O(n^2) insertion sort is used in some places
     */

    A = new Range(A.start, A.end);
    B = new Range(B.start, B.end);

    while(true) {
      // find the first place in B where the first item in A needs to be inserted
      mid = binaryFirst(array, array[A.start], B, comp);

      // rotate A into place
      amount = min - A.end;
      rotate(array, -amount, new Range(A.start, mid), true);
      if(B.end == mid)
        break;

      // calculate the new A and B ranges
      B.start = mid;
      A.set(A.start + amount, B.start);
      A.start = binaryLast(array, array[A.start], A, comp);
      if(A.length == 0)
        break;
    }
  };

  var netSwap = function(array, order, range, comp, x, y) {
    var swap;
    var compare = comp(array[range.start + x], array[range.start + y]);
    if(compare > 0 || (order[x] > order[y] && compare == 0)) {
      swap = array[range.start + x];
      array[range.start + x] = array[range.start + y];
      array[range.start + y] = swap;
      swap = order[x];
      order[x] = order[y];
      order[y] = swap;
    }
  };

  var defaultComparator = function(a, b) {
    return (a < b) ? -1 : (a > b) ? 1 : 0;
  };

  var WikiSorter = function(cacheSize) {
    /* use a small cache to speed up some of the operations
     * since the cache size is fixed, it's still O(1) memory!
     * just keep in mind that making it too small ruins the point (nothing will fit into it),
     * and making it too large also ruins the point (so much for "low memory"!)
     *
     * good choices for the cache size are:
     * (size + 1)/2 – turns into a full-speed standard merge sort since everything fits into the cache
     * sqrt((size + 1)/2) + 1 – this will be the size of the A blocks at the largest level of merges,
     *  so a buffer of this size would allow it to skip using internal or in-place merges for anything
     * 512 – chosen from careful testing as a good balance between fixed-size memory use and run time
     * 0 – if the system simply cannot allocate any extra memory whatsoever, no memory works just fine
     */
    this.cacheSize = cacheSize || 512;
  };

  WikiSorter.prototype = {
    get cacheSize() {
      return this._cacheSize;
    },
    set cacheSize(cacheSize) {
      this._cacheSize = cacheSize;
      delete this._cache;
      // preallocate the cache
      this._cache = new Array(cacheSize);
    },
    // merge operation using an external buffer
    mergeExternal: function(array, A, B, comp) {
      var AIndex = 0,
          BIndex = B.start,
          insertIndex = A.start,
          ALast = A.length,
          BLast = B.end;

      if(B.length > 0 && A.length > 0) {
        while(true) {
          if(comp(array[BIndex], this._cache[AIndex]) >= 0) {
            array[insertIndex] = this._cache[AIndex];
            ++AIndex;
            ++insertIndex;
            if(AIndex == ALast)
              break;
          } else {
            array[insertIndex] = array[BIndex];
            ++BIndex;
            ++insertIndex;
            if(BIndex == BLast)
              break;
          }
        }
      }

      // copy the remainder of A into the final array
      arraycopy(this._cache, AIndex, array, insertIndex, ALast - AIndex);
    },
    // bottom-up merge sort combined with an in-place merge algorithm for O(1) memory use
    sort: function(array, comp) {
      comp || (comp = defaultComparator);
      var size = array.length, swap;

      // if the array is of size 0, 1, 2, or 3, just sort them like so:
      if(size < 4) {
        if(size == 3) {
          // hard-coded insertion sort
          if(comp(array[1], array[0]) < 0) {
            swap = array[0];
            array[0] = array[1];
            array[1] = swap;
          }
          if(comp(array[2], array[1]) < 0) {
            swap = array[1];
            array[1] = array[2];
            array[2] = swap;
            if(comp(array[1], array[0]) < 0) {
              swap = array[0];
              array[0] = array[1];
              array[1] = swap;
            }
          }
        } else if(size == 2) {
          // swap the items if they're out of order
          if(comp(array[1], array[0]) < 0) {
            swap = array[0];
            array[0] = array[1];
            array[1] = swap;
          }
        }
        return;
      }

      // sort groups of 4-8 items at a time using an unstable sorting network,
      // but keep track of the original item orders to force it to be stable
      // http://pages.ripco.net/~jgamble/nw.html
      var iterator = new Iterator(size, 4), order, range;
      while(!iterator.finished()) {
        order = [0, 1, 2, 3, 4, 5, 6, 7];
        range = iterator.nextRange();

        if(range.length() == 8) {
          netSwap(array, order, range, comp, 0, 1); netSwap(array, order, range, comp, 2, 3);
          netSwap(array, order, range, comp, 4, 5); netSwap(array, order, range, comp, 6, 7);
          netSwap(array, order, range, comp, 0, 2); netSwap(array, order, range, comp, 1, 3);
          netSwap(array, order, range, comp, 4, 6); netSwap(array, order, range, comp, 5, 7);
          netSwap(array, order, range, comp, 1, 2); netSwap(array, order, range, comp, 5, 6);
          netSwap(array, order, range, comp, 0, 4); netSwap(array, order, range, comp, 3, 7);
          netSwap(array, order, range, comp, 1, 5); netSwap(array, order, range, comp, 2, 6);
          netSwap(array, order, range, comp, 1, 4); netSwap(array, order, range, comp, 3, 6);
          netSwap(array, order, range, comp, 2, 4); netSwap(array, order, range, comp, 3, 5);
          netSwap(array, order, range, comp, 3, 4);

        } else if (range.length() == 7) {
          netSwap(array, order, range, comp, 1, 2); netSwap(array, order, range, comp, 3, 4); netSwap(array, order, range, comp, 5, 6);
          netSwap(array, order, range, comp, 0, 2); netSwap(array, order, range, comp, 3, 5); netSwap(array, order, range, comp, 4, 6);
          netSwap(array, order, range, comp, 0, 1); netSwap(array, order, range, comp, 4, 5); netSwap(array, order, range, comp, 2, 6);
          netSwap(array, order, range, comp, 0, 4); netSwap(array, order, range, comp, 1, 5);
          netSwap(array, order, range, comp, 0, 3); netSwap(array, order, range, comp, 2, 5);
          netSwap(array, order, range, comp, 1, 3); netSwap(array, order, range, comp, 2, 4);
          netSwap(array, order, range, comp, 2, 3);

        } else if (range.length() == 6) {
          netSwap(array, order, range, comp, 1, 2); netSwap(array, order, range, comp, 4, 5);
          netSwap(array, order, range, comp, 0, 2); netSwap(array, order, range, comp, 3, 5);
          netSwap(array, order, range, comp, 0, 1); netSwap(array, order, range, comp, 3, 4); netSwap(array, order, range, comp, 2, 5);
          netSwap(array, order, range, comp, 0, 3); netSwap(array, order, range, comp, 1, 4);
          netSwap(array, order, range, comp, 2, 4); netSwap(array, order, range, comp, 1, 3);
          netSwap(array, order, range, comp, 2, 3);

        } else if (range.length() == 5) {
          netSwap(array, order, range, comp, 0, 1); netSwap(array, order, range, comp, 3, 4);
          netSwap(array, order, range, comp, 2, 4);
          netSwap(array, order, range, comp, 2, 3); netSwap(array, order, range, comp, 1, 4);
          netSwap(array, order, range, comp, 0, 3);
          netSwap(array, order, range, comp, 0, 2); netSwap(array, order, range, comp, 1, 3);
          netSwap(array, order, range, comp, 1, 2);

        } else if (range.length() == 4) {
          netSwap(array, order, range, comp, 0, 1); netSwap(array, order, range, comp, 2, 3);
          netSwap(array, order, range, comp, 0, 2); netSwap(array, order, range, comp, 1, 3);
          netSwap(array, order, range, comp, 1, 2);
        }
      }
      if (size < 8) return;

      // we need to keep track of a lot of ranges during this sort!
      var buffer1 = new Range(), buffer2 = new Range(),
          blockA = new Range(), blockB = new Range(),
          lastA = new Range(), lastB = new Range(),
          firstA = new Range(),
          A = new Range(), B = new Range(),
          pull = [new Pull(), new Pull];

      // then merge sort the higher levels, which can be 8-15, 16-31, 32-63, 64-127, etc.
      //TODO: continue from line #555 - https://github.com/BonzaiThePenguin/WikiSort/blob/master/WikiSort.java#L555
    }
  };

  wikisort.sorter = WikiSorter;
}).call(this);
