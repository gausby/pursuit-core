/*jslint maxlen:140*/
/* global require */
'use strict';

var buster = require('buster'),
    pursuitCore = require('../lib/pursuit-core')
;

var assert = buster.assert;
var refute = buster.refute;

buster.testCase('Claims made in the README.md', {
    'example in the usage section': function () {
        var matcher = pursuitCore({ dictionary: {
            equals: function (value) {
                return this.getScope() + ' === ' + value;
            },
            greaterThan: function (value) {
                return this.getScope() + ' > ' + value;
            },
            lessThan: function (value) {
                return this.getScope() + ' < ' + value;
            }
        }});
        var test = matcher({
            name: {
                equals: 'foo'
            },
            age: {
                greaterThan: 21,
                lessThan: 80
            }
        });

        assert.isTrue(test({ name: 'foo', age: 38 }));
        refute.isTrue(test({ name: 'foo', age: 18 }));
    },

    'negation example': function () {
        var matcher = pursuitCore({
            dictionary: {
                equals: function (value) {
                    return this.getScope() + ' === ' + value;
                }
            },
            negation: '$not'
        });

        var test = matcher({ $not: { equals: 'foo' }});
        assert.isTrue(test('bar'));
        refute.isTrue(test('foo'));
    },

    'Calling Other Dictionary Functions From Within a Dictionary Function': function () {
        var myMatchLang = pursuitCore({
            dictionary: {
                is: function (value) {
                    return 'typeof ' + this.getScope() + '===' + value;
                },
                stringContains: function (value) {
                    return [
                        this.call('is', 'string'),
                        this.getScope()+'.indexOf('+value+') !== -1'
                    ].join('&&');
                }
            }
        });
        var matcher = myMatchLang({stringContains: 'foo'});
        assert.equals(['foobar', 'foobaz', ['foo'], 'baz'].filter(matcher), ['foobar', 'foobaz']);
    },

    'this.getScope()': function () {
        var scope = pursuitCore({
            dictionary: {
                show: function (value) {
                    return this.getScope();
                }
            }
        }, 'string');
        assert.equals(
            scope({show: ''}),
            'function anonymous(entry) { return entry }'
        );
        assert.equals(
            scope({one: {show: ''}}),
            'function anonymous(entry) { return entry&&entry["one"] }'
        );
        assert.equals(
            scope({one: {two: {show: ''}}}),
            'function anonymous(entry) { return entry&&entry["one"]&&typeof entry["one"] === "object"&&entry["one"]["two"] }'
        );
    }
});
