// json5.js
// Modern JSON. See README.md for details.
//
// This file is based directly off of Douglas Crockford's json_parse.js:
// https://github.com/douglascrockford/JSON-js/blob/master/json_parse.js

var JSON5 = (typeof exports === 'object' ? exports : {});

JSON5.parse = (function () {
    "use strict";

// This is a function that can parse a JSON5 text, producing a JavaScript
// data structure. It is a simple, recursive descent parser. It does not use
// eval or regular expressions, so it can be used as a model for implementing
// a JSON5 parser in other languages.

// We are defining the function inside of another function to avoid creating
// global variables.

    var escapee = {
            "'":  "'",
            '"':  '"',
            '\\': '\\',
            '/':  '/',
            '\n': '',       // Replace escaped newlines in strings w/ empty string
            b:    '\b',
            f:    '\f',
            n:    '\n',
            r:    '\r',
            t:    '\t'
        },
        ws = [
            ' ',
            '\t',
            '\r',
            '\n',
            '\v',
            '\f',
            '\xA0',
            '\uFEFF'
        ],

        renderChar = function (chr) {
            return chr === '' ? 'EOF' : "'" + chr + "'";
        },

        error = function (m, state) {
            ensureStateSane(state);

// Call error when something is wrong.

            var error = new SyntaxError();
            // beginning of message suffix to agree with that provided by Gecko - see https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse
            error.message = m + " at line " + state.lineNumber + " column " + state.columnNumber + " of the JSON5 data. Still to read: " + JSON.stringify(state.text.substring(state.at - 1, state.at + 19));
            error.at = state.at;
            // These two property names have been chosen to agree with the ones in Gecko, the only popular
            // environment which seems to supply this info on JSON.parse
            error.lineNumber = state.lineNumber;
            error.columnNumber = state.columnNumber;
            throw error;
        },

        next = function (c, state) {
            ensureStateSane(state);

            var nextState = Object.assign({}, state);

            ensureStateSane(nextState);
// If a c parameter is provided, verify that it matches the current character.

            if (c && c !== state.ch) {
                error("Expected " + renderChar(c) + " instead of " + renderChar(state.ch), state);
            }

// Get the next character. When there are no more characters,
// return the empty string.

            nextState.ch = state.text.charAt(state.at);
            nextState.at = state.at + 1;
            nextState.columnNumber = state.columnNumber + 1;
            if (nextState.ch === '\n' || nextState.ch === '\r' && peek(nextState) !== '\n') {
                nextState.lineNumber = state.lineNumber + 1;
                nextState.columnNumber = 0;
            }
            ensureStateSane(nextState);
            return nextState;
        },

        peek = function (state) {
            ensureStateSane(state);

// Get the next character without consuming it or
// assigning it to the ch varaible.

            return state.text.charAt(state.at);
        },

        identifier = function (state) {
            ensureStateSane(state);

// Parse an identifier. Normally, reserved words are disallowed here, but we
// only use this for unquoted object keys, where reserved words are allowed,
// so we don't check for those here. References:
// - http://es5.github.com/#x7.6
// - https://developer.mozilla.org/en/Core_JavaScript_1.5_Guide/Core_Language_Features#Variables
// - http://docstore.mik.ua/orelly/webprog/jscript/ch02_07.htm
// TODO Identifiers can have Unicode "letters" in them; add support for those.

            var key = state.ch;

            // Identifiers must start with a letter, _ or $.
            if ((state.ch !== '_' && state.ch !== '$') &&
                    (state.ch < 'a' || state.ch > 'z') &&
                    (state.ch < 'A' || state.ch > 'Z')) {
                error("Bad identifier as unquoted key", state);
            }

            // Subsequent characters can contain digits.
            while ((state = next(undefined, state)) && state.ch && (
                    state.ch === '_' || state.ch === '$' ||
                    (state.ch >= 'a' && state.ch <= 'z') ||
                    (state.ch >= 'A' && state.ch <= 'Z') ||
                    (state.ch >= '0' && state.ch <= '9'))) {
                ensureStateSane(state)
                key += state.ch;
            }

            return {state: state, value: key};
        },

        number = function (state) {
            ensureStateSane(state);

// Parse a number value.

            var number,
                sign = '',
                string = '',
                base = 10;

            if (state.ch === '-' || state.ch === '+') {
                sign = state.ch;
                state = next(state.ch, state);
            }

            // support for Infinity (could tweak to allow other words):
            if (state.ch === 'I') {
                var valueAndState = word(state);
                number = valueAndState.value;
                state = valueAndState.state;
                if (typeof number !== 'number' || isNaN(number)) {
                    error('Unexpected word for number', state);
                }
                return {state: state, value: (sign === '-') ? -number : number};
            }

            // support for NaN
            if (state.ch === 'N') {
              var valueAndState = word(state);
              number = valueAndState.value;
              state = valueAndState.state;
              if (!isNaN(number)) {
                error('expected word to be NaN', state);
              }
              // ignore sign as -NaN also is NaN
              return {state: state, value: number};
            }

            if (state.ch === '0') {
                string += state.ch;
                state = next(undefined, state);
                if (state.ch === 'x' || state.ch === 'X') {
                    string += state.ch;
                    state = next(undefined, state);
                    base = 16;
                } else if (state.ch >= '0' && state.ch <= '9') {
                    error('Octal literal', state);
                }
            }

            switch (base) {
            case 10:
                while (state.ch >= '0' && state.ch <= '9' ) {
                    string += state.ch;
                    state = next(undefined, state);
                }
                if (state.ch === '.') {
                    string += '.';
                    while ((state = next(undefined, state)) && state.ch && state.ch >= '0' && state.ch <= '9') {
                        string += state.ch;
                    }
                }
                if (state.ch === 'e' || state.ch === 'E') {
                    string += state.ch;
                    state = next(undefined, state);
                    if (state.ch === '-' || state.ch === '+') {
                        string += state.ch;
                        state = next(undefined, state);
                    }
                    while (state.ch >= '0' && state.ch <= '9') {
                        string += state.ch;
                        state = next(undefined, state);
                    }
                }
                break;
            case 16:
                while (state.ch >= '0' && state.ch <= '9' || state.ch >= 'A' && state.ch <= 'F' || state.ch >= 'a' && state.ch <= 'f') {
                    string += state.ch;
                    state = next(undefined, state);
                }
                break;
            }

            if(sign === '-') {
                number = -string;
            } else {
                number = +string;
            }

            if (!isFinite(number)) {
                error("Bad number", state);
            } else {
                return {state: state, value: number};
            }
        },

        string = function (state) {
            ensureStateSane(state);

// Parse a string value.

            var hex,
                i,
                string = '',
                delim,      // double quote or single quote
                uffff;

// When parsing for string values, we must look for ' or " and \ characters.

            if (state.ch === '"' || state.ch === "'") {
                delim = state.ch;
                while ((state = next(undefined, state))) {
                    if (state.ch === delim) {
                        state = next(undefined, state);
                        return {state: state, value: string};
                    } else if (state.ch === '\\') {
                        state = next(undefined, state);
                        if (state.ch === 'u') {
                            uffff = 0;
                            for (i = 0; i < 4; i += 1) {
                                state = next(undefined, state);
                                hex = parseInt(state.ch, 16);
                                if (!isFinite(hex)) {
                                    break;
                                }
                                uffff = uffff * 16 + hex;
                            }
                            string += String.fromCharCode(uffff);
                        } else if (state.ch === '\r') {
                            if (peek(state) === '\n') {
                                state = next(undefined, state);
                            }
                        } else if (typeof escapee[state.ch] === 'string') {
                            string += escapee[state.ch];
                        } else {
                            break;
                        }
                    } else if (state.ch === '\n') {
                        // unescaped newlines are invalid; see:
                        // https://github.com/aseemk/json5/issues/24
                        // TODO this feels special-cased; are there other
                        // invalid unescaped chars?
                        break;
                    } else {
                        string += state.ch;
                    }
                }
            }
            error("Bad string", state);
        },

        inlineComment = function (state) {
            ensureStateSane(state);

// Skip an inline comment, assuming this is one. The current character should
// be the second / character in the // pair that begins this inline comment.
// To finish the inline comment, we look for a newline or the end of the text.

            if (state.ch !== '/') {
                error("Not an inline comment", state);
            }

            do {
                state = next(undefined, state);
                if (state.ch === '\n' || state.ch === '\r') {
                    state = next(undefined, state);
                    return state;
                }
            } while (state.ch);

            return state;
        },

        blockComment = function (state) {
            ensureStateSane(state);

// Skip a block comment, assuming this is one. The current character should be
// the * character in the /* pair that begins this block comment.
// To finish the block comment, we look for an ending */ pair of characters,
// but we also watch for the end of text before the comment is terminated.

            if (state.ch !== '*') {
                error("Not a block comment", state);
            }

            do {
                state = next(undefined, state);
                while (state.ch === '*') {
                    state =next('*', state);
                    if (state.ch === '/') {
                        state = next('/', state);
                        return state;
                    }
                }
            } while (state.ch);

            error("Unterminated block comment");
        },

        comment = function (state) {
            ensureStateSane(state);

// Skip a comment, whether inline or block-level, assuming this is one.
// Comments always begin with a / character.

            if (state.ch !== '/') {
                error("Not a comment");
            }

            state = next('/', state);

            if (state.ch === '/') {
                state = inlineComment(state);
            } else if (state.ch === '*') {
                state = blockComment(state);
            } else {
                error("Unrecognized comment");
            }

            return state;
        },

        white = function (state) {
            ensureStateSane(state);

// Skip whitespace and comments.
// Note that we're detecting comments by only a single / character.
// This works since regular expressions are not valid JSON(5), but this will
// break if there are other valid values that begin with a / character!

            while (state.ch) {
                if (state.ch === '/') {
                    state = comment(state);
                } else if (ws.indexOf(state.ch) >= 0) {
                    state = next(undefined, state);
                } else {
                    return state;
                }
            }

            return state;
        },

        word = function (state) {
            ensureStateSane(state);

// true, false, or null.

            switch (state.ch) {
            case 't':
                state = next('t', state);
                state = next('r', state);
                state = next('u', state);
                state = next('e', state);
                return {state: state, value: true};
            case 'f':
                state = next('f', state);
                state = next('a', state);
                state = next('l', state);
                state = next('s', state);
                state = next('e', state);
                return {state: state, value: false};
            case 'n':
                state = next('n', state);
                state = next('u', state);
                state = next('l', state);
                state = next('l', state);
                return {state: state, value: null};
            case 'I':
                state = next('I', state);
                state = next('n', state);
                state = next('f', state);
                state = next('i', state);
                state = next('n', state);
                state = next('i', state);
                state = next('t', state);
                state = next('y', state);
                return {state: state, value: Infinity};
            case 'N':
                state = next('N', state);
                state = next('a', state);
                state = next('N', state);
                return {state: state, value: NaN};
            }
            error("Unexpected " + renderChar(state.ch), state);
        },

        value,  // Place holder for the value function.

        array = function (state) {
            ensureStateSane(state);

// Parse an array value.

            var array = [];

            if (state.ch === '[') {
                state = next('[', state);
                state = white(state);
                while (state.ch) {
                    if (state.ch === ']') {
                        state = next(']', state);
                        return {state: state, value: array};   // Potentially empty array
                    }
                    // ES5 allows omitting elements in arrays, e.g. [,] and
                    // [,null]. We don't allow this in JSON5.
                    if (state.ch === ',') {
                        error("Missing array element");
                    } else {
                        var valueAndState = value(state);
                        array.push(valueAndState.value);
                        state = valueAndState.state;
                    }
                    state = white(state);
                    // If there's no comma after this value, this needs to
                    // be the end of the array.
                    if (state.ch !== ',') {
                        state = next(']', state);
                        return {state: state, value: array};
                    }
                    state = next(',', state);
                    state = white(state);
                }
            }
            error("Bad array");
        },

        object = function (state) {
            ensureStateSane(state);

// Parse an object value.

            var key,
                object = {};

            if (state.ch === '{') {
                state = next('{', state);
                state = white(state);
                while (state.ch) {
                    if (state.ch === '}') {
                        state = next('}', state);
                        return {state: state, value: object};   // Potentially empty object
                    }

                    // Keys can be unquoted. If they are, they need to be
                    // valid JS identifiers.
                    var keyAndState;
                    if (state.ch === '"' || state.ch === "'") {
                        keyAndState = string(state);
                    } else {
                        keyAndState = identifier(state);
                    }
                    key = keyAndState.value;
                    state = keyAndState.state;

                    state = white(state);
                    state = next(':', state);
                    var valueAndState = value(state);
                    object[key] = valueAndState.value;
                    state = valueAndState.state;
                    state = white(state);
                    // If there's no comma after this pair, this needs to be
                    // the end of the object.
                    if (state.ch !== ',') {
                        state = next('}', state);
                        return {state: state, value: object};
                    }
                    state = next(',', state);
                    state = white(state);
                }
            }
            error("Bad object", state);
        };

    value = function (state) {
        ensureStateSane(state);

// Parse a JSON value. It could be an object, an array, a string, a number,
// or a word.

        state = white(state);
        switch (state.ch) {
        case '{':
            return object(state);
        case '[':
            return array(state);
        case '"':
        case "'":
            return string(state);
        case '-':
        case '+':
        case '.':
            return number(state);
        default:
            return state.ch >= '0' && state.ch <= '9' ? number(state) : word(state);
        }
    };

// Return the json_parse function. It will have access to all of the above
// functions and variables.

    return function (source, reviver) {
        var state = {
            at: 0,
            text: String(source),
            lineNumber: 1,
            columnNumber: 1,
            ch: ' '
        };
        var resultAndState = value(state);
        var result = resultAndState.value;
        state = resultAndState.state;
        state = white(state);
        if (state.ch) {
            error("Syntax error", state);
        }

// If there is a reviver function, we recursively walk the new structure,
// passing each name/value pair to the reviver function for possible
// transformation, starting with a temporary root object that holds the result
// in an empty key. If there is not a reviver function, we simply return the
// result.

        return typeof reviver === 'function' ? (function walk(holder, key) {
            var k, v, value = holder[key];
            if (value && typeof value === 'object') {
                for (k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        v = walk(value, k);
                        if (v !== undefined) {
                            value[k] = v;
                        } else {
                            delete value[k];
                        }
                    }
                }
            }
            return reviver.call(holder, key, value);
        }({'': result}, '')) : result;
    };
}());

