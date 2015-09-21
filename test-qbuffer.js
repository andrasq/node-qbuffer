/**
 * qbuffer -- buffered binary datastream for piping, buffering and rechunking
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

var QBuffer = require('./index')
var Stream = require('stream')


// build a stream that will emit the given chunks of data
function makeTestStream( stream, chunks ) {
    // note: streams emit immediately, data is lost if no listener
    for (var i=0; i<chunks.length; i++) {
        stream.emit('data', chunks[i])
    }
    stream.emit('end')
    return stream
}

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

    'length': {
        'should return 0 when empty': function(t) {
            t.equal(0, this.cut.length);
            t.done();
        },

        'should be length of single chunk': function(t) {
            this.cut.write("test string");
            t.equal(11, this.cut.length);
            t.done();
        },

        'should be total length of multiple chunks': function(t) {
            this.cut.write("test string");
            this.cut.write("test2");
            t.equal(16, this.cut.length);
            t.done();
        },

        'should not include the consumed start and be empty once all read': function(t) {
            this.cut.write("test data");
            this.cut.read(3)
            t.equal(this.cut.length, 6);
            this.cut.read(6)
            t.equal(this.cut.length, 0);
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

    'peekbytes': {
        'should return next unread bytes without consuming the data': function(t) {
            this.cut.write('test1 test2 test3')
            this.cut.read(4)
            t.deepEqual(this.cut.peekbytes(4), new Buffer('1 te'))
            t.deepEqual(this.cut.peekbytes(4), new Buffer('1 te'))
            t.done()
        },
    },

    'read': {
        'should return Buffer by default': function(t) {
            this.cut.write('test')
            t.deepEqual(this.cut.read(4), new Buffer('test'))
            t.done()
        },

        'should return string if encoding is specified': function(t) {
            this.cut.write('test')
            t.deepEqual(this.cut.read(4, 'utf8'), 'test')
            t.done()
        },

        'should return the next unread portion of the data': function(t) {
            this.cut.write(new Buffer("test data"));
            t.deepEqual(this.cut.read(3), new Buffer("tes"));
            t.equal(this.cut.start, 3);
            t.deepEqual(this.cut.read(4), new Buffer("t da"));
            t.equal(this.cut.start, 7);
            t.done();
        },

        'should return Buffer by default': function(t) {
            this.cut.write('test')
            t.deepEqual(this.cut.read(4), new Buffer('test'))
            t.done()
        },

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

    'skipbytes': {
        'should advance read point': function(t) {
            this.cut.write('test1')
            this.cut.skipbytes(3)
            t.equal(this.cut.length, 2)
            t.equal(this.cut.read(2, 'utf8'), 't1')
            t.done()
        },

        'should start at read offset': function(t) {
            this.cut.write('test1 test2')
            this.cut.read(3)
            this.cut.skipbytes(3)
            t.equal(this.cut.length, 5)
            t.equal(this.cut.read(5, 'utf8'), 'test2')
            t.done()
        },

        'should skip entire chunks': function(t) {
            this.cut.write('test1\n')
            this.cut.write('test2\n')
            this.cut.write('test3\n')
            this.cut.skipbytes(15)
            t.equal(this.cut.length, 3)
            t.equal(this.cut.read(2, 'utf8'), 't3')
            t.done()
        },
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
        'should return -1 if not found': function(t) {
            this.cut.write(new Buffer("test"));
            t.equal(this.cut.indexOfChar("\n"), -1);
            t.done();
        },

        'should find newline at start': function(t) {
            this.cut.write(new Buffer("\ntest"));
            t.equal(this.cut.indexOfChar("\n"), 0);
            t.done();
        },

        'should find newline at end': function(t) {
            this.cut.write(new Buffer("test\n"));
            t.equal(this.cut.indexOfChar("\n"), 4);
            t.done();
        },

        'should find newline in middle': function(t) {
            this.cut.write(new Buffer("test1\r\ntest2"));
            t.equal(this.cut.indexOfChar("\n"), 6);
            t.done();
        },

        'should not return an offset before start': function(t) {
            this.cut.write(new Buffer("\r\ntest1\r\ntest2"));
            this.cut.read(4)
            t.equal(this.cut.indexOfChar("\n"), 4);
            t.done();
        },

        'should return offset in combined chunks': function(t) {
            this.cut.write("part1");
            this.cut.write("part2");
            this.cut.write("\nmore data");
            t.equal(this.cut.indexOfChar("\n"), 10);
            t.done();
        },

        'should start searching at offset': function(t) {
            this.cut.write("test1\r\ntest2\r\ntest3");
            t.equal(this.cut.indexOfChar("\n", 8), 13);
            t.done();
        },

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

    '_concat': {
        'should use existing buffer if already big enough': function(t) {
            this.cut.write('line1\nline2')
            this.cut.write('\nline3\nline')
            this.cut.write('4\n')
            this.cut._concat(5)
            t.equal(this.cut.chunks[0].length, 11)
            t.done()
        },

        'should combine buffers until bound is contained': function(t) {
            this.cut.write('line1\nline2')
            this.cut.write('\nline3\nline')
            this.cut.write('4\n')
            this.cut._concat(24)
            t.equal(this.cut.chunks[0].length, 24)
            t.done()
        },

        'should combine buffers to contain bound with large read offset': function(t) {
            this.cut.write('line1\nline2')
            this.cut.write('\nline3\nline')
            this.cut.write('4\n')
            this.cut.read(18)
            this.cut._concat(24)
            t.equal(this.cut.chunks[0].length, 24)
            t.equal(this.cut.read(6, 'utf8'), 'line4\n')
            t.done()
        },
    },

    'operational tests': {
        'should consume stream': function(t) {
            dataStream = new Stream()
            this.cut.pipeFrom(dataStream)
            makeTestStream(dataStream, ['line1\nline2', '\nline3\nline', '4\n'])
            var line, lines = []
            this.cut.setEncoding('utf8')
            while ((line = this.cut.getline())) lines.push(line)
            t.deepEqual(lines, ['line1\n', 'line2\n', 'line3\n', 'line4\n'])
            t.done()
        },

        'quicktest': function(t) {
            var b = new QBuffer()
            var i, j

            var encoding = 'utf8'

            var s200 = new Array(200).join('x') + "\n"  // 200B lines
            var s1k = new Array(251).join(s200)         // in 50k chunks

            var expectChar, expectLine
            if (!encoding) { expectChar = 'x'.charCodeAt(0) ; expectLine = new Buffer(s200) }
            else { expectChar = 'x' ; expectLine = s200 }

            b.write("line1\nline2\nline3\nline4\n")
            var chunkSize = 65000
            // write 100k lines total
            for (i=0; i<400; i++) for (j=0; j<s1k.length; j+=chunkSize) b.write(s1k.slice(j, j+chunkSize))

            t.deepEqual(b.getline(), new Buffer("line1\n"))
            b.setEncoding(encoding)                     // null for Buffers, 'utf8' for strings
            t.deepEqual(b.getline(), encoding ? "line2\n" : new Buffer("line2\n"))
            t.deepEqual(b.getline(), encoding ? "line3\n" : new Buffer("line3\n"))
            t.deepEqual(b.getline(), encoding ? "line4\n" : new Buffer("line4\n"))

            var t1 = Date.now()
            //for (var i=0; i<100000; i++) { var line = b.getline(); if (line.length !== s200.length) console.log("FAIL") }
            var line
            for (var i=0; i<100000; i++) { line = b.read(b.indexOfChar("\n")+1); if (line.length !== s200.length || line[0] !== expectChar) console.log("FAIL") }
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
        }
    },
}
