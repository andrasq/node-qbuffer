/**
 * qbuffer -- buffered binary datastream for piping, buffering and rechunking
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * 2015-09-15 - AR.
 */


'use strict'

var util = require('util')
var EventEmitter = require('events').EventEmitter

function QBuffer( opts ) {
    if (this === global || !this) return new QBuffer(opts)
    opts = opts || {}
    this.highWaterMark = opts.highWaterMark || 1024000
    this.lowWaterMark = opts.lowWaterMark || 40960
    this.encoding = opts.encoding || null
    this.start = 0
    this.length = 0
    this.chunks = new Array()
    this.chunk = null
    return this
}

QBuffer.prototype = {
    highWaterMark: null,
    lowWaterMark: null,
    encoding: undefined,
    start: 0,
    length: 0,

    chunks: null,
    chunk: null,

    setEncoding:
    function setEncoding( encoding ) {
        this.encoding = encoding
        return this
    },

/***
    // customize the record delimiter.  The default up to and including the first newline "\n"
    setDelimiter:
    function setDelimiter( delimiterConfig ) {
        // TBD:
        // eg a min num bytes needed and a filter function on those bytes to look for the end of the record
        // for newlines (min bytes 1), or bson object (min bytes 5)
        return this
    },

    indexOf:
    function indexOf( string, start ) {
        start = this.start + (start === undefined) ? 0 : start
        var pos = this._findSubstring(string, start)
        return pos >= 0 ? pos - this.start : -1
    },
***/

    indexOfChar:
    function indexOfChar( char, start ) {
        start = start || 0
        var pos = this._indexOfCharcode(char.charCodeAt(0), start + this.start)
        return pos === -1 ? -1 : pos - this.start
    },

    // retrieve the next record (newline-terminated string) form the buffer
    getline:
    function getline( ) {
        var eol = this._indexOfCharcode("\n".charCodeAt(0))
        if (eol === -1) return null
        return this.read(eol + 1 - this.start)
    },

    // copy out, but do not consume, the next record from the buffer
    peekline:
    function peekline( ) {
        var eol = this._indexOfCharcode("\n".charCodeAt(0))
        if (eol === -1) return null
        return this._peekbytes(eol + 1, this.encoding)
    },

    // return the requested number of bytes or null if not that many, or everything in the buffer
    read:
    function read( nbytes, encoding, cb ) {
        if (!cb && typeof encoding === 'function') {
            cb = encoding
            encoding = null
        }
        // TODO: if callback provided and no data yet, queue reader and complete read later
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

    _read:
    function _read( nbytes ) {
        return this.read(nbytes)
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
        return this.length < this.highWaterMark
    },

    // find the offset of the first char in the buffered data
    _indexOfCharcode:
    function _indexOfCharcode( code, start ) {
        // must be called with start >= this.start
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
                for (j=start; j<chunk.length; j++) {
                    // then scan that chunk for the first instance of code
                    if (chunk[j] === code) return offset + j
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
                return
            }
        }
    },

    // merge Buffers until bound is contained inside the first buffer
    // returns the first Buffer, now larger, or null if not enough data
    _concat:
    function _concat( bound ) {
        if (this.length < bound) return null
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