// JSON5 stringify will not quote keys where appropriate
JSON5.stringify = function (obj, replacer, space) {
    if (replacer && (typeof(replacer) !== "function" && !isArray(replacer))) {
        throw new Error('Replacer must be a function or an array');
    }
    var getReplacedValueOrUndefined = function(holder, key, isTopLevel) {
        var value = holder[key];

        // Replace the value with its toJSON value first, if possible
        if (value && value.toJSON && typeof value.toJSON === "function") {
            value = value.toJSON();
        }

        // If the user-supplied replacer if a function, call it. If it's an array, check objects' string keys for
        // presence in the array (removing the key/value pair from the resulting JSON if the key is missing).
        if (typeof(replacer) === "function") {
            return replacer.call(holder, key, value);
        } else if(replacer) {
            if (isTopLevel || isArray(holder) || replacer.indexOf(key) >= 0) {
                return value;
            } else {
                return undefined;
            }
        } else {
            return value;
        }
    };

    function isWordChar(c) {
        return (c >= 'a' && c <= 'z') ||
            (c >= 'A' && c <= 'Z') ||
            (c >= '0' && c <= '9') ||
            c === '_' || c === '$';
    }

    function isWordStart(c) {
        return (c >= 'a' && c <= 'z') ||
            (c >= 'A' && c <= 'Z') ||
            c === '_' || c === '$';
    }

    function isWord(key) {
        if (typeof key !== 'string') {
            return false;
        }
        if (!isWordStart(key[0])) {
            return false;
        }
        var i = 1, length = key.length;
        while (i < length) {
            if (!isWordChar(key[i])) {
                return false;
            }
            i++;
        }
        return true;
    }

    // export for use in tests
    JSON5.isWord = isWord;

    // polyfills
    function isArray(obj) {
        if (Array.isArray) {
            return Array.isArray(obj);
        } else {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    }

    function isDate(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    }

    var objStack = [];
    function checkForCircular(obj) {
        for (var i = 0; i < objStack.length; i++) {
            if (objStack[i] === obj) {
                throw new TypeError("Converting circular structure to JSON");
            }
        }
    }

    function makeIndent(str, num, noNewLine) {
        if (!str) {
            return "";
        }
        // indentation no more than 10 chars
        if (str.length > 10) {
            str = str.substring(0, 10);
        }

        var indent = noNewLine ? "" : "\n";
        for (var i = 0; i < num; i++) {
            indent += str;
        }

        return indent;
    }

    var indentStr;
    if (space) {
        if (typeof space === "string") {
            indentStr = space;
        } else if (typeof space === "number" && space >= 0) {
            indentStr = makeIndent(" ", space, true);
        } else {
            // ignore space parameter
        }
    }

    // Copied from Crokford's implementation of JSON
    // See https://github.com/douglascrockford/JSON-js/blob/e39db4b7e6249f04a195e7dd0840e610cc9e941e/json2.js#L195
    // Begin
    var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta = { // table of character substitutions
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
        '"' : '\\"',
        '\\': '\\\\'
    };
    function escapeString(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.
        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string' ?
                c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }
    // End

    function internalStringify(holder, key, isTopLevel) {
        var buffer, res;

        // Replace the value, if necessary
        var obj_part = getReplacedValueOrUndefined(holder, key, isTopLevel);

        if (obj_part && !isDate(obj_part)) {
            // unbox objects
            // don't unbox dates, since will turn it into number
            obj_part = obj_part.valueOf();
        }
        switch(typeof obj_part) {
            case "boolean":
                return obj_part.toString();

            case "number":
                if (isNaN(obj_part) || !isFinite(obj_part)) {
                    return "null";
                }
                return obj_part.toString();

            case "string":
                return escapeString(obj_part.toString());

            case "object":
                if (obj_part === null) {
                    return "null";
                } else if (isArray(obj_part)) {
                    checkForCircular(obj_part);
                    buffer = "[";
                    objStack.push(obj_part);

                    for (var i = 0; i < obj_part.length; i++) {
                        res = internalStringify(obj_part, i, false);
                        buffer += makeIndent(indentStr, objStack.length);
                        if (res === null || typeof res === "undefined") {
                            buffer += "null";
                        } else {
                            buffer += res;
                        }
                        if (i < obj_part.length-1) {
                            buffer += ",";
                        } else if (indentStr) {
                            buffer += "\n";
                        }
                    }
                    objStack.pop();
                    buffer += makeIndent(indentStr, objStack.length, true) + "]";
                } else {
                    checkForCircular(obj_part);
                    buffer = "{";
                    var nonEmpty = false;
                    objStack.push(obj_part);
                    for (var prop in obj_part) {
                        if (obj_part.hasOwnProperty(prop)) {
                            var value = internalStringify(obj_part, prop, false);
                            isTopLevel = false;
                            if (typeof value !== "undefined" && value !== null) {
                                buffer += makeIndent(indentStr, objStack.length);
                                nonEmpty = true;
                                key = isWord(prop) ? prop : escapeString(prop);
                                buffer += key + ":" + (indentStr ? ' ' : '') + value + ",";
                            }
                        }
                    }
                    objStack.pop();
                    if (nonEmpty) {
                        buffer = buffer.substring(0, buffer.length-1) + makeIndent(indentStr, objStack.length) + "}";
                    } else {
                        buffer = '{}';
                    }
                }
                return buffer;
            default:
                // functions and undefined should be ignored
                return undefined;
        }
    }

    // special case...when undefined is used inside of
    // a compound object/array, return null.
    // but when top-level, return undefined
    var topLevelHolder = {"":obj};
    if (obj === undefined) {
        return getReplacedValueOrUndefined(topLevelHolder, '', true);
    }
    return internalStringify(topLevelHolder, '', true);
};

function ensureStateSane(state) {
    if (state && state.text != null) {
        return;
    }
    throw new Error('Invariant violation: state has gone insane: ' + JSON.stringify(state));
}
