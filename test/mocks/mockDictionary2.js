'use strict';

module.exports = {
    equals: function (value) {
        return this.getScope() + ' === ' + value;
    },

    beginsWith: function (value) {
        return [
            // check if the key exists in the given entry
            this.call('typeOf', 'string'),
            // if key exists, check if it contain the given value at 0 position
            this.getScope() + '.indexOf('+value+') === 0'
        ].join('&&');
    },

    isSet: function (value) {
        var source = [
            this.call('typeOf', 'undefined'),
            this.call('typeOf', 'null')
        ].join('||');

        if (typeof value !== 'boolean') {
            // normalize the input value
            value = (value === 'true');
        }

        return (!value ? '': '!') + '('+source+')';
    },

    endsWith: function (value) {
        return [
            // check if the key exists in the given entry
            this.call('typeOf', 'string'),
            // check if it ends with the given value
            this.getScope() + '.substr(-'+(value.length-2)+') === '+value
        ].join('&&');
    },

    typeOf: function (value) {
        var rtn = [];
        value = value.toLowerCase();

        // test for array. I haven't tested this in other envs than node
        // it is the way node itself test for arrays.
        if (value === '"array"') {
            rtn.push([
                'Object.prototype.toString.call',
                '(' + this.getScope() + ')',
                '==="[object Array]"'
            ].join(''));
        }
        else if (value === '"null"') {
            rtn.push([
                'Object.prototype.toString.call',
                '(' + this.getScope() + ')',
                '==="[object Null]"'
            ].join(''));
        }
        else {
            rtn.push('typeof ' + this.getScope() + ' === ' + value);

            if (value === '"object"') {
                rtn.push('(Boolean(' + this.getScope() + '))');
            }
        }

        return rtn.join('&&');
    }
};
