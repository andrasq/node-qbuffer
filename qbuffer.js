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

function QBuffer( opts ) {
    if (this === global || !this) return new QBuffer(opts)
    opts = opts || {}
    this.highWaterMark = opts.highWaterMark || 1024000
    this.lowWaterMark = opts.lowWaterMark || 40960
    this.encoding = opts.encoding || undefined
    this.start = 0
    this.length = 0
    this.chunks = new Array()
    this.setDelimiter(opts.delimiter || null)

    if (this._wrapClass) this._wrapClass()

    return this
}

var QBuffer_prototype = {
    encoding: undefined,                // node default is 'utf8'
    start: 0,
    length: 0,

    chunks: null,
    paused: true,                       // output paused explicitly by the user (to stop 'data' events)
    overfull: false,                    // buffer over capacity, asked writers to throttle
    ended: false,                       // when end() has been called
    _wrapClass: null,                   // to extend the class (TBD)

    _drain: function() { },             // override when piping
    highWaterMark: null,                        // used for throttling
    lowWaterMark: null,                         // used for throttling
    _writeThrottle: function() { return true }, // override when throttling
    _readThrottle: function() { },              // override when throttling

    setEncoding:
    function setEncoding( encoding ) {
        this.encoding = encoding
    },

    _computeLineEnd: null,              // func to find nbytes length of next record (set by setDelimiter)
    _lineEndLength: -1,                 // cached _lineEnd(), cleared by skip(), unget() and setDelimiter()
    _lineEnd:                           // return the end of the next record in the data, or -1 if not yet known
    function _lineEnd( ) {
        if (this._lineEndLength >= 0) return this._lineEndLength
        return this._lineEndLength = this._computeLineEnd()
    },

    setDelimiter:
    function setDelimiter( delimiter ) {
        this._lineEndLength = -1
        switch (true) {
        case delimiter === null:
        case delimiter === undefined:
            // on unspecified or empty delimiter restore the default, newline terminated strings
            this.setDelimiter("\n")
            break
        case typeof delimiter === 'string':
            var ch1 = delimiter.charCodeAt(0), ch2 = delimiter.charCodeAt(1)
            if (delimiter.length === 1) this._computeLineEnd = function() {
                var eol = this.indexOfCharcode(ch1, undefined, 0)
                return eol === -1 ? -1 : eol + 1
            }
            else if (delimiter.length === 2) this._computeLineEnd = function() {
                var eol = this.indexOfCharcode(ch1, ch2, 0)
                return eol === -1 ? -1 : eol + 2
            }
            else throw new Error("string delimiters longer than 2 chars not supported yet")
            break
        case typeof delimiter === 'function':
            this._computeLineEnd = delimiter
            break
        case typeof delimiter === 'number':
            this._computeLineEnd = function() { return delimiter }
            break
        default:
            throw new Error("unrecognized record delimiter: " + (typeof delimiter))
            break
        }
        return this
    },

    indexOfChar:
    function indexOfChar( char, start ) {
        return this.indexOfCharcode(char.charCodeAt(0), undefined, start || 0)
    },

    // push data back onto the head of the queue
    unget:
    function unget( chunk, encoding ) {
        this._lineEndLength = -1
        if (this.start > 0) { this.chunks[0] = this.chunks[0].slice(this.start) ; this.start = 0 }
        if (!Buffer.isBuffer(chunk)) chunk = new Buffer(chunk, encoding || this.encoding)
        this.chunks.unshift(chunk)
        this.length += chunk.length
        // TODO: what to return?
    },

    // retrieve the next record (newline-terminated string) form the buffer
    getline:
    function getline( ) {
        var nbytes = this._lineEnd()
        return (nbytes === -1) ? null : this.read(nbytes)
    },

    // return, but do not consume, the next record from the buffer
    peekline:
    function peekline( ) {
        var nbytes = this._lineEnd()
        return (nbytes === -1) ? null : this.peek(nbytes, this.encoding)
    },

    // return the requested number of bytes or null if not that many, or everything in the buffer
    read:
    function read( nbytes, encoding, cb ) {
        if (nbytes < 0) return null
        if (!cb && typeof encoding === 'function') { cb = encoding ; encoding = null }
        if (!cb && !encoding && typeof nbytes === 'function') { cb = nbytes ; nbytes = this.length }
        // TODO: if callback provided and no data yet, queue reader and complete read later
        // TODO: actually invoke callback TBD

        if (!nbytes) nbytes = this.length
        var ret = this.peek(nbytes, encoding || this.encoding)
        if (ret) this.skip(nbytes)
        return ret
    },

    peek:
    function peek( nbytes, encoding ) {
        if (nbytes < 0 || nbytes > this.length) return null
        var bound = nbytes + this.start
        if (bound > this.chunks[0].length) {
            // _concat: merge Buffers until bound is contained inside the first buffer
            var chunks = this.chunks, nchunks = 0, combinedLength = 0
            // find the number of chunks needed for nbytes of data
            while (combinedLength < bound) { combinedLength += chunks[nchunks].length ; nchunks += 1 }
            // replace the first nchunks chunks with their merged contents, using a temporary placeholder
            var chunk = Buffer.concat(chunks.splice(0, nchunks, ['placeholder']))
            chunks[0] = chunk
            // TODO: timeit: might be faster to just shift off the chunks and copy into a preallocated Buffer
        }
        var chunk = this.chunks[0]
        encoding = encoding || this.encoding
        return encoding ? chunk.toString(encoding, this.start, bound) : chunk.slice(this.start, bound)
    },

    // append data to the buffered contents
    write:
    function write( chunk, encoding, cb ) {
        if (!cb && typeof encoding === 'function') { cb = encoding ; encoding = undefined }
        if (this.ended) { var err = new Error("write after end") ; if (cb) cb(err); else throw err }
        if (!Buffer.isBuffer(chunk)) chunk = new Buffer(chunk, encoding || this.encoding)
        this.chunks.push(chunk)
        this.length += chunk.length

        if (cb) cb(null, chunk.length)
        this._drain()

        if (this.length > this.highWaterMark) { this.overfull = true ; return this._writeThrottle() }
        return true
    },

    end:
    function end( chunk, encoding, cb ) {
        if (!cb && typeof encoding === 'function') { cb = encoding ; encoding = undefined }
        if (chunk !== null && chunk !== undefined) this.write(chunk, encoding)
        this.ended = true
        // drain again to end() the output stream (even though the write() just did)
        this._drain()        
        // FIXME: wait for output to be fully drained, then emit 'finish' and invoke callback
        // this.once('finish', cb)
    },

    // find the offset of the first char in the buffered data
    // usage: ioc(code), ioc(code, start), ioc(code, code2, start)
    indexOfCharcode:
    function indexOfCharcode( code, code2, start ) {
        start = (start || 0) + this.start
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
                        if (chunk[j] === code) return offset + j - this.start
                    }
                }
                else {
                    for (j=start; j<chunk.length; j++) {
                        // NOTE: testing for a second charcode slows getline() 40%, use separate loop
                        if (chunk[j] === code) {
                            if (chunk.length > j + 1 && chunk[j+1] === code2) return offset + j - this.start
                            if (chunk.length === j + 1 && this.chunks.length > i + 1 && this.chunks[i+1][0] === code2) return offset + j - this.start
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

    // skip past and discard all buffered bytes until bound
    skip:
    function skip( nbytes ) {
        this._lineEndLength = -1
        if (nbytes > this.length) nbytes = this.length
        var bound = nbytes + this.start
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
                    // do not let the first buffer grow without bound, trim it back periodically
                    this.chunks[0] = this.chunks[0].slice(this.start)
                    this.start = 0
                }
                if (this.overfull && this.length < this.lowWaterMark) { this.overfull = false ; return this._readThrottle() }
                else return
            }
        }
    },
}

// aliases, for backward compatibility
QBuffer_prototype.skipbytes = QBuffer_prototype.skip
QBuffer_prototype.peekbytes = QBuffer_prototype.peek

// Note: reads lines 2.5x faster if methods not poked singly into prototype
// However, assigning prototype to self speeds accesses back up!
for (var i in QBuffer_prototype) QBuffer.prototype[i] = QBuffer_prototype[i]
QBuffer.prototype = QBuffer.prototype


module.exports = QBuffer
