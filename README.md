# Pursuit Core
Pursuit Core is a way to build Object Property Matching Languages. It is written for [Node](http://nodejs.org/), but its output should run just fine in other JavaScript environments such as a browser. It compiles a given query into JavaScript code for optimal performance when checking many objects for certain characteristics. All compiled functions (should) return a boolean value, making them extremely useful in `.filter`-, `.every`- and `.some` methods on arrays.

Features:

  * Generates a object property matching language with notation for AND, OR and negation.
  * Return generated code as a compiled function or a text string.
  * Reuse dictionary functions within other dictionary functions.
  * Handles checks for existance of objects before checking values.
  * Optimization of the generated code.
  * Helpful end-user error messages.

This project is heavily inspired by [Mathias Buus](https://github.com/mafintosh)'s [CopenhagenJS](http://copenhagenjs.dk/) talk on [JSON query compilation](https://github.com/mafintosh/json-query-compilation).

**Caveat**: It does use [`new Function`](https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Function) to compile the generated code into functional code, so take great precautions with what you trust it with. Think twice before using it to generate code on the client-side.


## Creating a matching language
To create a matching language you will need to pass in an object containing a set of matching functions. This set of functions will from now on be refered to as a "Dictionary."

A matching function is a function returns a string of source code that Pursuit Core can string together and compile into a working JavaScript function. Every matching function output should compile into a boolean test, as Pursuit Core will join them the resulting code pieces together with AND or OR operators.

The following example defines a small Dictionary that can check a value--or values in an object literal--for equality, or if the value is greater than or less than a specified value.

```javascript
var dictionary = {
    equals: function (value) {
        return this.getScope() + ' === ' + value;
    },
    greaterThan: function (value) {
        return this.getScope() + ' > ' + value;
    },
    lessThan: function (value) {
        return this.getScope() + ' < ' + value;
    }
};

var myMatchLang = pursuitCore({
    dictionary: dictionary
});
```

`myMatchLang` will hold a function that will generate matcher functions as seen in the following example:

```javascript
// parsing a schema to the myMatchLang function
// we defined in the previous example
var match = myMatchLang({
    name: {
        equals: 'Martin'
    },
    age: {
        greaterThan: 21,
        lessThan: 58
    }
});

// using the resulting matching function on some objects
console.log(match({ name: 'Martin', age: 30 })); // true
console.log(match({ name: 'Martin', age: 19 })); // false
console.log(match({ name: 'John Doe', age: 22 })); // false
```


### `this.getScope()`
The generated code support checking for values in nested objects, and within the dictionary the current object path is accessible via the `this.getScope` function.

The following example serve to illustrate the output of `this.getScope`.

```javascript
var scope = pursuitCore({
    dictionary: {
        show: function (value) {
            return this.getScope();
        }
    }
}, 'string');

console.log(scope({show: ''}));
// 'function anonymous(entry) { return entry }'

console.log(scope({one: {show: ''}}));
// 'function anonymous(entry) { return entry&&entry["one"] }'

console.log(scope({one: {two: {show: ''}}}));
// 'function anonymous(entry) { return entry&&entry["one"]&&typeof entry["one"] === "object"&&entry["one"]["two"] }'
```

These checks are made to prevent the generated language from throwing errors if the input does not have the expected structure. In other words, the generated language will never check for a key on an undefined object, it will return false instead.


### Negation
By default negations will be done by assigning an object to the key `!not`. This can be changed by passing a negation key to the config object.

```javascript
var matcher = pursuitCore({
    dictionary: {
        equals: function (value) {
            return this.getScope() + ' === ' + value;
        }
    }
});

var test = matcher({ '!not': { equals: 'foo' }});
test('bar'); // true
test('foo'); // false
```

The default negation key-name can be changed by setting `negation` to your desired negation key like this:

```javascript
var matcher = pursuitCore({
    dictionary: {
        equals: function (value) {
            return this.getScope() + ' === ' + value;
        }
    },
    negation: 'example'
});

var test = matcher({ 'example': { equals: 'foo' }});
test('bar'); // true
test('foo'); // false
```

### Calling Other Dictionary Functions From Within a Dictionary Function
Dictionary functions are reusable from within other dictionary functions using `this.call(method{, argument})`. Observe how `is` is used within the `stringContains` function in the following example.

```javascript
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
console.log(['foobar', 'foobaz', ['foo'], 'baz'].filter(matcher)) // -> ['foobar', 'foobaz']
```

It will not match `['foo']` because we check if the item is a string.

Reusing the same code structure allow Pursuit Core to make optimizations, because it will batch similar code such as type checks together. Using `this.call` where possible will ensure the code structure remain similar, even if the implementation is changed.

Beware of recursion though. There is no check for circular calls.


### Compile-Time and Run-Time Scope
Todo.


## Optimization
By default Pursuit Core will attempt to optimize the generated code. This is currently done by:

  1. Grouping operations.
  2. Sorting the groups by the number of operations, making the assumption that fewer operations are faster (this assumption is flawed, as two small operations could be faster than a computational heavy one).
  3. Removing unnecessary operations. For instance, if a previous check make sure that an entry is an object, and another check within the same group check if it is an object, the two operations will be combined.

The optimization could perhaps be smarter and better, by performing some kind of code analysis, but the current implementation works pretty well in most cases.

If it is suspected that this optimization introduce a bug in the generated code, or if there is another reason to disable it, it can be done by parsing `optimize: false` when creating the language.

```javascript
pursuitCore({ optimize: false,  dictionary: {}});
```

Read the *Inspecting Generated Source Code*-section for information on how to inspect the generated output.


## Inspecting Generated Source Code
An optional second parameter, determining the return type, can be passed when generating the matching language.

```javascript
pursuitEngine({dictionary: {}}, 'string');
pursuitEngine({dictionary: {}}, 'function'); // default
```

So far it is possible to return a 'string' and as a 'function', if nothing is passed it will return a function.


## Development
After cloning the project you will have to run `npm install` in the project root. This will install the various grunt plugins and other dependencies.


### QA tools
The QA tools rely on the [Grunt](http://gruntjs.com) task runner. To run any of these tools, you will need the grunt-cli installed globally on your system. This is easily done by typing the following in a terminal.

    $ npm install grunt-cli -g

The unit tests will need the [Buster](http://busterjs.org/) unit test framework.

    $ npm install -g buster

These two commands will install the buster and grunt commands on your system. These can be removed by typing `npm uninstall buster -g` and `npm uninstall grunt-cli -g`.


#### Unit Tests
If you haven't all ready install the Grunt CLI tools and have a look at the grunt configuration file in the root of the project.

When developing you want to run the script watcher. Navigate to the project root and type the following in your terminal.

    $ grunt watch:scripts

This will run the jshint and tests each time a file has been modified.


#### Benchmarks
Todo.


## License
The MIT License (MIT)

Copyright (c) 2014 Martin Gausby

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
