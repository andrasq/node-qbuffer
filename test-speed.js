/**
 * qbuffer -- buffered binary datastream for piping, buffering and rechunking
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

fs = require('fs')
var QBuffer = require('./index')
var Stream = require('stream')

module.exports = {
    setUp: function(done) {
        this.cut = new QBuffer()
        done()
    },

    'operational tests': {
        'quicktest': function(t) {
            var b = new QBuffer()
            var i, j

            var encoding = 'utf8'

            var nloops = 100000
            var s200 = new Array(200).join('x') + "\n"  // 200B lines
            var s1k = new Array(251).join(s200)         // in 50k chunks

            var expectChar, expectLine
            if (!encoding) { expectChar = 'x'.charCodeAt(0) ; expectLine = new Buffer(s200) }
            else { expectChar = 'x' ; expectLine = s200 }

            b.write("line1\nline2\nline3\nline4\n")
            var chunkSize = 65000
            // write 100k lines total
            for (i=0; i<nloops / 250; i++) for (j=0; j<s1k.length; j+=chunkSize) b.write(s1k.slice(j, j+chunkSize))

            t.deepEqual(b.getline(), new Buffer("line1\n"))
            b.setEncoding(encoding)                     // null for Buffers, 'utf8' for strings
            t.deepEqual(b.getline(), encoding ? "line2\n" : new Buffer("line2\n"))
            t.deepEqual(b.getline(), encoding ? "line3\n" : new Buffer("line3\n"))
            t.deepEqual(b.getline(), encoding ? "line4\n" : new Buffer("line4\n"))

            var t1 = Date.now()
            //for (var i=0; i<nloops; i++) { var line = b.getline(); if (line.length !== s200.length) console.log("FAIL") }
            var line
            //for (var i=0; i<nloops; i++) { line = b.read(b.indexOfChar("\n")+1); if (line.length !== s200.length || line[0] !== expectChar) console.log("FAIL") }
            for (var i=0; i<nloops; i++) { line = b.getline(); if (line.length !== s200.length || line[0] !== expectChar) console.log("FAIL") }
            var t2 = Date.now()
            t.deepEqual(line, expectLine)
            console.log("100k getline in %d", t2 - t1)
            // also spot-check check internal qbuffer state, should be completely empty
            t.equal(b.length, 0)
            t.deepEqual(b.chunks, [])
            t.deepEqual(b.encoding, encoding)
            t.done()

            // 1.15m 200B lines per second (utf8) (230 MB/s) (1.9m/s 20B lines, 227k/s 200B lines) in 50k chunks
            // 1.15m 200B buffers per second, faster than qfgets (binary) (230 MB/s) (1.6m/s 20B buffers) in 50k chunks
            // 250k 200B lines per second (utf8) in 1k chunks

            // 600k 200B lines per second (utf8) (120 MB/s) re-chunked from stdin and saved with qfputs {writesize: 400000}
        },

        'fuzz test with lines in random size chunks': function(t) {
            var i, j, testString = "", testChunks = []
            for (i=0; i<10000; i++) testString += "test line " + i + "\n"
            var base = 0, bound
            while (base < testString.length) {
                bound = base + 1 + (Math.random() * 20 | 0)
                testChunks.push(testString.slice(base, bound))
                base = bound
            }
            var line, lines = []
            for (i=0; i<testChunks.length; i++) {
                this.cut.write(testChunks[i])
            }
            while ((line = this.cut.getline()) !== null) {
                lines.push(line)
            }
            for (i=0; i<lines.length; i++) {
                t.equal(lines[i], "test line " + i + "\n")
            }
            t.done()
        },
    },
}
