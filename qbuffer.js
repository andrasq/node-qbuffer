/**
 * qbuffer -- buffered binary datastream for piping, buffering and rechunking
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * 2015-09-15 - AR.
 */


'use strict'

function QBuffer( opts ) {
    if (this === global || !this) return new QBuffer(opts)
    opts = opts || {}
    // TODO: throttle input above highWaterMark only if setDelimiter says we have a complete record waiting
    // TODO: otherwise might deadlock waiting for the paused data to finish arriving
    // this.highWaterMark = opts.highWaterMark || 1024000
    // this.lowWaterMark = opts.lowWaterMark || 40960
    this.encoding = opts.encoding || null
    this.start = 0
    this.length = 0
    this.chunks = new Array()
    return this
}

QBuffer.prototype = {
    highWaterMark: null,
    lowWaterMark: null,
    encoding: undefined,
    start: 0,
    length: 0,

    chunks: null,

    setEncoding:
    function setEncoding( encoding ) {
        this.encoding = encoding
        return this
    },

    // locate the end of the next record in the data
    // Default records are newline terminated strings
    _lineEnd:
    function _lineEnd( ) {
        var eol = this._indexOfCharcode(10, this.start)
        return eol === -1 ? -1 : eol + 1
    },

    _delimiterFunc: null,

    setDelimiter:
    function setDelimiter( delimiter ) {
        switch (true) {
        case delimiter === null:
            // on unspecified or empty delimiter restore the default, newline terminated strings
            delete this._lineEnd
            break
        case typeof delimiter === 'string':
            var ch1 = delimiter.charCodeAt(0), ch2 = delimiter.charCodeAt(1)
            if (delimiter.length === 1) this._lineEnd = function() {
                var eol = this._indexOfCharcode(ch1, this.start)
                return eol === -1 ? -1 : eol + 1
            }
            else if (delimiter.length === 2) this._lineEnd = function() {
                var eol = this._indexOfCharcode(ch1, ch2, this.start)
                return eol === -1 ? -1 : eol + 2
            }
            else throw new Error("string delimiters longer than 2 chars not supported yet")
            break
        case typeof delimiter === 'function':
            var self = this
            this._delimiterFunc = delimiter
            this._lineEnd = function() {
                // computed record end returns a user-visible start-relative offset
                var eol = self._delimiterFunc()
                return eol === -1 ? -1 : eol + this.start
            }
            break
        case typeof delimiter === 'number':
            this._lineEnd = function() { return this.start + delimiter }
            break
        default:
            throw new Error("unrecognized record delimiter: " + (typeof delimiter))
            break
        }
        return this
    },

/***
    indexOf:
    function indexOf( string, start ) {
        start = this.start + (start === undefined) ? 0 : start
        var pos = this._findSubstring(string, start)
        return pos >= 0 ? pos - this.start : -1
    },
***/

    indexOfChar:
    function indexOfChar( char, start ) {
        var pos = this._indexOfCharcode(char.charCodeAt(0), (start || 0) + this.start)
        return pos === -1 ? -1 : pos - this.start
    },

    indexOfChar2:
    function indexOfChar2( char, char2, start ) {
        var pos = this._indexOfCharcode(char.charCodeAt(0), char2.charCodeAt(0), (start || 0) + this.start)
        return pos === -1 ? -1 : pos - this.start
    },

    skipbytes:
    function skipbytes( nbytes ) {
        this._skipbytes(this.start + nbytes)
    },

    // retrieve the next record (newline-terminated string) form the buffer
    getline:
    function getline( ) {
        var eol = this._lineEnd()
        return (eol === -1) ? null : this.read(eol - this.start)
    },

    // return, but do not consume, the next record from the buffer
    peekline:
    function peekline( ) {
        var eol = this._lineEnd()
        return (eol === -1) ? null : this._peekbytes(eol, this.encoding)
    },

    // return the requested number of bytes or null if not that many, or everything in the buffer
    read:
    function read( nbytes, encoding, cb ) {
        if (!cb && typeof encoding === 'function') {
            cb = encoding
            encoding = null
        }
        // TODO: if callback provided and no data yet, queue reader and complete read later
        // TODO: actually invoke callback TBD
        encoding = encoding || this.encoding
        if (nbytes > this.length) return null
        if (!nbytes) nbytes = this.length

        var bound = this.start + nbytes
        var ret = this._peekbytes(bound, encoding)
        if (ret === null) return null
        this._skipbytes(bound)
        return ret
    },

    peekbytes:
    function peekbytes( nbytes, encoding ) {
        return this._peekbytes(this.start + nbytes, encoding || this.encoding)
    },

    _peekbytes:
    function _peekbytes( bound, encoding ) {
        if (!this.chunks.length) return null
        var chunk = (bound <= this.chunks[0].length) ? this.chunks[0] : this._concat(bound)
        if (!chunk) return null
        return encoding ? chunk.toString(encoding, this.start, bound) : chunk.slice(this.start, bound)
    },

    // append data to the buffered contents
    write:
    function write( chunk, encoding, cb ) {
        if (!cb && typeof encoding === 'function') {
            cb = encoding
            encoding = undefined
        }
        if (!Buffer.isBuffer(chunk)) chunk = new Buffer(chunk, encoding || this.encoding)
        this.chunks.push(chunk)
        this.length += chunk.length
        // TODO: timeit: copy into preallocated buffer, to pre-merge bufs and
        // not allocate many small buffers one for each input string

        if (cb) cb(null, chunk.length)

        // return true if willing to buffer more, false to throttle input
        // TODO: automatic throttling requires knowing the record boundaries! (ie setDelimiter)
        // return this.length < this.highWaterMark
        return true
    },

    pipeFrom:
    function pipeFrom( stream ) {
        var self = this
        var onData = function onData(chunk) { self.write(chunk) }
        stream.on('data', onData)
        stream.once('end', function() { stream.removeListener('data', onData) })
        stream.once('close', function() { stream.removeListener('data', onData) })
        // TODO: throttle input above highWaterMark only if setDelimiter says we have a complete record waiting
        // TODO: otherwise might deadlock waiting for the paused data to finish arriving
    },

    // find the offset of the first char in the buffered data
    // usage: ioc(code), ioc(code, start), ioc(code, code2, start)
    _indexOfCharcode:
    function _indexOfCharcode( code, code2, start ) {
        // must be called with start >= this.start
        if (start === undefined) { start = code2; code2 = undefined }
        start = start || this.start
        var i, j, offset = 0, chunk
        for (i=0; i<this.chunks.length; i++) {
            chunk = this.chunks[i]
            if (start >= chunk.length) {
                // advance to the chunk containing start
                start -= chunk.length
                offset += chunk.length
            }
            else {
                if (code2 === undefined) {
                    for (j=start; j<chunk.length; j++) {
                        // then scan that chunk for the first instance of code
                        if (chunk[j] === code) return offset + j
                    }
                }
                else {
                    for (j=start; j<chunk.length; j++) {
                        // NOTE: testing for a second charcode slows getline() 40%, use separate loop
                        if (chunk[j] === code) {
                            if (chunk.length > j + 1 && chunk[j+1] === code2) return offset + j
                            if (chunk.length === j + 1 && this.chunks.length > i + 1 && this.chunks[i+1][0] === code2) return offset + j
                        }
                    }
                }
                // if scanned a chunk, scan the next from its very beginning
                offset += chunk.length
                start = 0
            }
        }
        return -1
    },

/***
    // find the offset of the first occurrence of the substring not before start
    _findSubstring:
    function _findSubstring( substring, start ) {
        // TODO: WRITEME
    },
***/

    // skip past and discard all buffered bytes until bound
    _skipbytes:
    function _skipbytes( bound ) {
        while (this.length > 0) {
            if (bound >= this.chunks[0].length) {
                var chunk = this.chunks.shift()
                bound -= chunk.length
                this.length -= (chunk.length - this.start)
                this.start = 0
            }
            else {
                this.length -= (bound - this.start)
                this.start = bound
                if (this.start > 100000 && this.chunks[0].length - this.start < this.start) {
                    // do not let the first buffer grow without bound, trim it for the next _concat
                    this.chunks[0] = this.chunks[0].slice(this.start)
                    this.start = 0
                }
                return
            }
        }
    },

    // merge Buffers until bound is contained inside the first buffer
    // returns the first Buffer, now larger, or null if not enough data
    _concat:
    function _concat( bound ) {
        if (this.start + this.length < bound) return null
        var chunks = this.chunks

        var len = 0, nchunks = 0
        while (len < bound) {
            len += chunks[nchunks].length
            nchunks += 1
        }

        // optimize degenerate case when first chunk already holds all the data
        if (nchunks === 1) return chunks[0]

        // replace the first nchunks chunks with their merged contents, using a temporary placeholder
        // TODO: timeit: might be faster to just shift off the chunks and copy into a preallocated Buffer
        var chunk = Buffer.concat(chunks.splice(0, nchunks, ['placeholder']))
        return chunks[0] = chunk
    }
}


module.exports = QBuffer
