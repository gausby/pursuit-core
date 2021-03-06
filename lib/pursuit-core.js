/* global module */
'use strict';

var isArray = require('util').isArray;

function engine (config, returnType) {
    if (typeof config !== 'object') {
        throw new Error('Pursuit engine should receive a configuration');
    }

    if (typeof config.dictionary !== 'object') {
        throw new Error('Pursuit engine should receive a dictionary object');
    }

    // if engine is given a scope (ie. using .call()) this will be set
    // to `scope`
    config.vars = this;

    // The name of the variable the returned source code will store the
    // value that is being checked against. This can be customized, but
    // should make no difference.
    config.entry = config.entry || 'entry';
    
    // Whether or not to perform optimization on the resulting source
    // code. Turn this off if the returned source code has false
    // positives and you suspect the optimization is the cause.
    config.optimize = typeof config.optimize !== 'boolean' ? true : config.optimize;

    // Set a negation key if your custom dictionary should negate on
    // something else than `!not`.
    config.negation = config.negation || '!not';

    // A helper function that generates the current scope to check
    // against in the dictionary functions.
    config.getScope = function (key) {
        key = key || config.key;
        if (config.scope) {
            return config.scope + (key ? '['+key+']' : '');
        }
        else {
            return config.entry;
        }
    };

    // A helper function that makes it possible to call other dictionary
    // functions within a dictionary function. Beware of recursion.
    config.call = function (key, value) {
        var obj = {};
        obj[key] = value;
        return dictionaryLookUp.call(config, obj, key, this.key);
    };

    return {
        'string': function () {
            return function (schema) {
                var source = 'return ' + (compileQuery.call(config, schema) || true);

                return ['function anonymous(entry) { ', source, ' }'].join('');
            };
        },
        'function': function () {
            return function (schema) {
                var source = 'return ' + (compileQuery.call(config, schema) || true);
                /* jshint evil: true */
                return new Function(config.entry, source).bind(this || {});
            };
        }
    }[returnType || 'function']();
}

module.exports = engine;


/**
 * Pass properties to dictionary object for source code generation.
 * If something is out of order an error will be thrown.
 *
 * @method dictionaryLookUp
 * @for Pursuit
 * @param {object} property
 * @param {string} key
 * @param {string} name
 * @return {string} output of dictionary function
 */
function dictionaryLookUp (property, key, name) {
    var value, source;
    property = property[key];

    if (property instanceof RegExp || typeof property === 'function') {
        value = property;
    }
    else {
        value = JSON.stringify(property);
    }

    if (key in this.dictionary) {
        // expose key to matcher function
        this.key = name;
        source = this.dictionary[key].call(this, value);

        if (typeof source === 'string') {
            return source;
        }
        else if (source instanceof Error) {
            throw source;
        }
        else {
            throw new Error(
                'A dictionary function should return a string.'
            );
        }
    }
    else {
        // key not found in dictionary
        throw new Error([
            '\''+key+'\'','is not a valid keyword, use one of:',
            Object.keys(this.dictionary).join(', ')
        ].join(' '));
    }
}


/** */
function handleProperty(query, scope) {
    return function (name) {
        var result = compileProperty.call(this, name, query[name], scope);
        return result;
    };
}


/** */
function handleSubQuery(scope) {
    return function (query) {
        return compileQuery.call(this, query, scope);
    };
}


/**
 * @method compileQuery
 * @param {Object|Array} query
 * @param {String} scope
 * @for Pursuit
 */
function compileQuery (query, scope) {
    var result;

    // Arrays are treated as OR
    if (isArray(query)) {
        result = query
            .map(handleSubQuery(scope), this)
            .filter(Boolean)
        ;

        result = (this.optimize ? optimize(result, 'or') : result).join('||');
    }
    // Objects are treated as AND
    else if (typeof query === 'object') {
        result = Object.keys(query)
            .map(handleProperty(query, scope), this)
            .filter(Boolean)
        ;

        result = (this.optimize ? optimize(result, 'and') : result).join('&&');
    }

    return result;
}


/**
 * @method compileProperty
 * @param {String|Undefined} name
 * @param {Object} property
 * @param {Undefined|String} [scope=entry]
 * @for Pursuit
 */
