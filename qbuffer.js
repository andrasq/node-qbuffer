/**
 * qbuffer -- buffered binary datastream for piping, buffering and rechunking
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * 2015-09-15
 */


'use strict'

var util = require('util')
var EventEmitter = require('events').EventEmitter

function QBuffer( opts ) {
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
***/

    // retrieve the next record (newline-terminated string) form the buffer
    getline:
    function getline( ) {
        var eol = this._indexOfCharcode("\n".charCodeAt(0))
        if (eol === -1) return null
        return this.read(eol - this.start + 1)
    },

    // copy out, but do not consume, the next record from the buffer
    peekline:
    function peekline( ) {
        var eol = this._indexOfCharcode("\n".charCodeAt(0))
        if (eol === -1) return null
        var bound = eol + 1
        var chunk = (bound < this.chunks[0].length) ? this.chunks[0] : this._concat(bound)
        return this.encoding ? chunk.toString(this.encoding, this.start, bound) : chunk.slice(this.start, bound)
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
        if (this.chunks[0].length < bound) this._concat(bound)
        if (this.chunks[0].length < bound) return null

        var chunk = this.chunks[0].slice(this.start, bound)
        this.length -= chunk.length
        this.start = (bound < this.chunks[0].length) ? bound : (this.chunks.shift(), 0)

        // if (this.length < this.lowWaterMark && this.length + nbytes > this.lowWaterMark) this.emit('drain')
        return encoding ? chunk.toString(encoding) : chunk
    },

    peekbytes:
    function peekbytes( nbytes, encoding ) {
        encoding = encoding || this.encoding
        var bound = this.start + nbytes
        var chunk = this._concat(bound)
        if (chunk) return this.encoding ? chunk.toString(encoding, this.start, bound) : chunk.slice(this.start, bound)
        else return null
    },

    _read:
    function _read( nbytes ) {
        return this.read(nbytes)
    },

    // append more data to the buffered contents
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
    function _indexOfCharcode( ch ) {
        if (this.chunks.length === 0) return -1
        var i, pos, offset = 0, chunk
        for (i=0, pos=this.start; i<this.chunks.length; i++, offset+=chunk.length, pos=0) {
            chunk = this.chunks[i]
            for (; pos<chunk.length; pos++) {
                if (chunk[pos] === ch) return offset + pos
            }
        }
        return -1
    },

    // skip past and discard the next nbytes bytes of input
    _skip:
    function _skip( nbytes ) {
        var bound = this.start + nbytes
        while (bound > 0 && this.length > 0) {
            if (bound >= this.chunks[0].length) {
                var chunk = this.chunks.shift()
                bound -= chunk.length
                this.length -= (chunk.length - this.start)
                this.start = 0
            }
            else {
                this.start = bound
                return
            }
        }
    },

    // merge Buffers until bound is contained inside the first buffer
    // returns the first chunk, now larger, or null if not enough data
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
