/**
 * Created by Nir Leibovitch on 01/02/2016.
 * This is a JavaScript adaptation of https://github.com/BonzaiThePenguin/WikiSort
 */

(function() {
  'use strict';

  /* Establish the root object, `window` (`self`) in the browser, `global`
   * on the server, or `this` in some virtual machines. We use `self`
   * instead of `window` for `WebWorker` support.
   */
  var root = typeof self === 'object' && self.self === self && self ||
    typeof global === 'object' && global.global === global && global ||
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
  if(typeof exports != 'undefined' && !exports.nodeType) {
    if(typeof module != 'undefined' && !module.nodeType && module.exports) {
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
    this.denominator = Math.floor(this.powerOfTwo / minLevel);
    this.numeratorStep = this.size % this.denominator;
    this.decimalStep = Math.floor(this.size / this.denominator);
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
      this.numerator += this.numeratorStep;
      if(this.numerator >= this.denominator) {
        this.numerator -= this.denominator;
        ++this.decimal;
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
        ++this.decimalStep;
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
      mid = start + Math.floor((end - start) / 2);
      if(comp(array[mid], value) < 0)
        start = mid + 1;
      else
        end = mid;
    }
    if(start === range.end - 1 && comp(array[start], value) < 0)
      ++start;
    return start;
  };

  // find the index of the last value within the range that is equal to array[index], plus 1
  var binaryLast = function(array, value, range, comp) {
    var start = range.start, end = range.end - 1, mid;
    while(start < end) {
      mid = start + Math.floor((end - start) / 2);
      if(comp(value, array[mid]) >= 0)
        start = mid + 1;
      else
        end = mid;
    }
    if(start === range.end - 1 && comp(value, array[start]) >= 0)
      ++start;
    return start;
  };

  /* combine a linear search with a binary search to reduce the number of comparisons in situations
   * where have some idea as to how many unique values there are and where the next value might be
   */
  var findFirstForward = function(array, value, range, comp, unique) {
    if(range.length === 0) return range.start;
    var index, skip = Math.max(Math.floor(range.length / unique), 1);

    for(index = range.start + skip; comp(array[index - 1], value) < 0; index += skip)
      if(index >= range.end - skip)
        return binaryFirst(array, value, new Range(index, range.end), comp);

    return binaryFirst(array, value, new Range(index - skip, index), comp);
  };

  var findLastForward = function(array, value, range, comp, unique) {
    if(range.length === 0) return range.start;
    var index, skip = Math.max(Math.floor(range.length / unique), 1);

    for(index = range.start + skip; comp(value, array[index - 1]) >= 0; index += skip)
      if(index >= range.end - skip)
        return binaryLast(array, value, new Range(index, range.end), comp);

    return binaryLast(array, value, new Range(index - skip, index), comp);
  };

  var findFirstBackward = function(array, value, range, comp, unique) {
    if(range.length === 0) return range.start;
    var index, skip = Math.max(Math.floor(range.length / unique), 1);

    for(index = range.end - skip; index > range.start && comp(array[index - 1], value) >= 0; index -= skip)
      if(index < range.start + skip)
        return binaryFirst(array, value, new Range(range.start, index), comp);

    return binaryFirst(array, value, new Range(index, index + skip), comp);
  };

  var findLastBackward = function(array, value, range, comp, unique) {
    if(range.length === 0) return range.start;
    var index, skip = Math.max(Math.floor(range.length / unique), 1);

    for(index = range.end - skip; index > range.start && comp(value, array[index - 1]) < 0; index -= skip)
      if(index < range.start + skip)
        return binaryLast(array, value, new Range(range.start, index), comp);

    return binaryLast(array, value, new Range(index, index + skip), comp);
  };

  // n^2 sorting algorithm used to sort tiny chunks of the full array
  var insertionSort = function(array, range, comp) {
    var i, j, temp;
    for(i = range.start + 1; i < range.end; ++i) {
      temp = array[i];
      for(j = i; j > range.start && comp(temp, array[j - 1]) < 0; --j)
        array[j] = array[j - 1];
      array[j] = temp;
    }
  };

  // reverse a range of values within the array
  var reverse = function(array, range) {
    var index, swap;
    for(index = Math.floor(range.length / 2) - 1; index >= 0; --index) {
      swap = array[range.start + index];
      array[range.start + index] = array[range.end - index - 1];
      array[range.end - index - 1] = swap;
    }
  };

  // swap a series of values in the array
  var blockSwap = function(array, start1, start2, blockSize) {
    var index, swap;
    for(index = 0; index < blockSize; ++index) {
      swap = array[start1 + index];
      array[start1 + index] = array[start2 + index];
      array[start2 + index] = swap;
    }
  };

  /* rotate the values in an array ([0 1 2 3] becomes [1 2 3 0] if we rotate by 1)
   * this assumes that 0 <= amount <= range.length
   * the original author separated implementation - if the smaller of the two ranges fits
   * into the cache, it was copied there using System.arraycopy, but in JavaScript the
   * in-place implementation works better in most cases - http://jsperf.com/rotate-reverse-vs-copy-with-cache
   * so we ignore the useCache argument (although it's kept in place for future language improvements)
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
    for(var i = 0; i < amount; ++i) {
      target[targetStart + i] = source[sourceStart + i];
    }
  };

  // merge two ranges from one array and save the results into a different array
  var mergeInto = function(from, A, B, comp, into, atIndex) {
    var aIndex = A.start,
        bIndex = B.start,
        insertIndex = atIndex,
        aLast = A.end,
        bLast = B.end;

    while(true) {
      if(comp(from[bIndex], from[aIndex]) >= 0) {
        into[insertIndex] = from[aIndex];
        ++aIndex;
        ++insertIndex;
        if(aIndex === aLast) {
          // copy the remainder of B into the final array
          arraycopy(from, bIndex, into, insertIndex, bLast - bIndex);
          break;
        }
      } else {
        into[insertIndex] = from[bIndex];
        ++bIndex;
        ++insertIndex;
        if(bIndex === bLast) {
          // copy the remainder of A into the final array
          arraycopy(from, aIndex, into, insertIndex, aLast - aIndex);
          break;
        }
      }
    }
  };

  /* merge operation using an internal buffer
   * for future reference see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/copyWithin
   */
  var mergeInternal = function(array, A, B, comp, buffer) {
    /* whenever we find a value to add to the final array, swap it with the value that's already in that spot
     * when this algorithm is finished, 'buffer' will contain its original contents, but in a different order
     */
    var aCount = 0, bCount = 0, insert = 0, swap;

    if(B.length > 0 && A.length > 0) {
      while(true) {
        if(comp(array[B.start + bCount], array[buffer.start + aCount]) >= 0) {
          swap = array[A.start + insert];
          array[A.start + insert] = array[buffer.start + aCount];
          array[buffer.start + aCount] = swap;
          ++aCount;
          ++insert;
          if(aCount >= A.length)
            break;
        } else {
          swap = array[A.start + insert];
          array[A.start + insert] = array[B.start + bCount];
          array[B.start + bCount] = swap;
          ++bCount;
          ++insert;
          if(bCount >= B.length)
            break;
        }
      }
    }

    // swap the remainder of A into the final array
    blockSwap(array, buffer.start + aCount, A.start + insert, A.length - aCount);
  };

  // merge operation without a buffer
  var mergeInPlace = function(array, A, B, comp) {
    if(A.length === 0 || B.length === 0) return;
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
      amount = mid - A.end;
      rotate(array, -amount, new Range(A.start, mid), true);
      if(B.end === mid)
        break;

      // calculate the new A and B ranges
      B.start = mid;
      A.set(A.start + amount, B.start);
      A.start = binaryLast(array, array[A.start], A, comp);
      if(A.length === 0)
        break;
    }
  };

  var netSwap = function(array, order, range, comp, x, y) {
    var swap;
    var compare = comp(array[range.start + x], array[range.start + y]);
    if(compare > 0 || (order[x] > order[y] && compare === 0)) {
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
      var aIndex = 0,
          bIndex = B.start,
          insertIndex = A.start,
          aLast = A.length,
          bLast = B.end;

      if(B.length > 0 && A.length > 0) {
        while(true) {
          if(comp(array[bIndex], this._cache[aIndex]) >= 0) {
            array[insertIndex] = this._cache[aIndex];
            ++aIndex;
            ++insertIndex;
            if(aIndex === aLast)
              break;
          } else {
            array[insertIndex] = array[bIndex];
            ++bIndex;
            ++insertIndex;
            if(bIndex === bLast)
              break;
          }
        }
      }

      // copy the remainder of A into the final array
      arraycopy(this._cache, aIndex, array, insertIndex, aLast - aIndex);
    },
    // bottom-up merge sort combined with an in-place merge algorithm for O(1) memory use
    sort: function(array, comp) {
      comp = comp || defaultComparator;
      var size = array.length, swap;

      // if the array is of size 0, 1, 2, or 3, just sort them like so:
      if(size < 4) {
        if(size === 3) {
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
        } else if(size = 2) {
          // swap the items if they're out of order
          if(comp(array[1], array[0]) < 0) {
            swap = array[0];
            array[0] = array[1];
            array[1] = swap;
          }
        }
        return;
      }

      /* sort groups of 4-8 items at a time using an unstable sorting network,
       * but keep track of the original item orders to force it to be stable
       * http://pages.ripco.net/~jgamble/nw.html
       */
      //Note: the 'range' variable will be reused later
      var iterator = new Iterator(size, 4), order, range;
      while(!iterator.finished) {
        order = [0, 1, 2, 3, 4, 5, 6, 7];
        range = iterator.nextRange();

        if(range.length === 8) {
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

        } else if(range.length === 7) {
          netSwap(array, order, range, comp, 1, 2); netSwap(array, order, range, comp, 3, 4); netSwap(array, order, range, comp, 5, 6);
          netSwap(array, order, range, comp, 0, 2); netSwap(array, order, range, comp, 3, 5); netSwap(array, order, range, comp, 4, 6);
          netSwap(array, order, range, comp, 0, 1); netSwap(array, order, range, comp, 4, 5); netSwap(array, order, range, comp, 2, 6);
          netSwap(array, order, range, comp, 0, 4); netSwap(array, order, range, comp, 1, 5);
          netSwap(array, order, range, comp, 0, 3); netSwap(array, order, range, comp, 2, 5);
          netSwap(array, order, range, comp, 1, 3); netSwap(array, order, range, comp, 2, 4);
          netSwap(array, order, range, comp, 2, 3);

        } else if(range.length === 6) {
          netSwap(array, order, range, comp, 1, 2); netSwap(array, order, range, comp, 4, 5);
          netSwap(array, order, range, comp, 0, 2); netSwap(array, order, range, comp, 3, 5);
          netSwap(array, order, range, comp, 0, 1); netSwap(array, order, range, comp, 3, 4); netSwap(array, order, range, comp, 2, 5);
          netSwap(array, order, range, comp, 0, 3); netSwap(array, order, range, comp, 1, 4);
          netSwap(array, order, range, comp, 2, 4); netSwap(array, order, range, comp, 1, 3);
          netSwap(array, order, range, comp, 2, 3);

        } else if(range.length === 5) {
          netSwap(array, order, range, comp, 0, 1); netSwap(array, order, range, comp, 3, 4);
          netSwap(array, order, range, comp, 2, 4);
          netSwap(array, order, range, comp, 2, 3); netSwap(array, order, range, comp, 1, 4);
          netSwap(array, order, range, comp, 0, 3);
          netSwap(array, order, range, comp, 0, 2); netSwap(array, order, range, comp, 1, 3);
          netSwap(array, order, range, comp, 1, 2);

        } else if(range.length === 4) {
          netSwap(array, order, range, comp, 0, 1); netSwap(array, order, range, comp, 2, 3);
          netSwap(array, order, range, comp, 0, 2); netSwap(array, order, range, comp, 1, 3);
          netSwap(array, order, range, comp, 1, 2);
        }
      }
      if(size < 8) return;

      // we need to keep track of a lot of ranges during this sort!
      var buffer1 = new Range(), buffer2 = new Range(),
          blockA = new Range(), blockB = new Range(),
          lastA = new Range(), lastB = new Range(),
          firstA = new Range(),
          A = new Range(), B = new Range();

      var pull = [new Pull(), new Pull()];

      // then merge sort the higher levels, which can be 8-15, 16-31, 32-63, 64-127, etc.
      while(true) {
        /* if every A and B block will fit into the cache, use a special branch specifically for merging with the cache
         * (we use < rather than <= since the block size might be one more than iterator.length)
         */
        if(iterator.length < this.cacheSize) {
          //TODO: benchmark this claim in JavaScript
          /* if four subarrays fit into the cache, it's faster to merge both pairs of subarrays into the cache,
           * then merge the two merged subarrays from the cache back into the original array
           */
          if((iterator.length + 1) * 4 <= this.cacheSize && iterator.length * 4 <= size) {
            iterator.begin();
            while(!iterator.finished) {
              // merge A1 and B1 into the cache
              var A1 = iterator.nextRange(), B1 = iterator.nextRange(),
                  A2 = iterator.nextRange(), B2 = iterator.nextRange();

              if(comp(array[B1.end - 1], array[A1.start]) < 0) {
                // the two ranges are in reverse order, so copy them in reverse order into the cache
                arraycopy(array, A1.start, this._cache, B1.length, A1.length);
                arraycopy(array, B1.start, this._cache, 0, B1.length);
              } else if(comp(array[B1.start], array[A1.end - 1]) < 0) {
                // these two ranges weren't already in order, so merge them into the cache
                mergeInto(array, A1, B1, comp, this._cache, 0);
              } else {
                // if A1, B1, A2, and B2 are all in order, skip doing anything else
                if(comp(array[B2.start], array[A2.end - 1]) >= 0 && comp(array[A2.start], array[B1.end - 1]) >= 0)
                  continue;

                // copy A1 and B1 into the cache in the same order
                arraycopy(array, A1.start, this._cache, 0, A1.length);
                arraycopy(array, B1.start, this._cache, A1.length, B1.length);
              }
              A1.set(A1.start, B1.end);

              // merge A2 and B2 into the cache
              if(comp(array[B2.end - 1], array[A2.start]) < 0) {
                // the two ranges are in reverse order, so copy them in reverse order into the cache
                arraycopy(array, A2.start, this._cache, A1.length + B2.length, A2.length);
                arraycopy(array, B2.start, this._cache, A1.length, B2.length);
              } else if(comp(array[B2.start], array[A2.end - 1]) < 0) {
                // these two ranges weren't already in order, so merge them into the cache
                mergeInto(array, A2, B2, comp, this._cache, A1.length);
              } else {
                // copy A2 and B2 into the cache in the same order
                arraycopy(array, A2.start, this._cache, A1.length, A2.length);
                arraycopy(array, B2.start, this._cache, A1.length + A2.length, B2.length);
              }
              A2.set(A2.start, B2.end);

              // merge A1 and A2 from the cache into the array
              var A3 = new Range(0, A1.length),
                  B3 = new Range(A1.length, A1.length + A2.length);

              if(comp(this._cache[B3.end - 1], this._cache[A3.start]) < 0) {
                // the two ranges are in reverse order, so copy them in reverse order into the cache
                arraycopy(this._cache, A3.start, array, A1.start + A2.length, A3.length);
                arraycopy(this._cache, B3.start, array, A1.start, B3.length);
              } else if(comp(this._cache[B3.start], this._cache[A3.end - 1]) < 0) {
                // these two ranges weren't already in order, so merge them back into the array
                mergeInto(this._cache, A3, B3, comp, array, A1.start);
              } else {
                // copy A3 and B3 into the array in the same order
                arraycopy(this._cache, A3.start, array, A1.start, A3.length);
                arraycopy(this._cache, B3.start, array, A1.start + A1.length, B3.length);
              }
            }

            /* we merged two levels at the same time, so we're done with this level already
             * (iterator.nextLevel() is called again at the bottom of this outer merge loop)
             */
            iterator.nextLevel();

          } else {
            iterator.begin();
            while(!iterator.finished) {
              A = iterator.nextRange();
              B = iterator.nextRange();

              if(comp(array[B.end - 1], array[A.start]) < 0) {
                // the two ranges are in reverse order, so a simple rotation should fix it
                rotate(array, A.length, new Range(A.start, B.end), true);
              } else if(comp(array[B.start], array[A.end - 1]) < 0) {
                // these two ranges weren't already in order, so we'll need to merge them!
                arraycopy(array, A.start, this._cache, 0, A.length);
                this.mergeExternal(array, A, B, comp);
              }
            }
          }
        } else {
          /* this is where the in-place merge logic starts!
           * 1. pull out two internal buffers each containing √A unique values
           *    1a. adjust block_size and buffer_size if we couldn't find enough unique values
           * 2. loop over the A and B subarrays within this level of the merge sort
           *    3. break A and B into blocks of size 'blockSize'
           *    4. "tag" each of the A blocks with values from the first internal buffer
           *    5. roll the A blocks through the B blocks and drop/rotate them where they belong
           *    6. merge each A block with any B values that follow, using the cache or the second internal buffer
           * 7. sort the second internal buffer if it exists
           * 8. redistribute the two internal buffers back into the array
           */

          var blockSize = Math.floor(Math.sqrt(iterator.length)),
              bufferSize = Math.floor(iterator.length / blockSize) + 1;

          /* as an optimization, we really only need to pull out the internal buffers once for each level of merges
           * after that we can reuse the same buffers over and over, then redistribute it when we're finished with this level
           */
          var index, last, count, pullIndex = 0;
          buffer1.set(0, 0);
          buffer2.set(0, 0);

          pull[0].reset();
          pull[1].reset();

          // find two internal buffers of size 'bufferSize' each
          var find = bufferSize + bufferSize,
              findSeparately = false;

          if(blockSize <= this.cacheSize) {
            /* if every A block fits into the cache then we won't need the second internal buffer,
             * so we really only need to find 'bufferSize' unique values
             */
            find = bufferSize;
          } else if(find > iterator.length) {
            // we can't fit both buffers into the same A or B subarray, so find two buffers separately
            find = bufferSize;
            findSeparately = true;
          }

          /* we need to find either a single contiguous space containing 2√A unique values (which will be split up into two buffers of size √A each),
           * or we need to find one buffer of < 2√A unique values, and a second buffer of √A unique values,
           * OR if we couldn't find that many unique values, we need the largest possible buffer we can get
           *
           * in the case where it couldn't find a single buffer of at least √A unique values,
           * all of the Merge steps must be replaced by a different merge algorithm (MergeInPlace)
           */

          iterator.begin();
          while(!iterator.finished) {
            A = iterator.nextRange();
            B = iterator.nextRange();

            /* check A for the number of unique values we need to fill an internal buffer
             * these values will be pulled out to the start of A
             */
            for(last = A.start, count = 1; count < find; last = index, ++count) {
              index = findLastForward(array, array[last], new Range(last + 1, A.end), comp, find - count);
              if(index === A.end) break;
            }
            index = last;

            if(count >= bufferSize) {
              // keep track of the range within the array where we'll need to "pull out" these values to create the internal buffer
              pull[pullIndex].range.set(A.start, B.end);
              pull[pullIndex].count = count;
              pull[pullIndex].from = index;
              pull[pullIndex].to = A.start;
              pullIndex = 1;

              if(count === bufferSize + bufferSize) {
                /* we were able to find a single contiguous section containing 2√A unique values,
                 * so this section can be used to contain both of the internal buffers we'll need
                 */
                buffer1.set(A.start, A.start + bufferSize);
                buffer2.set(A.start + bufferSize, A.start + count);
                break;
              } else if(find === bufferSize + bufferSize) {
                /* we found a buffer that contains at least √A unique values, but did not contain the full 2√A unique values,
                 * so we still need to find a second separate buffer of at least √A unique values
                 */
                buffer1.set(A.start, A.start + count);
                find = bufferSize;
              } else if(blockSize <= this.cacheSize) {
                // we found the first and only internal buffer that we need, so we're done!
                buffer1.set(A.start, A.start + count);
                break;
              } else if(findSeparately) {
                // found one buffer, but now find the other one
                buffer1 = new Range(A.start, A.start + count);
                findSeparately = false;
              } else {
                // we found a second buffer in an 'A' subarray containing √A unique values, so we're done!
                buffer2.set(A.start, A.start + count);
                break;
              }
            } else if(pullIndex === 0 && count > buffer1.length) {
              // keep track of the largest buffer we were able to find
              buffer1.set(A.start, A.start + count);

              pull[pullIndex].range.set(A.start, B.end);
              pull[pullIndex].count = count;
              pull[pullIndex].from = index;
              pull[pullIndex].to = A.start;
            }

            /* check B for the number of unique values we need to fill an internal buffer
             * these values will be pulled out to the end of B
             */
            for(last = B.end - 1, count = 1; count < find; last = index - 1, ++count) {
              index = findFirstBackward(array, array[last], new Range(B.start, last), comp, find - count);
              if(index === B.start) break;
            }
            index = last;

            if(count >= bufferSize) {
              // keep track of the range within the array where we'll need to "pull out" these values to create the internal buffer
              pull[pullIndex].range.set(A.start, B.end);
              pull[pullIndex].count = count;
              pull[pullIndex].from = index;
              pull[pullIndex].to = B.end;
              pullIndex = 1;

              if(count === bufferSize + bufferSize) {
                /* we found a buffer that contains at least √A unique values, but did not contain the full 2√A unique values,
                 * so we still need to find a second separate buffer of at least √A unique values
                 */
                buffer1.set(B.end - count, B.end);
                find = bufferSize;
              } else if(blockSize <= this.cacheSize) {
                // we found the first and only internal buffer that we need, so we're done!
                buffer1.set(B.end - count, B.end);
                break;
              } else if(findSeparately) {
                // found one buffer, but now find the other one
                buffer1 = new Range(B.end - count, B.end);
                findSeparately = false;
              } else {
                // buffer2 will be pulled out from a 'B' subarray, so if the first buffer was pulled out from the corresponding 'A' subarray,
                // we need to adjust the end point for that A subarray so it knows to stop redistributing its values before reaching buffer2
                if(pull[0].range.start === A.start)
                  pull[0].range.end -= pull[1].count;

                // we found a second buffer in a 'B' subarray containing √A unique values, so we're done!
                buffer2.set(B.end - count, B.end);
                break;
              }
            } else if(pullIndex === 0 && count > buffer1.length) {
              // keep track of the largest buffer we were able to find
              buffer1.set(B.end - count, B.end);

              pull[pullIndex].range.set(A.start, B.end);
              pull[pullIndex].count = count;
              pull[pullIndex].from = index;
              pull[pullIndex].to = B.end;
            }
          }

          // pull out the two ranges so we can use them as internal buffers
          //Note: the 'range' variable was declared earlier and reused here
          var length;
          for(pullIndex = 0; pullIndex < 2; ++pullIndex) {
            length = pull[pullIndex].count;

            if(pull[pullIndex].to < pull[pullIndex].from) {
              // we're pulling the values out to the left, which means the start of an A subarray
              index = pull[pullIndex].from;
              for(count = 1; count < length; ++count) {
                index = findFirstBackward(array, array[index - 1], new Range(pull[pullIndex].to, pull[pullIndex].from - (count - 1)), comp, length - count);
                range = new Range(index + 1, pull[pullIndex].from + 1);
                rotate(array, range.length - count, range, true);
                pull[pullIndex].from = index + count;
              }
            } else if(pull[pullIndex].to > pull[pullIndex].from) {
              // we're pulling values out to the right, which means the end of a B subarray
              index = pull[pullIndex].from + 1;
              for(count = 1; count < length; ++count) {
                index = findLastForward(array, array[index], new Range(index, pull[pullIndex].to), comp, length - count);
                range = new Range(pull[pullIndex].from, index - 1);
                rotate(array, count, range, true);
                pull[pullIndex].from = index - 1 - count;
              }
            }
          }

          // adjust block_size and buffer_size based on the values we were able to pull out
          bufferSize = buffer1.length;
          blockSize = Math.floor(iterator.length / bufferSize) + 1;

          /* the first buffer NEEDS to be large enough to tag each of the evenly sized A blocks,
           * so this was originally here to test the math for adjusting block_size above
           */
          //TODO: uncomment this line after testing the above
          if(Math.floor((iterator.length + 1) / blockSize) > bufferSize) throw new Error();

          // now that the two internal buffers have been created, it's time to merge each A+B combination at this level of the merge sort!
          iterator.begin();
          while(!iterator.finished) {
            A = iterator.nextRange();
            B = iterator.nextRange();

            // remove any parts of A or B that are being used by the internal buffers
            var start = A.start;
            if(start === pull[0].range.start) {
              if(pull[0].from > pull[0].to) {
                A.start += pull[0].count;

                /* if the internal buffer takes up the entire A or B subarray, then there's nothing to merge
                 * this only happens for very small subarrays, like √4 = 2, 2 * (2 internal buffers) = 4,
                 * which also only happens when cache_size is small or 0 since it'd otherwise use MergeExternal
                 */
                if(A.length === 0)
                  continue;
              } else if(pull[0].from < pull[0].to) {
                B.end -= pull[0].count;
                if(B.length === 0)
                  continue;
              }
            }
            if(start === pull[1].range.start) {
              if(pull[1].from > pull[1].to) {
                A.start += pull[1].count;
                if(A.length === 0)
                  continue;
              } else if(pull[1].from < pull[1].to) {
                B.end -= pull[1].count;
                if(B.length === 0)
                  continue;
              }
            }

            if(comp(array[B.end - 1], array[A.start]) < 0) {
              // the two ranges are in reverse order, so a simple rotation should fix it
              rotate(array, A.length, new Range(A.start, B.end), true);
            } else if(comp(array[A.end], array[A.end - 1]) < 0) {
              // these two ranges weren't already in order, so we'll need to merge them!

              // break the remainder of A into blocks. firstA is the uneven-sized first A block
              blockA.set(A.start, A.end);
              firstA.set(A.start, A.start + blockA.length % blockSize);

              // swap the first value of each A block with the value in buffer1
              var indexA = buffer1.start;
              for(index = firstA.end; index < blockA.end; index += blockSize) {
                swap = array[indexA];
                array[indexA] = array[index];
                array[index] = swap;
                ++indexA;
              }

              /* start rolling the A blocks through the B blocks!
               * whenever we leave an A block behind, we'll need to merge the previous A block with any B blocks that follow it, so track that information as well
               */
              lastA.set(firstA.start, firstA.end);
              lastB.set(0, 0);
              blockB.set(B.start, B.start + Math.min(blockSize, B.length));
              blockA.start += firstA.length;
              indexA = buffer1.start;

              /* if the first unevenly sized A block fits into the cache, copy it there for when we go to Merge it
               * otherwise, if the second buffer is available, block swap the contents into that
               */
              if(lastA.length <= this.cacheSize && this._cache != null)
                arraycopy(array, lastA.start, this._cache, 0, lastA.length);
              else if(buffer2.length > 0)
                blockSwap(array, lastA.start, buffer2.start, lastA.length);

              if(blockA.length > 0) {
                while(true) {
                  /*
                   * if there's a previous B block and the first value of the minimum A block is <= the last value of the previous B block,
                   * then drop that minimum A block behind. or if there are no B blocks left then keep dropping the remaining A blocks.
                   */
                  if((lastB.length > 0 && comp(array[lastB.end - 1], array[indexA]) >= 0) || blockB.length === 0) {
                    // figure out where to split the previous B block, and rotate it at the split
                    var bSplit = binaryFirst(array, array[indexA], lastB, comp),
                        bRemaining = lastB.end - bSplit;

                    // swap the minimum A block to the beginning of the rolling A blocks
                    var minA = blockA.start;
                    for(var findA = minA + blockSize; findA < blockA.end; findA += blockSize)
                      if(comp(array[findA], array[minA]) < 0)
                        minA = findA;
                    blockSwap(array, blockA.start, minA, blockSize);

                    // swap the first item of the previous A block back with its original value, which is stored in buffer1
                    swap = array[blockA.start];
                    array[blockA.start] = array[indexA];
                    array[indexA] = swap;
                    ++indexA;

                    /* locally merge the previous A block with the B values that follow it
                     * if lastA fits into the external cache we'll use that (with MergeExternal),
                     * or if the second internal buffer exists we'll use that (with MergeInternal),
                     * or failing that we'll use a strictly in-place merge algorithm (MergeInPlace)
                     */
                    if(lastA.length <= this.cacheSize)
                      this.mergeExternal(array, lastA, new Range(lastA.end, bSplit), comp);
                    else if(buffer2.length > 0)
                      mergeInternal(array, lastA, new Range(lastA.end, bSplit), comp, buffer2);
                    else
                      mergeInPlace(array, lastA, new Range(lastA.end, bSplit), comp);

                    if(buffer2.length > 0 || blockSize <= this.cacheSize) {
                      // copy the previous A block into the cache or buffer2, since that's where we need it to be when we go to merge it anyway
                      if(blockSize <= this.cacheSize)
                        arraycopy(array, blockA.start, this._cache, 0, blockSize);
                      else
                        blockSwap(array, blockA.start, buffer2.start, blockSize);

                      //TODO: benchmark this claim in JavaScript
                      /* this is equivalent to rotating, but faster
                       * the area normally taken up by the A block is either the contents of buffer2, or data we don't need anymore since we memcopied it
                       * either way, we don't need to retain the order of those items, so instead of rotating we can just block swap B to where it belongs
                       */
                      blockSwap(array, bSplit, blockA.start + blockSize - bRemaining, bRemaining);
                    } else {
                      // we are unable to use the 'buffer2' trick to speed up the rotation operation since buffer2 doesn't exist, so perform a normal rotation
                      rotate(array, blockA.start - bSplit, new Range(bSplit, blockA.start + blockSize), true);
                    }

                    // update the range for the remaining A blocks, and the range remaining from the B block after it was split
                    lastA.set(blockA.start - bRemaining, blockA.start - bRemaining + blockSize);
                    lastB.set(lastA.end, lastA.end + bRemaining);

                    // if there are no more A blocks remaining, this step is finished!
                    blockA.start += blockSize;
                    if(blockA.length === 0)
                      break;

                  } else if(blockB.length < blockSize) {
                    /* move the last B block, which is unevenly sized, to before the remaining A blocks, by using a rotation
                     * the cache is disabled here since it might contain the contents of the previous A block
                     */
                    rotate(array, -blockB.length, new Range(blockA.start, blockB.end), false);

                    lastB.set(blockA.start, blockA.start + blockB.length);
                    blockA.start += blockB.length;
                    blockA.end += blockB.length;
                    blockB.end = blockB.start;
                  } else {
                    // roll the leftmost A block to the end by swapping it with the next B block
                    blockSwap(array, blockA.start, blockB.start, blockSize);
                    lastB.set(blockA.start, blockA.start + blockSize);

                    blockA.start += blockSize;
                    blockA.end += blockSize;
                    blockB.start += blockSize;
                    blockB.end += blockSize;

                    if(blockB.end > B.end)
                      blockB.end = B.end;
                  }
                }
              }

              // merge the last A block with the remaining B values
              if(lastA.length <= this.cacheSize)
                this.mergeExternal(array, lastA, new Range(lastA.end, B.end), comp);
              else if(buffer2.length > 0)
                mergeInternal(array, lastA, new Range(lastA.end, B.end), comp, buffer2);
              else
                mergeInPlace(array, lastA, new Range(lastA.end, B.end), comp);
            }
          }

          /* when we're finished with this merge step we should have the one or two internal buffers left over, where the second buffer is all jumbled up
           * insertion sort the second buffer, then redistribute the buffers back into the array using the opposite process used for creating the buffer
           *
           * while an unstable sort like quick sort could be applied here, in benchmarks it was consistently slightly slower than a simple insertion sort,
           * even for tens of millions of items. this may be because insertion sort is quite fast when the data is already somewhat sorted, like it is here
           */
          insertionSort(array, buffer2, comp);

          var unique, buffer, amount;
          for(pullIndex = 0; pullIndex < 2; ++pullIndex) {
            unique = pull[pullIndex].count * 2;
            if(pull[pullIndex].from > pull[pullIndex].to) {
              // the values were pulled out to the left, so redistribute them back to the right
              buffer = new Range(pull[pullIndex].range.start, pull[pullIndex].range.start + pull[pullIndex].count);
              while(buffer.length > 0) {
                index = findFirstForward(array, array[buffer.start], new Range(buffer.end, pull[pullIndex].range.end), comp, unique);
                amount = index - buffer.end;
                rotate(array, buffer.length, new Range(buffer.start, index), true);
                buffer.start += amount + 1;
                buffer.end += amount;
                unique -= 2;
              }
            } else if(pull[pullIndex].from < pull[pullIndex].to) {
              // the values were pulled out to the right, so redistribute them back to the left
              buffer = new Range(pull[pullIndex].range.end - pull[pullIndex].count, pull[pullIndex].range.end);
              while (buffer.length > 0) {
                index = findLastBackward(array, array[buffer.end - 1], new Range(pull[pullIndex].range.start, buffer.start), comp, unique);
                amount = buffer.start - index;
                rotate(array, amount, new Range(index, buffer.end), true);
                buffer.start -= amount;
                buffer.end -= amount + 1;
                unique -= 2;
              }
            }
          }
        }

        // double the size of each A and B subarray that will be merged in the next level
        if(!iterator.nextLevel()) break;
      }
    }
  };

  wikisort.sorter = WikiSorter;
}).call(this);
