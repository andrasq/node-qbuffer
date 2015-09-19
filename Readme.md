QBuffer
=======

fast binary stream buffer, to be able to coalesce then re-split chunked binary data

For easier throttling and event loop control, QBuffer implements pull-based flow
control.  It buffers incoming data on write, but reading happens when
the code is ready for the data, not when the data happens to arrive.

WORK IN PROGRESS


        var assert = require('assert')
        var http = require('http')
        var QBuffer = require('qbuffer')

        var qbuf = new QBuffer()
        http.request("http://example.com/retrieve/json/lines", function(res) {
            res.on('data', function(chunk) {
                qbuf.write(chunk)
            })
            res.on('end', function() {
                var line, json
                while ((line = qbuf.getline()) !== null) {
                    json = JSON.parse(line)
                }
                assert(qbuf.length === 0)
            })
        })

### new QBuffer( opts )

Options:
- highWaterMark
- lowWaterMark

### buf.length

The number of unrad bytes currently in the buffer.

### buf.getline( )

Remove and return the next record from the buffer, or null if no complete line
is present.  By default records are newline terminated characters, with the
newline included as part of the record.

### buf.peekline( )

Just like `getline`, but do not advance the read point, do not consume the
returned bytes.  Calling `peekline` a second time will return the same line
again.

### buf.read( nbytes )

Remove and return the next nbytes bytes from the buffer, or null if not that
many bytes available.

### buf.peekbytes( nbytes )

Just like read, but do not advance the read point past the bytes returned.

### buf.setEncoding( encoding )

Specify how to encode the returned bytes, eg 'utf8' or 'base64'.  Specifyng an
encoding will cause strings to be read from the QBuffer.  The default, an
encoding value of null, returns Buffer objects instead of strings.

### buf.write( data [,encoding] [,callback] )

Append data to the buffer.  The data may be provided either as a string or in a
Buffer.  The callback, if specified, will be called with the count of bytes
(not characters) appended.


Todo
----

- unit tests
- make pipable (event emitter), if no performance penalty
