QBuffer
=======

Very fast binary stream buffer, to be able to coalesce then re-split chunked binary data.
Handy for concatenated byte-counted binary or mixed text/binary data like BSON entities
or beanstalkd responses.  Reads over a million 200B lines per second from 50kB chunks.

For easier throttling and event loop control, QBuffer implements pull-based flow
control.  It buffers incoming data on write, but reading happens when
the code is ready for the data, not when the data happens to arrive.


Summary
-------

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


Methods
-------

### new QBuffer( opts )

Options:
- `encoding` - the default encoding to use, as set with `setEncoding()`
- `highWaterMark` - when to ask that input be throttled (TBD; placeholder)
- `lowWaterMark` - when to ask that input resume (TBD; placeholder)

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

### buf.read( nbytes [,encoding] )

Remove and return the next nbytes bytes from the buffer, or null if not that
many bytes available.  Returns a string converted with the given encoding
or specified with setEncoding(), else a Buffer if no encoding is in effect.

### buf.peekbytes( nbytes [,encoding] )

Just like read, but do not advance the read point.

### buf.indexOfChar( char, start )

Return the offset in the unread data of the first occurrence of char at
or after offset `start` in the data stream.

With this call getline() can be implemented as `buf.read(buf.indexOfChar("\n") + 1)`

### buf.setEncoding( encoding )

Specify how to encode the returned bytes, eg 'utf8' or 'base64'.  Setting an
encoding will cause strings to be read from the QBuffer.  To clear the encoding
in effect setEncoding to null.  The default is null, to return Buffer objects.

The setEncoding conversion in effect is used both for reading and when
data is written to the buffer.  The default encoding can be overridden call
by call in read() and write().

### buf.write( data [,encoding] [,callback(err, nbytes)] )

Append data to the buffer.  The data may be provided either as a string or in a
Buffer.  Strings are converted to bytes using the given encoding or that
specified by setEncoding.

Returns true if ready to buffer more data, false to throttle the input.  The
callback, if specified, will be called with the count of bytes (not characters)
appended.

### buf.pipeFrom( stream )

Write the data chunks emitted by the stream into the qbuffer with an on('data')
event listener.  This is a minor convenience; handling stream errors is still
up the caller.


A Note on Piping
----------------

Consume a stream with an on('data') event listener.  `qbuffer.pipeFrom(stream)`
does just that.  Stream errors must be handled by the caller.

Streams can not pipe directly to qbuffers with eg `stream.pipe(qbuffer)`.
One big benefit of piping is the built-in flow control and data throttling.
However, qbuffers help separate variable length records.  With variable-length
records, automatically pausing the input risks stopping the data flow before the
end of the current record is received; once paused, the end never will arrive.
This would cause deadlock.  Since only the application knows the record layout,
the flow can only be controlled from the application, not from the data stream.
Without flow control, a pipe is just a plain stream.


Todo
----

- more unit tests
- setDelimiter() method for user-specified record splitting
- indexOf() method


Related Work
------------

- [split](http://npmjs.com/package/split) - very fast regex-delimited text stream re-splitter
- [through](http://npmjs.com/package/through) - clever shim for making a write function pipable
