/**
 * qbuffer -- buffered binary datastream for piping, buffering and rechunking
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

var util = require('util')
var EventEmitter = require('events').EventEmitter
var QBuffer = require('./qbuffer.js')

var pipingMethods
module.exports.addPipes = function addPipes( Class ) {
    if (!Class.prototype.pipeFrom) {
        var i, classMethods = Class.prototype

        // inherit EventEmitter methods
        util.inherits(Class, EventEmitter)

        // restore QBuffer methods that util.inherit clobbered
        for (i in classMethods) Class.prototype[i] = classMethods[i]

        // supplement and override QBuffer class methods
        for (i in pipingMethods) Class.prototype[i] = pipingMethods[i]

        // augment QBuffer object constructor to listen for piping events
        Class.prototype._wrapClass = function() {
            var self = this
            this.on('pipe', function(stream) { self.pipeFrom(stream) })
            this.on('unpipe', function(stream) { self.unpipeFrom(stream) })
        }

        // assigning prototype converts the assigned object from hash to struct, for faster access
        Class.prototype = Class.prototype
    }
}

pipingMethods = {

    // throttling write result
    _writeThrottle:
    function _writeThrottle( ) {
        // return true if willing to buffer more, false to throttle input
        // automatic throttling requires knowing the record boundaries! (ie setDelimiter),
        // otherwise might deadlock waiting for the paused data to finish arriving
        // only when we already have the next record for getline() can we throttle

        // NOTE: _lineEnd() detection is O(n^2) for lines spanning multiple chunks!!
        if (this.length > this.highWaterMark && this._lineEnd() >= 0) {
            this.overfull = true
            return false
        }
        return true
    },

    // unthrottling read and skip result
    _readThrottle:
    function _readThrottle( ) {
        if (this.overfull && this.length < this.lowWaterMark) {
            this.overfull = false
            this.emit('drain')
        }
    },

    pipeFrom:
    function pipeFrom( stream ) {
        var self = this
        var onData, onEnd, onClose
        stream.on('data', onData = function onData(chunk) { self.write(chunk) })
        stream.on('end', onEnd = function() { stream.emit('_unpipeFrom') })
        stream.on('close', onClose = function() { stream.emit('_unpipeFrom') })
        stream.once('_unpipeFrom', function() {
            stream.removeListener('data', onData)
            stream.removeListener('end', onEnd)
            stream.removeListener('close', onClose)
        })
    },

    unpipeFrom:
    function unpipeFrom( stream ) {
        stream.emit('_unpipeFrom')
        return this
    },

    pipeTo:
    function pipeTo( stream, options ) {
        options = options || {}
        // NOTE: this pipe() is limited to piping to only one destination
        if (this._outpipe) this._outpipe.emit('_unpipeTo')

        var self = this, onDrain, onFinish
        stream.on('drain', onDrain = function() {
            self.throttled = false
            self._drain()
        })
        stream.once('_unpipeTo', function() {
            stream.removeListener('drain', onDrain)
            stream.removeListener('drain', onFinish)
            self._outpipe = null
            self._pipeFragments = false
            self.throttled = false
        })
        if (options.end === undefined || options.end) stream.once('_pipeToEnd', function() {
            // if pipeTo options.end only then end the output stream (default true)
            stream.end()
        })
        stream.once('close', function() { stream.emit('_unpipeTo') })

        this._outpipe = stream
        this._pipeFragments = options.allowFragments || false
        this._drain()
        return stream
    },

    // flush the queued records to the receiving pipe
    // _drain() writes data, and thus can re-pause the pipe
    _drain: function _drain( ) {
        // TODO: maybe drain as an event emitter, emit 'data' records
        // TODO: not clear whether pause/resume should affect a pipe (vs just 'data' events)
        if (!this._outpipe || this.throttled || this.paused) return
        var chunk
        while ((chunk = (this.getline() || this._pipeFragments && this.length && this.read(this.length))) !== null) {
            var writeMore = this._outpipe.write(chunk)
            if (writeMore === false) { this.throttled = true ; return }
        }
        if (this.length === 0 && this.ended && this._outpipe.emit) {
            // unhook from and end() the destination stream
            this._outpipe.emit('_pipeToEnd')
        }
    },

    unpipeTo:
    function unpipeTo( stream ) {
        // NOTE: this is not a full pipe(), the stream can be piped to only one destination at a time
        if (stream && stream !== this._outpipe) return
        stream = stream || this._outpipe
        stream.emit('_unpipeTo')
        return this
    },

    pause:
    function pause( ) {
        this.paused = true
        return this
    },

    resume:
    function resume( ) {
        this.paused = false
        this._drain()
        return this
    },
}
