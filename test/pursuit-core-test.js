/*jslint maxlen:140*/
/* global require */
'use strict';

var buster = require('buster'),
    engine = require('../lib/pursuit-core'),
    // mocks
    mockDictionary2 = require('./mocks/mockDictionary2')
;

var assert = buster.assert;
var refute = buster.refute;

var mockDictionary = {
    'equals': function (value) {
        return this.getScope() + ' === ' + value;
    }
};

buster.testCase('Pursuit Core', {
    'should return a function': function () {
        assert.isFunction(engine({ dictionary: {}}));
    },

    'should return a function that compile a query language into a JavaScript function': function () {
        assert.isFunction(engine({ dictionary: {}})({}));
    },

    'should throw an exception if no dictionary object is given function': function () {
        assert.exception(function() {
            engine({});
        });
    },

    'should default to optimization if no optimization flag is set': function () {
        var config = {dictionary: {}};
        engine(config);
        assert.isTrue(config.optimize);
    },

    'should be able to disable optimization': function () {
        var config = {dictionary: {}, optimize: false};

        engine(config);
        assert.isFalse(config.optimize);
    },

    'should be able to return source as a string': function () {
        var query = engine({dictionary: {}}, 'string')({});

        assert.isString(query);
        assert.equals(query, 'function anonymous(entry) { return true }');
    },

    'should be able to return source as a function': function () {
        var pursuit = engine({dictionary: {}}, 'function');

        assert.isFunction(engine({dictionary: {}})({}));
    },

    'should be able to use a dictionary': function () {
        refute.exception(function () {
            var dictionary = {
                '$eq': function (value) {
                    return this.getScope() + ' === ' + value;
                },
                '$lt': function (value) {
                    return this.getScope() + ' > ' + value;
                }
            };

            var pursuit = engine({ dictionary: dictionary });
            var match = pursuit({
                foo: { '$eq': 'bar' },
                bar: { '$lt': 5 }
            });

            var obj = [
                {foo: 'bar', bar: 2},
                {foo: 'bar', bar: 6},
                {foo: 'baz', bar: 2}
            ];

            assert.equals(obj.filter(match).length, 1);
        });
    }
});

buster.testCase('Pursuit Core Output', {
    'should not throw an error when checking on a property and the input is undefined': function () {
        var pursuit = engine({dictionary: mockDictionary});
        refute.exception(function() {
            pursuit({equals: 'bar'})(undefined);
        });
    },

    'should be able to check values at root level': function () {
        var pursuit = engine({dictionary: mockDictionary});
        var query = pursuit({ equals: 'foo' });

        assert.isTrue(query('foo'));
        assert.isFalse(query('bar'));
    },

    'should not throw an error when checking on a nested property and the input is undefined': function () {
        var pursuit = engine({dictionary: mockDictionary});
        refute.exception(function() {
            pursuit({foo: {equals: 'bar'}})(undefined);
            pursuit({foo: { bar: {equals: 'bar'}}})(undefined);
            pursuit({foo: { bar: { baz: {equals: 'bar'}}}})({ foo: { bar: undefined }});
        });
    },

    'should not throw an error when checking on a property and the input is null': function () {
        var pursuit = engine({dictionary: mockDictionary});
        refute.exception(function() {
            pursuit({equals: 'bar'})(null);
        });
    },

    'should not throw an error when checking on a nested property and the input is null': function () {
        var pursuit = engine({dictionary: mockDictionary});

        refute.exception(function() {
            pursuit({foo: {equals: 'bar'}})(null);
            pursuit({foo: { bar: {equals: 'bar'}}})({ foo: null });
            pursuit({foo: { bar: { baz: {equals: 'bar'}}}})({ foo: { bar: null }});
        });
    },

    'should throw an error if a key is not in the dictionary': function () {
        var pursuit = engine({dictionary: mockDictionary});
        assert.exception(function() {
            pursuit({ foo: { bar: 'test' }});
        });
    }
});

buster.testCase('Pursuit Core Output nesting', {
    'setUp': function () {
        this.pursuit = engine({dictionary: mockDictionary});
    },

    'should be able check on values nested two levels deep': function () {
        var pursuit = this.pursuit;
        refute.exception(function () {
            var query = pursuit({
                foo: { bar: { equals: 'baz' }}
            });

            assert.isTrue(query({ foo: { bar: 'baz' }}));
            refute.isTrue(query({ foo: { bar: 'bar' }}));
        });
    },

    'should be able check on values nested three (or more) levels deep': function () {
        var pursuit = this.pursuit;
        refute.exception(function () {
            var query = pursuit({
                foo: { bar: { baz: { equals: 'toto' }}}
            });

            assert.isTrue(query({ foo: { bar: { baz: 'toto' }}}));
            refute.isTrue(query({ foo: { bar: { baz: 'tata' }}}));
        });
    }
});

