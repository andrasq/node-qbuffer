/**
 * qbuffer -- buffered binary datastream for piping, buffering and rechunking
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

var fs = require('fs')
var QBuffer = require('./index.js')
var Stream = require('stream')
var qpipes = require('./piping.js')

qpipes.addPipes(QBuffer)

function streamTestData( stream, chunks ) {
    for (var i=0; i<chunks.length; i++) stream.emit('data', chunks[i])
    stream.emit('end')
}

module.exports = {
    setUp: function(done) {
        this.cut = new QBuffer()
        done()
    },

    'should consume stream with pipeFrom': function(t) {
        var dataStream = new Stream()
        this.cut.pipeFrom(dataStream)
        streamTestData(dataStream, ['line1\nline2', '\nline3\nline', '4\n'])
        var line, lines = []
        this.cut.setEncoding('utf8')
        while ((line = this.cut.getline())) lines.push(line)
        t.deepEqual(lines, ['line1\n', 'line2\n', 'line3\n', 'line4\n'])
        t.done()
    },

    'should pipe from multiple streams until unpiped': function(t) {
        var stream = new Stream()
        var stream2 = new Stream()
        stream.pipe(this.cut)
        stream2.pipe(this.cut)
        stream.emit('data', "test1")
        stream2.emit('data', "\ntest")
        stream.emit('data', "2\ntest3\n")
        // unpipe a stream, verify that subsequent data does not arrive
        // node v4.1.0 documents an unpipe(), but not yet in 0.10 or 0.12
        //stream.unpipe(this.cut)
        this.cut.emit('unpipe', stream)
        //this.cut.unpipeFrom(stream)
        stream.emit('data', "test4\n")
        t.equal(this.cut.read().toString(), "test1\ntest2\ntest3\n")
        t.done()
    },
}
