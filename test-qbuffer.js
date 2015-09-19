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
            var cut = this.cut
            cut.write("test1test2")
            var str = cut.read(5, 'base64')
            t.equal(str, "dGVzdDE=")
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

    'speed test': {
        'quicktest': function(t) {
            var b = new QBuffer()

            var s200 = new Array(200).join('x') + "\n"
            var s20k = new Array(20001).join(s200)

            b.write("line1\nline2\nline3\nline4\n")
            b.write(s20k)
            b.write(s20k)
            b.write(s20k)
            b.write(s20k)
            b.write(s20k)
            console.log(b.getline())
            //b.setEncoding('utf8')
            console.log(b.getline())
            console.log(b.getline())
            console.log(b.getline())
            var t1 = Date.now()
            for (var i=0; i<100000; i++) { var line = b.getline(); if (line.length !== 200) console.log("FAIL") }
            var t2 = Date.now()
            console.log("100k getline in %d", t2 - t1)
            // 800k 200B lines per second, not quite as fast as qfgets (utf8)
            // 1.2m 200B buffers per second, faster than qfgets (binary)
            console.log(b)
            t.done()
        }
    },
}