buster.testCase('Pursuit Core Generated OR-blocks', {
    'setUp': function () {
        this.pursuit = engine({dictionary: mockDictionary});
    },

    'should be able to do OR blocks on keys': function () {
        var query = this.pursuit({
            foo: [
                { equals: 'toto' },
                { equals: 'titi' }
            ]
        });

        assert.isTrue(query({foo: 'toto'}));
        assert.isTrue(query({foo: 'titi'}));
        refute.isTrue(query({foo: 'tata'}));
    },

    'should keep its local scope': function () {
        var query = this.pursuit([
            { foo: { equals: 'bar' }},
            { foo: { equals: 'baz' }}
        ]);

        var test = [{foo: 'bar'}, {foo: 'baz'}, {foo: 'bar'}];
        assert.equals(test.filter(query).length, 3);
    },

    'should keep the scope within a sub-scope': function () {
        var query = this.pursuit({
            foo: {
                bar: [
                    { baz: { equals: 'toto' }},
                    { baz: { equals: 'titi' }}
                ]
            }
        });

        assert.isTrue(query({foo: { bar: { baz: 'toto' }}}));
        assert.isTrue(query({foo: { bar: { baz: 'titi' }}}));
        refute.isTrue(query({foo: { bar: { baz: 'tata' }}}));
    },

    'should keep its scope after visiting a nested property': function () {
        var query = this.pursuit({
            foo: {
                bar: [{equals: 'titi'}, {equals: 'tata'}],
                baz: {equals: 'toto'}
            }
        });

        var test = [
            {foo: {bar: 'titi', baz: 'toto'}},
            {foo: {bar: 'tata', baz: 'toto'}},
            {foo: {bar: 'titi'}}
        ];

        assert.equals(test.filter(query).length, 2);
    },

    'should keep the scope when inverting the result within a sub-scope': function () {
        var query = this.pursuit({
            foo: { bar: { '!not': [
                {baz: {equals: 'toto'}},
                {baz: {equals: 'titi'}}
            ]}}
        });

        assert.isTrue(query({foo: { bar: { baz: 'tata' }}}));
        refute.isTrue(query({foo: { bar: { baz: 'toto' }}}));
        refute.isTrue(query({foo: { bar: { baz: 'titi' }}}));
    }
});

buster.testCase('Pursuit Core Generated Output: negation', {
    setUp: function () {
        this.pursuit = engine({dictionary: mockDictionary});
    },

    'should work in root level': function () {
        var query = this.pursuit({
            '!not': { foo: { equals: 'tata' }}
        });

        refute.isTrue(query({ foo: 'tata' }));
        assert.isTrue(query({ foo: 'titi' }));
        assert.isTrue(query({ foo: 'toto' }));
    },

    'should work in root level with OR-statements': function () {
        var query = this.pursuit({
            '!not': [
                { foo: { equals: 'toto' }},
                { foo: { equals: 'tata' }}
            ]
        });

        assert.isTrue(query({ foo: 'titi' }));
        refute.isTrue(query({ foo: 'toto' }));
        refute.isTrue(query({ foo: 'tata' }));
    },

    'should work with double negation': function () {
        var query = this.pursuit({
            '!not': { '!not': { foo: { equals: 'tata' }}}
        });

        assert.isTrue(query({ foo: 'tata' }));
        refute.isTrue(query({ foo: 'titi' }));
        refute.isTrue(query({ foo: 'toto' }));
    }
});

buster.testCase('Pursuit Core Generated Output: optimization', {
    // We might need to rephrase the name of this test...
    'should handle empty checks along with non-empty': function () {
        refute.exception(function() {
            var pursuit = engine({dictionary: mockDictionary2});
            pursuit({
                foo: {
                    bar: [
                        {beginsWith: 'tata' },
                        {isSet: true },
                        {endsWith: 'titi' },
                        {equals: 'toto' }
                    ]
                }
            });
        });
    }
});

buster.testCase('Pursuit Core Generated Output: run time scope', {
    'should be able to access the given scope with `this`': function () {
        var scope = { foo: 'bar' };

        var pursuit = engine({
            dictionary: {
                _: function () { return 'this.foo'; }
            }
        });

        var matcher = pursuit.call(scope, { _: ''});
        
        assert.equals(matcher({}), 'bar');
    },

    'should be able to manipulate the given scope': function () {
        // this might have little to none real-life usage
        var scope = { foo: 0 };

        var pursuit = engine({
            dictionary: {
                _: function (value) {
                    return this.getScope()+' === (this.foo+=1);';
                }
            }
        });

        var query = pursuit.call(scope, { _: ''});
        var test = [1, 1, 3, 4, 5, 7, 6, 8];

        assert.equals(test.filter(query), [1, 3, 4, 5, 8]);
    },

    '// should be able to implement an instanceof function': function () {
        var MyObj = function () {};
        var scope = { MyObj: MyObj };
        
        var pursuit = engine.call({foo: 'baz'}, {
            dictionary: {
                instanceOf: function (value) {
                    return this.getScope() + ' instanceof this.' + JSON.parse(value);
                }
            }
        });

        var matcher = pursuit.call(scope, { instanceOf: 'MyObj' });
        console.log(matcher((new MyObj())));
    }
});
