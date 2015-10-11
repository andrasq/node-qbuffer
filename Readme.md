QBuffer
=======

Very fast binary stream buffer, to be able to coalesce then re-split chunked binary data.
Handy for concatenated byte-counted binary or mixed text/binary data like BSON entities
or beanstalkd responses.  Reads over a million 200B lines per second from 50kB chunks.

For easier throttling and event loop control, QBuffer implements pull-based flow
control.  It buffers incoming data on write, but reading happens when
the code is ready for the data, not when the data happens to arrive.

QBuffers deliver a byte stream.  Read/peek/write/skip access is by byte count, not
string length.


Summary
-------

To extract json lines from an http response body:

        var assert = require('assert')
        var http = require('http')
        var QBuffer = require('qbuffer')

        var qbuf = new QBuffer()
        http.request("http://example.com/get/json/lines", function(res) {
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

To extract bson buffers from a stream:

        var qbuf = new QBuffer()
        qbuf.setReadEncoding('utf8')
        qbuf.setDelimiter(function() {
            if (this.length <= 4) return -1
            var len = this.peek(4)
            return len[0] + len[1] * 256 + len[2] * 65536 + len[3] * 16777216
        })

        var line, bsonArray = []
        stream.on('data', function(chunk) {
            qbuf.write(chunk)
            while ((line = qbuf.getline()) !== null) bsonArray.push(line)
        })
        stream.on('end', function() {
            while ((line = qbuf.getline()) !== null) bsonArray.push(line)
            if (qbuf.length > 0) throw new Error("incomplete last entity")
        })


Methods
-------

### new QBuffer( opts )

Options:
- `encoding` - the default encoding to use when writing or reading strings, as set with `setEncoding()` (default 'utf8')
- `delimiter` - record delimiter specifier, as set with `setDelimiter` (default '\n')
- `decoder` - an entity decoder function to apply to each record returned by getline / peekline

### buf.length

The number of unread bytes currently in the buffer.

### buf.encoding

Current encoding in effect

### buf.chunks

The buffered data chunks that hold the unread bytes.

### buf.ended

`end()` has been called on the buffer, no more data can be written.

### buf.getline( )

Remove and return the next record from the buffer, or null if no complete line
is present.  By default records are newline terminated characters, with the
newline included as part of the record.

### buf.peekline( )

Just like `getline`, but do not advance the read point, do not consume the
returned bytes.  Calling `peekline` a second time will return the same line
again.

### buf.linelength ( )

Return the length in bytes of the next unread record, or -1 if not yet known.

### buf.unget( data [,encoding] )

Prepend the data to the start of the buffered data.  The data may be a string
or a Buffer.  The next call to read() or getline() etc will return the newly
prepended bytes.

### buf.setEncoding( encoding )

Set the character encoding used by default to convert binary data to strings,
both when reading and when writing.  The encoding can also be specified call by
call in read(), peek() and write().

### buf.setDecoder( decoderFunction(line) )

Specify the function to transform records returned from getline() and peekline();
the `null` decoder restores the default.  By setting encoding to 'utf8' and decoder
to `JSON.parse`, each getline() of a newline terminated json stream will return the
object, not the string.  The default decoder is a pass-through, to return the
string or Buffer unmodified.  Note that decoded data can not be returned with
`unget()` (may error out, or silently fail with results undefined).

### buf.setDelimiter( delimiter )

Define the record delimiter for records returned by getline().  The default is
`"\n"`, for newline terminated strings.

Delimiter can be

- `string` 1 or 2 character terminating string.  The terminator is considered
  part of the record, and is returned in the data
- `number` length for fixed length records.
- `function` that returns the computed length of the record.  The delimiter
  function is invoked as a method call with `this` set to the qbuffer instance
- `null` to restore the built-in default of newline terminated strings

### buf.read( [nbytes] [,encoding] )

Remove and return the next nbytes bytes from the buffer, or null if not that
many bytes available.  Returns a string converted with the given encoding
or specified with setEncoding(), else a Buffer if no encoding is in effect.
If no byte count is given, will return all buffered data.

### buf.peek( nbytes [,encoding] )

Just like read, but do not advance the read point.

### buf.skip( nbytes )

Advance the read position by nbytes and discard the bytes skipped over.  If
there are not that many unread bytes it empties the buffer.

### buf.indexOfChar( char [,start] )

Return the offset in the unread data of the first occurrence of char at or
after offset `start` in the data stream.  This call just invokes
`indexOfCharcode` on the charcode of `char[0]`.

### buf.indexOfCharcode( code1, code2, start )

Return the offset in the unread data of the first occurrence of code1.  If
code2 is not undefined, code1 must be immediately followed by code2 in the data
for the codes to match.

With this call, getline() can be implemented as eg
`buf.read(buf.indexOfCharcode("\n".charCodeAt(0), undefined, 0) + 1)`

### buf.write( data [,encoding] [,callback(err, nbytes)] )

Append data to the buffer.  The data may be provided either as a string or in a
Buffer.  Strings are converted to bytes using the given encoding or that
specified by setEncoding.

Returns true if ready to buffer more data, false to throttle the input.  The
callback, if specified, will be called with the count of bytes (not characters)
appended.

### buf.end( [data] [,encoding] [,callback] )

Append an optional last chunk to the buffered data, and close the buffer.  Any
subsequent attempt to write will throw an error or call back with error.

### buf.processLines( visitor(line, cb), cb(err, count) )

Pass all lines from the stream to the visitor() function until the stream end,
and return the final success status and the count of records. processed.

Visitor is passed two arguments, the record and a callback.  If visitor returns
a processing error via the callback, it stops the processing loop.

Records are retrieved with getline(), so the configured encoding and line
decoder are utilized.  It is considered a processing error if the record
decodes into an Error object.  The record causing an error is not consumed, and
must be explicitly discarded by the caller for processing to be able to resume.

processLines is non-blocking, it yields to the event loop every 20 lines.


A Note on Piping
----------------

QBuffers can consume a stream with an on('data') event listener.  Stream errors
must be handled by the caller.

One big benefit of piping is the built-in flow control and data throttling.
However, qbuffers help separate variable length records.  With variable-length
records, automatically pausing the input risks stopping the data flow before the
end of the current record is received; once paused, the end never will arrive.
This would cause deadlock.  Since only the application knows the record layout,
the flow can only be controlled from the application, not from the data stream.

The application can define its record structure with `setDelimiter()`, or
can set a fixed record size for raw byte-counted binary transfers.

Simple non-throttling piping is easy to do by wrapping qbuf in a Stream with eg
`through`.  For example, to split the incoming binary stream into newline
terminated strings using a pipe:

        var QBuffer = require('qbuffer')
        var through = require('through')

        var qbuf = new QBuffer({ encoding: 'utf8', delimiter: '\n' })
        var qbufStream = through(
            function write(chunk, encoding) {
                var line
                qbuf.write(chunk, encoding)
                while ((line = qbuf.getline()) !== null) this.emit('data', line)
            },
            function end( ) {
                var line
                while ((line = qbuf.getline()) !== null) this.emit('data', line)
                if (qbuf.length > 0) throw new Error("incomplete last line: " + qbuf.read())
                this.emit('end')
            }
        )

        process.stdin.pipe(qbufStream).pipe(process.stdout)


Todo
----

- more unit tests
- emitTo(writeFunc, endFunc) method to pipe records to code
- expose _lineEnd()


Related Work
------------

- [split](http://npmjs.com/package/split) - very fast regex-delimited text stream re-splitter
- [through](http://npmjs.com/package/through) - clever shim for making a write function pipable
