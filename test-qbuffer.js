/**
 * qbuffer -- buffered binary datastream for piping, buffering and rechunking
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */


fs = require('fs')
var QBuffer = require('./index')
var Stream = require('stream')

var setImmediate = global.setImmediate || process.nextTick

// build a stream that will emit the given chunks of data
function streamTestData( stream, chunks ) {
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

    'unget': {
        'should prepend data': function(t) {
            this.cut.write("st1\n")
            this.cut.unget("te")
            t.deepEqual(this.cut.getline(), new Buffer("test1\n"))
            t.done()
        },

        'should splice out already read data': function(t) {
            this.cut.write("test1\ntest2\n")
            this.cut.read(8)
            this.cut.unget("te")
            t.deepEqual(this.cut.getline(), new Buffer("test2\n"))
            t.done()
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

    'peek': {
        'should return next unread bytes without consuming the data': function(t) {
            this.cut.write('test1 test2 test3')
            this.cut.read(4)
            t.deepEqual(this.cut.peek(4), new Buffer('1 te'))
            t.deepEqual(this.cut.peek(4), new Buffer('1 te'))
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

    'skip': {
        'should advance read point': function(t) {
            this.cut.write('test1')
            this.cut.skip(3)
            t.equal(this.cut.length, 2)
            t.equal(this.cut.read(2, 'utf8'), 't1')
            t.done()
        },

        'should start at read offset': function(t) {
            this.cut.write('test1 test2')
            this.cut.read(3)
            this.cut.skip(3)
            t.equal(this.cut.length, 5)
            t.equal(this.cut.read(5, 'utf8'), 'test2')
            t.done()
        },

        'should skip entire chunks': function(t) {
            this.cut.write('test1\n')
            this.cut.write('test2\n')
            this.cut.write('test3\n')
            this.cut.skip(15)
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

        'should apply decoder transform': function(t) {
            var unique = Math.random() * 0x1000000 >>> 0
            this.cut.setDecoder(function(line) { return unique + line })
            this.cut.write("line1")
            this.cut.write("\nline2\n")
            t.equal(this.cut.getline(), unique + "line1\n")
            t.equal(this.cut.getline(), unique + "line2\n")
            t.done()
        },
    },

    'peekline': {
        'should return next unread line': function(t) {
            this.cut.write("line1\nline2\nline")
            this.cut.getline()
            t.equal(this.cut.peekline(), "line2\n")
            t.equal(this.cut.peekline(), "line2\n")
            t.done()
        },

        'should return null when no complete lines': function(t) {
            t.equal(this.cut.peekline(), null)
            this.cut.write("line1")
            t.equal(this.cut.peekline(), null)
            t.done()
        },
    },

    'linelength': {
        'should return length of next line': function(t) {
            this.cut.write("line one\nl2\nline")
            t.equal(this.cut.linelength(), 9)
            this.cut.getline()
            t.equal(this.cut.linelength(), 3)
            t.equal(this.cut.linelength(), 3)
            this.cut.getline()
            t.equal(this.cut.linelength(), -1)
            t.done()
        },

        'should return -1 when no complete lines': function(t) {
            t.equal(this.cut.linelength(), -1)
            this.cut.write("line1")
            t.equal(this.cut.linelength(), -1)
            t.done()
        },
    },

    'setDelimiter': {
        'should split records on char': function(t) {
            this.cut.write("test1;test2;test\n")
            this.cut.setEncoding('utf8')
            this.cut.setDelimiter(';')
            t.equal(this.cut.getline(), 'test1;')
            t.equal(this.cut.getline(), 'test2;')
            t.equal(this.cut.getline(), null)
            t.done()
        },

        'should split fixed-length records on count': function(t) {
            this.cut.write("test1;test2;test3")
            this.cut.setEncoding('utf8')
            this.cut.setDelimiter(6)
            t.equal(this.cut.getline(), 'test1;')
            t.equal(this.cut.getline(), 'test2;')
            t.equal(this.cut.getline(), null)
            t.done()
        },

        'should split lines on computed line-end': function(t) {
            this.cut.write("test1;test2;test3")
            this.cut.setEncoding('utf8')
            this.cut.setDelimiter(function() {
                var pos = this.indexOfChar(';')
                return (pos < 0) ? -1 : pos + 1
            })
            t.equal(this.cut.getline(), 'test1;')
            t.equal(this.cut.getline(), 'test2;')
            t.equal(this.cut.getline(), null)
            t.done()
        },

        'should split variable-length records on computed length': function(t) {
            this.cut.write("1.a;2.bb;3.ccc;4.dddd")
            this.cut.setEncoding('utf8')
            this.cut.setDelimiter(function() {
                var nb = this.indexOfChar("."); if (nb === -1) return -1
                return nb + 1 + parseInt(this.peek(nb, 'utf8')) + 1
            })
            t.equal(this.cut.getline(), '1.a;')
            t.equal(this.cut.getline(), '2.bb;')
            t.equal(this.cut.getline(), '3.ccc;')
            t.equal(this.cut.getline(), null)
            t.done()
        },
    },

    'indexOfChar': {
        'should not return an offset before start': function(t) {
            this.cut.write(new Buffer("\r\ntest1\r\ntest2"));
            this.cut.read(4)
            t.equal(this.cut.indexOfChar("\n"), 4);
            t.done();
        },

        'should call indexOfCharcode': function(t) {
            var called = false, oldIndexOf = this.cut.indexOfCharcode
            var cut = this.cut
            cut.indexOfCharcode = function(ch, ch2, start) {
                called = true
                t.equal(ch, "\n".charCodeAt(0))
                t.equal(start, 3)
                return oldIndexOf.call(cut, ch, ch2, start)
            }
            cut.write("test1\ntest2\n")
            cut.read(3)
            t.equal(cut.indexOfChar("\n", 3), 8)
            t.equal(called, true)
            t.done()
        },

        'should be usable for getline': function(t) {
            this.cut.write("test1\ntest")
            this.cut.write("2\ntest3\ntest4")
            this.cut.setEncoding('utf8')
            t.equal(this.cut.read(this.cut.indexOfChar("\n")+1), "test1\n")
            t.equal(this.cut.read(this.cut.indexOfChar("\n")+1), "test2\n")
            t.equal(this.cut.read(this.cut.indexOfChar("\n")+1), "test3\n")
            t.done()
        },
    },

    'indexOfCharcode': {
        setUp: function(done) {
            this.CR = "\r".charCodeAt(0)
            this.NL = "\n".charCodeAt(0)
            done()
        },

        'should not return an offset before start': function(t) {
            this.cut.write(new Buffer("\r\ntest1\r\ntest2"));
            this.cut.read(4)
            t.equal(this.cut.indexOfCharcode(this.CR, this.NL, 0), 3);
            t.done();
        },

        'should return -1 if not found': function(t) {
            this.cut.write(new Buffer("test"));
            t.equal(this.cut.indexOfCharcode(this.NL), -1);
            t.done();
        },

        'should find newline at start': function(t) {
            this.cut.write(new Buffer("\ntest"));
            t.equal(this.cut.indexOfCharcode(this.NL, undefined, 0), 0);
            t.done();
        },

        'should find newline at end': function(t) {
            this.cut.write(new Buffer("test\n"));
            t.equal(this.cut.indexOfCharcode(this.NL, undefined, 0), 4);
            t.done();
        },

        'should find newline in middle': function(t) {
            this.cut.write(new Buffer("test1\r\ntest2"));
            t.equal(this.cut.indexOfCharcode(this.NL, undefined, 0), 6);
            t.done();
        },

        'should return offset in combined chunks': function(t) {
            this.cut.write("part1");
            this.cut.write("part2");
            this.cut.write("\nmore data");
            t.equal(this.cut.indexOfCharcode(this.NL, undefined, 0), 10);
            t.done();
        },

        'should start searching at offset': function(t) {
            this.cut.write("test1\r\ntest2\r\ntest3");
            t.equal(this.cut.indexOfCharcode(this.NL, undefined, 8), 13);
            t.done();
        },

        'locates char': function(t) {
            this.cut.write("test1\ntest2\n")
            t.equal(this.cut.indexOfCharcode(this.NL, undefined, 0), 5)
            t.done()
        },

        'locates char at offset': function(t) {
            this.cut.write("test1\n")
            this.cut.write("test2\n")
            t.equal(this.cut.indexOfCharcode(this.NL, undefined, 7), 11)
            t.done()
        },

        'locates char at offset across chunks': function(t) {
            this.cut.write("test1\ntest")
            this.cut.write("2\ntest3\ntest4")
            this.cut.write("\n")
            t.equal(this.cut.indexOfCharcode(this.NL, undefined, 0), 5)
            t.equal(this.cut.indexOfCharcode(this.NL, undefined, 6), 11)
            t.equal(this.cut.indexOfCharcode(this.NL, undefined, 12), 17)
            t.equal(this.cut.indexOfCharcode(this.NL, undefined, 18), 23)
            t.done()
        },

        'returns -1 if char not found': function(t) {
            t.equal(this.cut.indexOfCharcode(1), -1)
            t.done()
        },

        'two-charcode patterns': {
            'should find in first buffer': function(t) {
                this.cut.write("test1\r\ntest2\r\n")
                t.equal(this.cut.indexOfCharcode(this.CR, this.NL, 0), 5)
                t.done()
            },

            'should find in second buffer': function(t) {
                this.cut.write("test1")
                this.cut.write("\r\ntest2\r\n")
                t.equal(this.cut.indexOfCharcode(this.CR, this.NL, 0), 5)
                t.done()
            },

            'should find split across buffers': function(t) {
                this.cut.write("tes")
                this.cut.write("t1\r")
                this.cut.write("\ntest2\r\n")
                t.equal(this.cut.indexOfCharcode(this.CR, this.NL, 0), 5)
                t.done()
            },

            'should not find if pattern incomplete': function(t) {
                this.cut.write("test1\rtest2\ntest3")
                t.equal(this.cut.indexOfCharcode(this.CR, this.NL, 0), -1)
                t.done()
            },

            'should not find if no next buffer': function(t) {
                this.cut.write("test1\r")
                t.equal(this.cut.indexOfCharcode(this.CR, this.NL, 0), -1)
                t.done()
            },
        },
    },

    '_concat': {
        'should use existing buffer if already big enough': function(t) {
            this.cut.write('line1\nline2')
            this.cut.write('\nline3\nline')
            this.cut.write('4\n')
            this.cut.peek(5)
            t.equal(this.cut.chunks[0].length, 11)
            t.done()
        },

        'should combine buffers until bound is contained': function(t) {
            this.cut.write('line1\nline2')
            this.cut.write('\nline3\nline')
            this.cut.write('4\n')
            this.cut.peek(24)
            t.equal(this.cut.chunks[0].length, 24)
            t.done()
        },

        'should combine buffers to contain bound with large read offset': function(t) {
            this.cut.write('line1\nline2')
            this.cut.write('\nline3\nline')
            this.cut.write('4\n')
            this.cut.read(18)
            this.cut.peek(6)
            t.equal(this.cut.chunks[0].length, 24)
            t.equal(this.cut.read(6, 'utf8'), 'line4\n')
            t.done()
        },
    },

    'operational tests': {
        'processLines should return all lines': function(t) {
            var qbuf = this.cut
            var data = "", nlines = 10000
            for (var i=0; i<nlines; i++) data += "middling length test line number " + i + "\n"
            fs.writeFileSync("/tmp/unit-qbuffer.tmp", data)
            var stream = fs.createReadStream("/tmp/unit-qbuffer.tmp")
                .on('data', function(chunk) { qbuf.write(chunk) })
                .on('end', function() { qbuf.end() })
                .on('error', function() { t.ifError(err) })
            var lines = [];
            var yieldCount = 0, yieldLoop = setImmediate(function yield(){ yieldCount += 1; setImmediate(yield) });
            qbuf.processLines(function(line, cb) {
                lines.push(line);
                cb();
            }, function(err, lineCount) {
                if (global.clearImmediate) clearImmediate(yieldLoop);
                fs.unlinkSync("/tmp/unit-qbuffer.tmp");
                t.equal(lineCount, nlines);
                t.equal(lines.length, nlines);
                t.equal(lines.join(''), data);
                t.ok(yieldCount > nlines/100);
                t.done();
            });
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