function compileProperty (name, property, scope) {
    var fns,
        safeName = JSON.stringify(name),
        source // variable to store source in
    ;

    // set scope, default is `entry`
    scope = scope || this.entry;
    // expose the scope to the directory functions
    this.scope = scope;

    // root level negation
    if (name === this.negation) {
        return '!('+ compileQuery.call(this, property, scope) +')';
    }

    else if (isArray(property)) {
        var propertyArray = function(property) {
            return compileProperty.call(this, name, property, scope);
        };

        source = property.map(propertyArray, this);
        source = this.optimize ? optimize(source, 'or') : source;

        return source.length > 1 ? '('+source.join('||')+')' : source.join('||');
    }

    else if (typeof property === 'object') {
        fns = Object.keys(property).map(function(key) {
            var source;

            if (key === this.negation) {
                source = compileProperty.call(this, name, property[key], scope);

                return source ? '!('+source+')' : undefined;
            }
            // nested properties
            else if (typeof property[key] === 'object' && Object.keys(property[key]).length > 0) {
                var subScope = name ? scope+'['+safeName+']' : scope;

                // compile the nested property with the given scope
                source = compileProperty.call(this, key, property[key], subScope);

                if (source) {
                    // make sure the input object has a nested object
                    return [scope, subScope, 'typeof '+subScope+' === "object"', source].join('&&');
                }
                else {
                    return undefined;
                }
            }
            else {
                return [
                    scope,
                    dictionaryLookUp.call(this, property, key, safeName)
                ].join('&&');
            }
        }, this).filter(Boolean);

        source = this.optimize ? optimize(fns, 'and') : fns;

        return (fns.length > 0) ? source.join('&&') : undefined;
    }

    else {
        var obj = {};
        obj[name] = property;
        return dictionaryLookUp.call(this, obj, name);
    }

    return undefined;
}


/**
 * Attempt to optimize the code blocks by grouping checks together, so
 * a check that has already been performed, and does not need to be
 * performed again, will not be performed.
 *
 * It works by splitting the source code strings by `&&` and checking
 * if the first check is the same, and group them together if they are.
 * Observe the following example.
 *
 *     (('foo' in entry) && entry['foo'].indexOf('bar'))
 *     && (('foo' in entry) && entry['foo'].indexOf('baz'))
 *
 * Would become:
 *
 *     ('foo' in entry) && (
 *         entry['foo'].indexOf('bar') && entry['foo'].indexOf('baz')
 *     )
 *
 * @todo This could lead to a possible bug if the key contain '&&'
 *
 * @method optimize
 * @param {object} source The source object to optimize
 * @param {string} [type=or] What method the resulting optimized code
 *     should be stringed together with. Use `and` or `or`.
 * @return {object} optimized code
 */
function optimize (source, type) {
    var tokens = {},
        oneTrickPonies = {}
    ;

    type = { 'or': '||', 'and': '&&' }[type] || '||';

    source
        .filter(Boolean)
        .map(function(token) {
            // split the tokens
            return token.split('&&');
        })
        .forEach(function(token) {
            // filter out the duplicate checks within the tokens
            token = token.reduce(function (a,b) {
                if (a.indexOf(b) === -1) {
                    a.push(b);
                }
                return a;
            }, []);

            if (token[0] && token[1]) {
                // the token had an AND-clause, find the other checks
                // with the same AND-clause and join them together in
                // the same array.
                if (!isArray(tokens[token[0]])) {
                    tokens[token[0]] = [];
                }

                tokens[token[0]].push(token.slice(1).filter(Boolean).join('&&'));
            }
            else {
                // check did not have an and clause. There is no one to
                // join it together with. Add it to the list of one
                // trick ponies
                oneTrickPonies[token[0]] = true;
            }
        })
    ;

    // string together the optimized pieces of code
    var alt = /&&|\|\|/g;
    return Object.keys(oneTrickPonies).concat(
        Object.keys(tokens)
            .map(function(item) {
                // sort the checks by "complexity"
                // this is just a stupid sort based on the number of
                // 'and' and 'or' statements in the returned blocks
                tokens[item].sort(function(a, b) {
                    return a.split(alt).length - b.split(alt).length;
                });

                if (tokens[item].length === 0) {
                    return item;
                }
                else if (tokens[item].length === 1) {
                    return [item, tokens[item].join(type)].join('&&');
                }
                else {
                    return [item,'('+tokens[item].join(type)+')'].join('&&');
                }
            })
    );
}
