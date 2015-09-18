var QBuffer = require('./index')

module.exports = {
    'should parse package.json': function(t) {
        require('./package.json')
        t.done();
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
