/**
 * qbuffer -- buffered binary datastream for piping, buffering and rechunking
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

var QBuffer = require('./index')

module.exports = {
    setUp: function(done) {
        this.cut = new QBuffer()
        done()
    },

    'package': {
        'package.json should parse': function(t) {
            require('./package.json')
            t.done();
        },
    },

    'write': {
        'should append buffers to chunks': function(t) {
            this.cut.write(new Buffer("123"))
            t.ok(this.cut.chunks.length > 0)
            t.done()
        },

        'should convert strings to buffers': function(t) {
            this.cut.write("456")
            t.deepEqual(this.cut.chunks[0], new Buffer("456"))
            t.done()
        },

        'should increment length': function(t) {
            t.equal(this.cut.length, 0)
            this.cut.write("1")
            t.equal(this.cut.length, 1)
            this.cut.write("23")
            t.equal(this.cut.length, 3)
            this.cut.write("\x80\x81", 'utf8')
            t.equal(this.cut.length, 7)
            t.done()
        },

        'should convert using specified encoding': function(t) {
            this.cut.write("NDU2", 'base64')
            t.deepEqual(this.cut.chunks[0], new Buffer("456"))
            t.done()
        },

        'should invoke callback if specified': function(t) {
            var cut = this.cut
            t.expect(2)
            cut.write("NDU2", 'base64', function(err, nbytes) {
                t.ifError(err)
                cut.write("78", function(err, nbytes) {
                    t.ifError(err)
                    t.done()
                })
            })
        },
    },

    'read': {
        'should retrieve content from separate Buffers': function(t) {
            this.cut.write(new Buffer("test"))
            this.cut.write(new Buffer("1"))
            var str = this.cut.read(5)
            t.deepEqual(str, new Buffer("test1"))
            t.done()
        },

        'should convert using specified encoding': function(t) {
            this.cut.write("test1test2")
            var str = this.cut.read(5, 'base64')
            t.equal(str, "dGVzdDE=")
            t.done()
        },

        'should convert using set encoding': function(t) {
            this.cut.write("test1test2")
            this.cut.setEncoding('base64')
            var str = this.cut.read(5)
            t.equal(str, "dGVzdDE=")
            t.done()
        },

        'should return null if no data available': function(t) {
            this.cut.write("test")
            t.equal(this.cut.read(5), null)
            t.done()
        },

        'should concat buffers and skip already read bytes': function(t) {
            this.cut.setEncoding('utf8')
            this.cut.write("test1\ntest")
            this.cut.write("2\ntest3\ntest")
            t.equal(this.cut.read(6), "test1\n")
            t.equal(this.cut.read(6), "test2\n")
            t.equal(this.cut.read(6), "test3\n")
            t.equal(this.cut.read(6), null)
            t.done()
        },

        'should split utf8 characters on byte boundaries': function(t) {
            this.cut.write("\x80")
            t.equal(this.cut.length, 2)
            t.deepEqual(this.cut.read(1), new Buffer([0xc2]))
            t.equal(this.cut.length, 1)
            t.done()
        },

/***
TBD:
        'should invoke callback if given': function(t) {
            var cut = this.cut
            t.expect(2)
            cut.write("test1test2test3")
            cut.read(5, function(err, ret) {
                t.ifError(err)
                cut.read(5, function(err, ret) {
                    t.ifError()
                    t.done()
                })
            })
        },
***/
    },

    'getline': {
        'should call read with line length': function(t) {
            var readBytes = 0, cut = this.cut, oldRead = cut.read
            cut.read = function(a, b, c) {
                readBytes += a
                return oldRead.call(cut, a, b, c)
            }
            cut.write("test1\n")
            cut.getline()
            cut.read = oldRead
            t.equal(readBytes, 6)
            t.done()
        },

        'should return data ending in newline': function(t) {
            this.cut.write("test")
            t.equal(this.cut.getline(), null)
            this.cut.write("1\ntest2\n")
            t.equal(this.cut.getline(), "test1\n")
            t.done()
        },
    },

    'indexOfChar': {
        'should offset for start and call _indexOfCharcode': function(t) {
            var called = false, oldIndexOf = this.cut._indexOfCharcode
            var cut = this.cut
            cut._indexOfCharcode = function(ch,start) {
                called = true
                t.equal(ch, "\n".charCodeAt(0))
                t.equal(start, 6)
                return oldIndexOf.call(cut, ch, start)
            }
            cut.write("test1\ntest2\n")
            cut.read(3)
            t.equal(cut.indexOfChar("\n", 3), 8)
            t.equal(called, true)
            t.done()
        },

        'should work like getline': function(t) {
            this.cut.write("test1\ntest")
            this.cut.write("2\ntest3\ntest4")
            this.cut.setEncoding('utf8')
            t.equal(this.cut.read(this.cut.indexOfChar("\n")+1), "test1\n")
            t.equal(this.cut.read(this.cut.indexOfChar("\n")+1), "test2\n")
            t.equal(this.cut.read(this.cut.indexOfChar("\n")+1), "test3\n")
            t.done()
        },
    },

    '_indexOfCharcode': {
        'locates char': function(t) {
            var nl = "\n".charCodeAt(0)
            this.cut.write("test1\ntest2\n")
            t.equal(this.cut._indexOfCharcode(nl), 5)
            t.done()
        },

        'locates char at offset': function(t) {
            var nl = "\n".charCodeAt(0)
            this.cut.write("test1\n")
            this.cut.write("test2\n")
            t.equal(this.cut._indexOfCharcode(nl, 7), 11)
            t.done()
        },

        'locates char at offset across chunks': function(t) {
            this.cut.write("test1\ntest")
            this.cut.write("2\ntest3\ntest4")
            this.cut.write("\n")
            t.equal(this.cut._indexOfCharcode(10), 5)
            t.equal(this.cut._indexOfCharcode(10, 6), 11)
            t.equal(this.cut._indexOfCharcode(10, 12), 17)
            t.equal(this.cut._indexOfCharcode(10, 18), 23)
            t.done()
        },

        'returns -1 if char not found': function(t) {
            t.equal(this.cut._indexOfCharcode(1), -1)
            t.done()
        }
    },

    'operational tests': {
        'quicktest': function(t) {
            var b = new QBuffer()
            var i

            var s200 = new Array(200).join('x') + "\n"  // 200B lines
            var s1k = new Array(251).join(s200)         // in 50k chunks

            b.write("line1\nline2\nline3\nline4\n")
            for (i=0; i<400; i++) b.write(s1k)          // 100k lines total

            console.log(b.getline())
            expectChar = 'x'.charCodeAt(0)
            b.setEncoding('utf8'); expectChar = 'x'
            console.log(b.getline())
            console.log(b.getline())
            console.log(b.getline())

            var t1 = Date.now()
            //for (var i=0; i<100000; i++) { var line = b.getline(); if (line.length !== s200.length) console.log("FAIL") }
            var line
            for (var i=0; i<100000; i++) { line = b.read(b.indexOfChar("\n")+1); if (line.length !== s200.length || line[0] !== expectChar) console.log("FAIL") }
            var t2 = Date.now()
            console.log("AR: last line", line)
            console.log("100k getline in %d", t2 - t1)
            console.log(b)
            t.done()

            // 1.15m 200B lines per second (utf8) (230 MB/s) (1.9m/s 20B lines, 227k/s 200B lines)
            // 1.15m 200B buffers per second, faster than qfgets (binary) (230 MB/s) (1.6m/s 20B buffers)
        }
    },
}
