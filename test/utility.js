/**
 * Created by Nir Leibovitch on 21/02/2016.
 */

(function() {
  var wikisort = typeof require === 'function' ? require('..') : window.wikisort;

  QUnit.module('Utility', {});

  if (typeof this === 'object') {
    QUnit.test('noConflict', function(assert) {
      var ncWikisort = wikisort.noConflict();
      if (typeof require !== 'function') {
        assert.equal(this.wikisort, void 0, 'global wikisort is removed');
        this.wikisort = ncWikisort;
      } else if (typeof global !== 'undefined') {
        delete global.wikisort;
      }
    });
  }
}());
